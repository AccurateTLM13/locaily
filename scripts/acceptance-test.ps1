<#
.SYNOPSIS
    Locaily v1 Acceptance Test — validates Locaily on a clean or fresh machine.

.DESCRIPTION
    Automates the full acceptance flow: install, server start, health check,
    Lighthouse Handoff task execution, evidence record verification, and cleanup.

    Steps:
      1. Run install-windows.ps1 (skipped with -SkipInstall)
      2. Start the companion server as a background job
      3. Poll GET /health until ok:true or timeout
      4. POST a Lighthouse Handoff to /tasks/run
      5. Verify the response has ok:true and a non-null result
      6. Check that data/evidence/track-run-records/ contains a new .json file
      7. Stop the server background job
      8. Print PASS/FAIL summary

.PARAMETER ServerPort
    Port the companion server listens on. Default: 31313.

.PARAMETER Model
    Ollama model name to use for the Lighthouse Handoff task. Default: llama3.2.

.PARAMETER SkipInstall
    When set, skips step 1 (install-windows.ps1). Useful for re-runs on the
    same machine where dependencies are already installed.

.PARAMETER LighthouseUrl
    URL to send in the Lighthouse Handoff test request. Default: https://example.com.

.PARAMETER TimeoutSec
    Maximum seconds to wait for the server health endpoint to report ok:true.
    Default: 120.

.EXAMPLE
    .\scripts\acceptance-test.ps1
    Runs the full acceptance test including install.

.EXAMPLE
    .\scripts\acceptance-test.ps1 -SkipInstall
    Skips the install step and starts from server launch.

.EXAMPLE
    .\scripts\acceptance-test.ps1 -ServerPort 31314 -TimeoutSec 60
    Uses a custom port and shorter timeout.
#>

[CmdletBinding()]
param(
    [int]$ServerPort = 31313,
    [string]$Model = "llama3.2",
    [switch]$SkipInstall,
    [string]$LighthouseUrl = "https://example.com",
    [int]$TimeoutSec = 120
)

$ErrorActionPreference = "Stop"

# Resolve the repository root (parent of scripts/)
$repoRoot = Split-Path -Parent $PSScriptRoot

# --- Banner ---
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Locaily v1 Acceptance Test" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Server port : $ServerPort"
Write-Host "  Model       : $Model"
Write-Host "  Lighthouse  : $LighthouseUrl"
Write-Host "  Timeout     : ${TimeoutSec}s"
Write-Host "  Skip install: $SkipInstall"
Write-Host ""

# Track step results for the final summary. Each entry: @{ Name; Status; Detail }
$stepResults = @()
$failedStep = $null
$serverJob = $null

function Write-Step {
    param([string]$Label, [string]$Message, [string]$Color = "White")
    Write-Host "  $Label " -NoNewline
    Write-Host $Message -ForegroundColor $Color
}

function Record-Step {
    param([string]$Name, [string]$Status, [string]$Detail = "")
    $script:stepResults += @{ Name = $Name; Status = $Status; Detail = $Detail }
    if ($Status -eq "FAIL") {
        $script:failedStep = $Name
    }
}

