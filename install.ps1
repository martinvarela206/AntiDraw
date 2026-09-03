<#
.SYNOPSIS
    AntiDraw Extension Build & Install Script (PowerShell)

.DESCRIPTION
    Automates environment verification, dependency installation, build, packaging,
    and installation of the AntiDraw VS Code extension.

.EXAMPLE
    # Execute bypassing ExecutionPolicy restrictions directly from terminal:
    powershell -ExecutionPolicy Bypass -File .\install.ps1

    # Or inside an existing PowerShell console session:
    Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
    .\install.ps1
#>

# Ensure script halts on unhandled terminating errors
$ErrorActionPreference = "Stop"

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host " AntiDraw SVG Vector Editor - Installer " -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan

# 1. Verify Prerequisites
Write-Host "`n[1/5] Verifying environment prerequisites..." -ForegroundColor Yellow

if (-not (Get-Command "node" -ErrorAction SilentlyContinue)) {
    Write-Host "Error: Node.js is not installed or not found in PATH. Please install Node.js." -ForegroundColor Red
    exit 1
}

if (-not (Get-Command "pnpm" -ErrorAction SilentlyContinue)) {
    Write-Host "Error: pnpm is not installed or not found in PATH." -ForegroundColor Red
    Write-Host "You can install pnpm via: npm install -g pnpm or corepack enable" -ForegroundColor Yellow
    exit 1
}

Write-Host "Node.js: $((node -v).Trim())" -ForegroundColor DarkGray
Write-Host "pnpm:    $((pnpm -v).Trim())" -ForegroundColor DarkGray

# 2. Install Project Dependencies
Write-Host "`n[2/5] Installing dependencies (pnpm install)..." -ForegroundColor Yellow
& pnpm install
if ($LASTEXITCODE -ne 0) {
    Write-Host "Error: 'pnpm install' failed!" -ForegroundColor Red
    exit 1
}

# 3. Compile Extension & Webview code
Write-Host "`n[3/5] Building extension and webview..." -ForegroundColor Yellow
& pnpm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "Error: Build failed!" -ForegroundColor Red
    exit 1
}

# 4. Package into .vsix
Write-Host "`n[4/5] Packaging extension into VSIX..." -ForegroundColor Yellow
& pnpm run package
if ($LASTEXITCODE -ne 0) {
    Write-Host "Error: Packaging failed!" -ForegroundColor Red
    exit 1
}

$vsixFile = Get-ChildItem -Filter "antidraw-*.vsix" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $vsixFile) {
    Write-Host "Error: Could not find generated .vsix package!" -ForegroundColor Red
    exit 1
}

# 5. Install into VS Code if command is available
Write-Host "`n[5/5] Installing extension into VS Code..." -ForegroundColor Green
if (Get-Command "code" -ErrorAction SilentlyContinue) {
    & code --install-extension $vsixFile.FullName --force
    if ($LASTEXITCODE -eq 0) {
        Write-Host "`n[SUCCESS] AntiDraw extension ($($vsixFile.Name)) installed successfully!" -ForegroundColor Green
        Write-Host "Reload or restart VS Code to activate changes." -ForegroundColor Green
    } else {
        Write-Host "`n[WARNING] 'code --install-extension' returned exit code $LASTEXITCODE." -ForegroundColor Yellow
        Write-Host "You can manually install it via Extensions -> '...' -> 'Install from VSIX...' selecting: $($vsixFile.FullName)" -ForegroundColor Yellow
    }
} else {
    Write-Host "`n[INFO] 'code' command not found in PATH." -ForegroundColor Yellow
    Write-Host "Generated VSIX: $($vsixFile.FullName)" -ForegroundColor Cyan
    Write-Host "You can manually install it in VS Code via Extensions -> '...' -> 'Install from VSIX...'." -ForegroundColor Yellow
}
