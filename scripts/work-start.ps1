param(
    [switch]$NoPull
)

$ErrorActionPreference = "Stop"

function Fail($Message) {
    Write-Host ""
    Write-Host "STOP: $Message" -ForegroundColor Red
    exit 1
}

$repoRoot = git rev-parse --show-toplevel 2>$null
if (-not $repoRoot) {
    Fail "This folder is not inside a Git repository."
}

Set-Location $repoRoot

$branch = git branch --show-current
$machine = $env:COMPUTERNAME
$status = git status --porcelain

Write-Host ""
Write-Host "LOCAL BRAIN // SESSION START" -ForegroundColor Cyan
Write-Host "Machine : $machine"
Write-Host "Repo    : $repoRoot"
Write-Host "Branch  : $branch"

if ($status) {
    Write-Host ""
    Write-Host "Local changes detected:" -ForegroundColor Yellow
    git status --short
    Fail "Refusing to pull over local changes. Commit, stash, or resolve them first."
}

if (-not $NoPull) {
    Write-Host ""
    Write-Host "Syncing safely with remote..." -ForegroundColor Cyan
    git fetch --prune

    git rev-parse --abbrev-ref "@{upstream}" *> $null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "No upstream is configured for '$branch'. Skipping pull." -ForegroundColor Yellow
    }
    else {
        git pull --ff-only
        if ($LASTEXITCODE -ne 0) {
            Fail "Fast-forward pull failed. Resolve branch divergence before working."
        }
    }
}

$nowFile = Join-Path $repoRoot ".localbrain\NOW.md"
if (Test-Path $nowFile) {
    Write-Host ""
    Write-Host "CURRENT STATE" -ForegroundColor Cyan
    Write-Host "-------------"
    Get-Content $nowFile
}
else {
    Write-Host ""
    Write-Host "No .localbrain\NOW.md found." -ForegroundColor Yellow
}

$sessionsDir = Join-Path $repoRoot ".localbrain\sessions"
if (Test-Path $sessionsDir) {
    $latest = Get-ChildItem $sessionsDir -File -Filter "*.md" |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 1

    if ($latest) {
        Write-Host ""
        Write-Host "LATEST SESSION: $($latest.Name)" -ForegroundColor Cyan
        Write-Host "-------------------------------"
        Get-Content $latest.FullName
    }
}

Write-Host ""
Write-Host "Ready. Tell the agent: Start session. Follow the Local Brain protocol." -ForegroundColor Green