try {
    # =====================================================================
    # Step 1: Install (unless -SkipInstall)
    # =====================================================================
    $totalSteps = 8
    $stepNum = 1

    if (-not $SkipInstall) {
        Write-Host "[$stepNum/$totalSteps] Running install-windows.ps1..."
        $installScript = Join-Path $repoRoot "scripts" "install-windows.ps1"
        if (-not (Test-Path $installScript)) {
            Record-Step "Install" "FAIL" "install-windows.ps1 not found at $installScript"
            throw "install-windows.ps1 not found at $installScript"
        }
        try {
            & $installScript
            if ($LASTEXITCODE -ne 0) {
                Record-Step "Install" "FAIL" "install-windows.ps1 exited with code $LASTEXITCODE"
                throw "install-windows.ps1 failed (exit code $LASTEXITCODE)"
            }
            Record-Step "Install" "PASS"
            Write-Step "[$stepNum/$totalSteps]" "PASS" "Green"
        } catch {
            Record-Step "Install" "FAIL" $_.Exception.Message
            Write-Step "[$stepNum/$totalSteps]" "FAIL - $($_.Exception.Message)" "Red"
            throw
        }
    } else {
        Write-Host "[$stepNum/$totalSteps] Skipping install (-SkipInstall set)"
        Record-Step "Install" "SKIP" "-SkipInstall"
        Write-Step "[$stepNum/$totalSteps]" "SKIP" "Yellow"
    }

    # =====================================================================
    # Step 2: Start the server as a background job
    # =====================================================================
    $stepNum = 2
    Write-Host "[$stepNum/$totalSteps] Starting companion server..."
    $serverScript = Join-Path $repoRoot "companion" "server.js"
    if (-not (Test-Path $serverScript)) {
        Record-Step "Start Server" "FAIL" "companion/server.js not found"
        throw "companion/server.js not found at $serverScript"
    }

    # Use Start-Job so we can monitor and clean it up reliably.
    # The job runs node companion/server.js from the repo root.
    $serverJob = Start-Job -ScriptBlock {
        param($Root, $Port)
        $env:LOCAL_AI_PORT = "$Port"
        Set-Location $Root
        & node companion/server.js 2>&1
    } -ArgumentList $repoRoot, $ServerPort

    if (-not $serverJob -or $serverJob.State -eq "Failed") {
        Record-Step "Start Server" "FAIL" "Start-Job returned no valid job"
        throw "Failed to start server background job"
    }
    Record-Step "Start Server" "PASS" "Job ID: $($serverJob.Id)"
    Write-Step "[$stepNum/$totalSteps]" "PASS (Job ID: $($serverJob.Id))" "Green"

    # =====================================================================
    # Step 3: Poll GET /health until ok:true or timeout
    # =====================================================================
    $stepNum = 3
    Write-Host "[$stepNum/$totalSteps] Polling health endpoint (timeout: ${TimeoutSec}s)..."
    $healthUrl = "http://127.0.0.1:$ServerPort/health"
    $healthOk = $false
    $elapsed = 0
    $pollInterval = 2

    while ($elapsed -lt $TimeoutSec) {
        # Check if the job died unexpectedly
        if ($serverJob.State -eq "Failed" -or $serverJob.State -eq "Completed") {
            $jobOutput = Receive-Job -Job $serverJob -ErrorAction SilentlyContinue
            Record-Step "Health Check" "FAIL" "Server job exited early (state: $($serverJob.State))"
            throw "Server job exited early (state: $($serverJob.State)). Output: $jobOutput"
        }

        try {
            $healthResponse = Invoke-RestMethod -Uri $healthUrl -Method Get -TimeoutSec 3 -ErrorAction Stop
            if ($healthResponse.ok -eq $true) {
                $healthOk = $true
                break
            }
        } catch {
            # Server not ready yet — this is expected during startup
        }

        Start-Sleep -Seconds $pollInterval
        $elapsed += $pollInterval
    }

    if (-not $healthOk) {
        Record-Step "Health Check" "FAIL" "Health endpoint did not report ok:true within ${TimeoutSec}s"
        throw "Health endpoint did not report ok:true within ${TimeoutSec}s"
    }
    Record-Step "Health Check" "PASS" "ok:true after ~${elapsed}s"
    Write-Step "[$stepNum/$totalSteps]" "PASS (ok:true after ~${elapsed}s)" "Green"

    # =====================================================================
    # Step 4: POST Lighthouse Handoff to /tasks/run
    # =====================================================================
    $stepNum = 4
    Write-Host "[$stepNum/$totalSteps] Running Lighthouse Handoff task..."
    $tasksUrl = "http://127.0.0.1:$ServerPort/tasks/run"
    $taskBody = @{
        tool  = "lighthouse-handoff"
        task  = "analyze-report"
        input = @{
            url            = $LighthouseUrl
            scores         = @{
                performance      = 65
                accessibility    = 82
                "best-practices" = 90
                seo              = 85
            }
            opportunities  = @()
            diagnostics    = @()
        }
    } | ConvertTo-Json -Depth 5

    $lighthouseResponse = $null
    try {
        $lighthouseResponse = Invoke-RestMethod -Uri $tasksUrl -Method Post `
            -ContentType "application/json" `
            -Body $taskBody `
            -TimeoutSec 60 `
            -ErrorAction Stop
    } catch {
        Record-Step "Lighthouse Handoff" "FAIL" "HTTP request failed: $($_.Exception.Message)"
        throw "Lighthouse Handoff request failed: $($_.Exception.Message)"
    }

    # =====================================================================
    # Step 5: Verify response has ok:true and non-null result
    # =====================================================================
    $stepNum = 5
    Write-Host "[$stepNum/$totalSteps] Verifying Lighthouse Handoff response..."
    if (-not $lighthouseResponse -or $lighthouseResponse.ok -ne $true) {
        $errMsg = if ($lighthouseResponse -and $lighthouseResponse.error) {
            $lighthouseResponse.error.message
        } else {
            "Response ok is not true"
        }
        Record-Step "Verify Response" "FAIL" $errMsg
        throw "Lighthouse Handoff response validation failed: $errMsg"
    }
    if ($null -eq $lighthouseResponse.result) {
        Record-Step "Verify Response" "FAIL" "result is null"
        throw "Lighthouse Handoff response result is null"
    }
    Record-Step "Verify Response" "PASS" "ok:true with non-null result"
    Write-Step "[$stepNum/$totalSteps]" "PASS" "Green"

    # =====================================================================
    # Step 6: Check evidence records directory for a new .json file
    # The track-run-record-store writes to data/evidence/track-run-records/
    # relative to the repository root.
    # =====================================================================
    $stepNum = 6
    Write-Host "[$stepNum/$totalSteps] Checking evidence records..."
    $evidenceDir = Join-Path $repoRoot "data" "evidence" "track-run-records"

    # Give the server a moment to flush the record to disk
    Start-Sleep -Seconds 2

    $evidenceFound = $false
    if (Test-Path $evidenceDir) {
        $evidenceFiles = Get-ChildItem -LiteralPath $evidenceDir -Filter "*.json" -ErrorAction SilentlyContinue
        if ($evidenceFiles -and $evidenceFiles.Count -gt 0) {
            $evidenceFound = $true
            Record-Step "Evidence Records" "PASS" "$($evidenceFiles.Count) record(s) found"
            Write-Step "[$stepNum/$totalSteps]" "PASS ($($evidenceFiles.Count) record(s))" "Green"
        }
    }

    if (-not $evidenceFound) {
        Record-Step "Evidence Records" "FAIL" "No .json files found in $evidenceDir"
        throw "No evidence records found in $evidenceDir"
    }

    # =====================================================================
    # Step 7: Stop the server background job
    # =====================================================================
    $stepNum = 7
    Write-Host "[$stepNum/$totalSteps] Stopping server..."
    try {
        # Stop-Job terminates the background job; Remove-Job cleans it up
        Stop-Job -Job $serverJob -ErrorAction SilentlyContinue
        Remove-Job -Job $serverJob -Force -ErrorAction SilentlyContinue
        $serverJob = $null
        Record-Step "Stop Server" "PASS"
        Write-Step "[$stepNum/$totalSteps]" "PASS" "Green"
    } catch {
        # If Stop-Job fails, try harder — find the node process by port
        Write-Host "  Warning: Stop-Job failed, attempting process cleanup..." -ForegroundColor Yellow
        try {
            $connections = Get-NetTCPConnection -LocalPort $ServerPort -ErrorAction SilentlyContinue
            if ($connections) {
                $pids = $connections | Select-Object -ExpandProperty OwningProcess -Unique
                foreach ($pid in $pids) {
                    Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
                }
            }
            # Clean up the job object even if Stop-Job failed
            Remove-Job -Job $serverJob -Force -ErrorAction SilentlyContinue
            $serverJob = $null
            Record-Step "Stop Server" "PASS" "Cleaned up via process kill"
            Write-Step "[$stepNum/$totalSteps]" "PASS (via process cleanup)" "Green"
        } catch {
            Record-Step "Stop Server" "FAIL" $_.Exception.Message
            Write-Step "[$stepNum/$totalSteps]" "FAIL - $($_.Exception.Message)" "Red"
        }
    }

    # =====================================================================
    # Step 8: Print summary
    # =====================================================================
    $stepNum = 8
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "  Acceptance Test Summary" -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host ""

    $allPassed = $true
    foreach ($step in $stepResults) {
        $statusColor = switch ($step.Status) {
            "PASS" { "Green" }
            "FAIL" { "Red" }
            "SKIP" { "Yellow" }
            default { "White" }
        }
        $detail = if ($step.Detail) { " ($($step.Detail))" } else { "" }
        Write-Host "  $($step.Name): " -NoNewline
        Write-Host "$($step.Status)$detail" -ForegroundColor $statusColor
        if ($step.Status -eq "FAIL") { $allPassed = $false }
    }

    Write-Host ""
    if ($allPassed) {
        Write-Host "  RESULT: PASS" -ForegroundColor Green
        Write-Host "  All acceptance checks passed." -ForegroundColor Green
        Write-Host ""
        exit 0
    } else {
        Write-Host "  RESULT: FAIL" -ForegroundColor Red
        Write-Host "  Failed at step: $failedStep" -ForegroundColor Red
        Write-Host ""
        exit 1
    }

} catch {
    # --- Global error handler ---
    # Ensure the server job is cleaned up even on unexpected errors
    if ($serverJob) {
        try {
            Stop-Job -Job $serverJob -ErrorAction SilentlyContinue
            Remove-Job -Job $serverJob -Force -ErrorAction SilentlyContinue
        } catch {
            # Best-effort cleanup
        }
    }

    Write-Host ""
    Write-Host "========================================" -ForegroundColor Red
    Write-Host "  ACCEPTANCE TEST FAILED" -ForegroundColor Red
    Write-Host "========================================" -ForegroundColor Red
    Write-Host ""
    Write-Host "  Error: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""

    # Print partial summary if we have any step results
    if ($stepResults.Count -gt 0) {
        Write-Host "  Partial results:" -ForegroundColor Yellow
        foreach ($step in $stepResults) {
            $statusColor = switch ($step.Status) {
                "PASS" { "Green" }
                "FAIL" { "Red" }
                "SKIP" { "Yellow" }
                default { "White" }
            }
            Write-Host "    $($step.Name): " -NoNewline
            Write-Host "$($step.Status)" -ForegroundColor $statusColor
        }
        Write-Host ""
    }

    exit 1
}
