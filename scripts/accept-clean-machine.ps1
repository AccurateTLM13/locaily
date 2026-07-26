<#
.SYNOPSIS
  Clean-machine acceptance test for Locaily on Windows.
  Validates that a fresh clone produces a working first-run experience.
.DESCRIPTION
  Tests: Node detection, npm install, config generation, server start,
  health endpoint, demo run, graceful stop.
  Designed to run on a machine with Node.js 18+ and (optionally) Ollama.
#>

$ErrorActionPreference = "Stop"
$testRoot = Split-Path -Parent $PSScriptRoot
$passed = 0
$failed = 0

function Check($name, $cond) {
  if ($cond) { $global:passed += 1; Write-Host "  PASS: $name" -ForegroundColor Green }
  else { $global:failed += 1; Write-Host "  FAIL: $name" -ForegroundColor Red }
}

Write-Host "=== Locaily Clean-Machine Acceptance Test ===" -ForegroundColor Cyan
Write-Host ""

# 1. Check Node.js
Write-Host "[1] Checking Node.js..."
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
Check "Node.js is on PATH" ($null -ne $nodeCmd)
if ($nodeCmd) {
  $v = & node --version
  $major = [int]($v -replace '^v', '' -replace '\..*', '')
  Check "Node.js version 18+ (found $v)" ($major -ge 18)
}

# 2. Check npm install
Write-Host "[2] Checking dependencies..."
$nm = Join-Path $testRoot "node_modules"
$hasLock = Test-Path (Join-Path $nm ".package-lock.json")
$knownDep = Test-Path (Join-Path (Join-Path $nm "consola") "package.json")
$hasDeps = $hasLock -and $knownDep
if (-not $hasDeps) {
  Write-Host "  Dependencies not installed or incomplete. Run install-windows.ps1 first." -ForegroundColor Yellow
  Check "node_modules fully installed" $false
} else {
  Check "node_modules fully installed" $true
}

# 3. Check config
Write-Host "[3] Checking config..."
$configPath = Join-Path (Join-Path $testRoot "companion") "config.json"
Check "companion/config.json exists" (Test-Path $configPath)

# 4. Check key source files
Write-Host "[4] Checking source files..."
Check "companion/server.js exists" (Test-Path (Join-Path (Join-Path $testRoot "companion") "server.js"))
Check "companion/shell/index.html exists" (Test-Path (Join-Path (Join-Path (Join-Path $testRoot "companion") "shell") "index.html"))
Check "companion/console/index.html exists" (Test-Path (Join-Path (Join-Path (Join-Path $testRoot "companion") "console") "index.html"))

# 5. Quick server smoke test
Write-Host "[5] Running server smoke test..."
$serverStarted = $false
$serverProcess = $null
try {
  $serverProcess = Start-Process -PassThru -NoNewWindow -FilePath "node" -ArgumentList (Join-Path (Join-Path $testRoot "companion") "server.js")
  for ($i = 0; $i -lt 20; $i++) {
    Start-Sleep -Seconds 1
    try {
      $health = Invoke-WebRequest -Uri "http://127.0.0.1:31313/health" -UseBasicParsing -TimeoutSec 2 -ErrorAction SilentlyContinue
      if ($health.StatusCode -eq 200) { $serverStarted = $true; break }
    } catch {}
  }
  Check "Server starts and reports healthy" $serverStarted
  if ($serverStarted) {
    $healthJson = $health.Content | ConvertFrom-Json
    Check "Health response has version" ($null -ne $healthJson.version)
    Check "Health response has status=running" ($healthJson.status -eq "running")
    # Check shell
    try {
      $shell = Invoke-WebRequest -Uri "http://127.0.0.1:31313/" -UseBasicParsing
      Check "GET / returns shell HTML" ($shell.Content -match "shell-nav")
    } catch { Check "GET / returns shell HTML" $false }
    # Check demo
    try {
      $demoRes = Invoke-WebRequest -Uri "http://127.0.0.1:31313/console/demo" -UseBasicParsing
      $demo = $demoRes.Content | ConvertFrom-Json
      Check "GET /console/demo reports demo available" ($demo.demoAvailable -eq $true)
    } catch { Check "GET /console/demo reports demo available" $false }
  }
} catch {
  Check "Server starts and reports healthy" $false
} finally {
  if ($serverProcess -and !$serverProcess.HasExited) { $serverProcess.Kill() }
}

# 6. Check install script
Write-Host "[6] Checking install script..."
$installScript = Join-Path (Join-Path $testRoot "scripts") "install-windows.ps1"
Check "install-windows.ps1 exists" (Test-Path $installScript)

# 7. Check start script
Write-Host "[7] Checking start script..."
$startScript = Join-Path (Join-Path $testRoot "scripts") "start-locaily.ps1"
Check "start-locaily.ps1 exists" (Test-Path $startScript)

Write-Host ""
Write-Host "=== Results: $passed passed, $failed failed ===" -ForegroundColor Cyan
if ($failed -gt 0) { exit 1 }
