$ErrorActionPreference = "Stop"

function Warn($Message) {
    Write-Host "WARNING: $Message" -ForegroundColor Yellow
}

function Fail($Message) {
    Write-Host ""
    Write-Host "NOT READY TO SWITCH: $Message" -ForegroundColor Red
    exit 1
}

$repoRoot = git rev-parse --show-toplevel 2>$null
if (-not $repoRoot) {
    Fail "This folder is not inside a Git repository."
}

Set-Location $repoRoot

$branch = git branch --show-current
$machine = $env:COMPUTERNAME

Write-Host ""
Write-Host "LOCAL BRAIN // HANDOFF CHECK" -ForegroundColor Cyan
Write-Host "Machine : $machine"
Write-Host "Repo    : $repoRoot"
Write-Host "Branch  : $branch"

$status = git status --porcelain
if ($status) {
    Write-Host ""
    Write-Host "Uncommitted files:" -ForegroundColor Yellow
    git status --short
    Fail "There is work that exists only on this computer. Ask the agent to complete the handoff, commit it, or intentionally stash it."
}

git fetch --prune

$upstream = git rev-parse --abbrev-ref "@{upstream}" 2>$null
if (-not $upstream) {
    Fail "Current branch '$branch' has no upstream. Push it before switching computers."
}

$counts = git rev-list --left-right --count "$upstream...HEAD"
if ($LASTEXITCODE -ne 0) {
    Fail "Could not compare this branch with its upstream."
}

$parts = ($counts -split "\s+")
$behind = [int]$parts[0]
$ahead = [int]$parts[1]

Write-Host ""
Write-Host "Remote comparison:"
Write-Host "Behind : $behind"
Write-Host "Ahead  : $ahead"

if ($behind -gt 0) {
    Fail "This branch is behind its remote. Synchronize before switching."
}

if ($ahead -gt 0) {
    Fail "There are $ahead commit(s) that have not been pushed."
}

$nowFile = Join-Path $repoRoot ".localbrain\NOW.md"
if (-not (Test-Path $nowFile)) {
    Warn ".localbrain\NOW.md does not exist."
}
else {
    $age = (Get-Date) - (Get-Item $nowFile).LastWriteTime
    if ($age.TotalHours -gt 12) {
        Warn "NOW.md has not been modified in more than 12 hours. Verify the agent updated the handoff state."
    }
}

$head = git rev-parse --short HEAD

Write-Host ""
Write-Host "HANDOFF READY" -ForegroundColor Green
Write-Host "Branch      : $branch"
Write-Host "Remote      : $upstream"
Write-Host "Last commit : $head"
Write-Host "Working tree: clean"
Write-Host "Push status : synchronized"
Write-Host ""
Write-Host "You can move to the other computer and run:"
Write-Host "  .\scripts\work-start.ps1" -ForegroundColor Cyan
