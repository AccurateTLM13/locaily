$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$configExamplePath = Join-Path $repoRoot "config.example.json"
$configTargetPath = Join-Path (Join-Path $repoRoot "companion") "config.json"

Write-Host "=== Locaily Windows Install ==="
Write-Host ""

# --- 1. Check Node.js >= 18 ---
Write-Host "[1/4] Checking Node.js..."
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host ""
  Write-Host "ERROR: Node.js was not found on PATH." -ForegroundColor Red
  Write-Host "Install Node.js 18 or newer from https://nodejs.org/ and try again."
  exit 1
}

$nodeVersionRaw = & node --version
$nodeVersion = [version]($nodeVersionRaw -replace '^v', '')
if ($nodeVersion.Major -lt 18) {
  Write-Host ""
  Write-Host "ERROR: Node.js $nodeVersionRaw found, but >= 18 is required." -ForegroundColor Red
  Write-Host "Upgrade Node.js from https://nodejs.org/ and try again."
  exit 1
}
Write-Host "  Node.js $nodeVersionRaw OK"

# --- 2. npm install ---
Write-Host "[2/4] Installing dependencies (npm install)..."
Push-Location $repoRoot
try {
  $npmCmd = Get-Command npm.cmd -ErrorAction SilentlyContinue
  if ($npmCmd) {
    & npm.cmd install
  } else {
    & npm install
  }
  if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "ERROR: npm install failed (exit code $LASTEXITCODE)." -ForegroundColor Red
    exit 1
  }
  Write-Host "  Dependencies installed."
} finally {
  Pop-Location
}

# --- 3. Create companion/config.json from example if missing ---
Write-Host "[3/4] Checking runtime config..."
if (Test-Path $configTargetPath) {
  Write-Host "  companion/config.json already exists; leaving it untouched."
} else {
  if (-not (Test-Path $configExamplePath)) {
    Write-Host ""
    Write-Host "ERROR: config.example.json not found at $configExamplePath" -ForegroundColor Red
    exit 1
  }
  # Strip //-style line comments from config.example.json before writing.
  # The regex matches only lines where // is preceded by whitespace or is at
  # start-of-line, so "//" inside string values (e.g. "http://…") is preserved.
  $rawContent = Get-Content -LiteralPath $configExamplePath -Raw -Encoding UTF8
  $strippedContent = $rawContent -replace '(?m)^[ \t]*//.*$', ''
  [System.IO.File]::WriteAllText($configTargetPath, $strippedContent, [System.Text.UTF8Encoding]::new($false))
  Write-Host "  Created companion/config.json from config.example.json (comments stripped)"
}

# --- 4. Check Ollama reachability (warn, do not abort) ---
Write-Host "[4/4] Checking Ollama at http://127.0.0.1:11434..."
$ollamaOk = $false
try {
  $response = Invoke-WebRequest -Uri "http://127.0.0.1:11434" -UseBasicParsing -TimeoutSec 3
  if ($response.StatusCode -eq 200) {
    $ollamaOk = $true
  }
} catch {
  $ollamaOk = $false
}

if ($ollamaOk) {
  Write-Host "  Ollama is reachable."
} else {
  Write-Host "  WARNING: Ollama is not reachable at http://127.0.0.1:11434" -ForegroundColor Yellow
  Write-Host "  This is OK if Ollama runs on another machine or has not been installed yet."
  Write-Host "  Install Ollama from https://ollama.com/ and pull a model when ready."
}

# --- Summary ---
Write-Host ""
Write-Host "=== Install complete ==="
Write-Host ""
Write-Host "Next steps:"
Write-Host "  1. Pull a model:       ollama pull llama3.2"
Write-Host "  2. Start the server:   .\start-windows.bat"
Write-Host "                       or .\start-dev.ps1"
Write-Host "  3. Run smoke test:     node scripts\smoke-test.js"
Write-Host ""
