# AntiDraw Extension Build & Install Script (PowerShell)

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host " Building AntiDraw SVG Vector Editor... " -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan

# 1. Compile Extension & Webview code
pnpm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "Error: Build failed!" -ForegroundColor Red
    exit 1
}

# 2. Package into .vsix
Write-Host "`nPackaging extension into VSIX..." -ForegroundColor Yellow
pnpm dlx @vscode/vsce package --no-dependencies -o antidraw-0.1.4.vsix

if (-not (Test-Path "antidraw-0.1.4.vsix")) {
    Write-Host "Error: Could not generate antidraw-0.1.4.vsix!" -ForegroundColor Red
    exit 1
}

# 3. Install into VS Code if command is available
Write-Host "`nInstalling extension into VS Code..." -ForegroundColor Green
if (Get-Command "code" -ErrorAction SilentlyContinue) {
    code --install-extension antidraw-0.1.4.vsix --force
    Write-Host "`n[SUCCESS] Extension installed in VS Code! Restart or reload VS Code window to use." -ForegroundColor Green
} else {
    Write-Host "`n[INFO] VSIX package generated: antidraw-0.1.4.vsix" -ForegroundColor Yellow
    Write-Host "You can manually install it in VS Code via Extensions -> '...' -> 'Install from VSIX...'." -ForegroundColor Yellow
}
