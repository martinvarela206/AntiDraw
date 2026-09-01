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
pnpm run package

$vsixFile = Get-ChildItem -Filter "antidraw-*.vsix" | Sort-Object LastWriteTime -Descending | Select-Object -First 1

if (-not $vsixFile) {
    Write-Host "Error: Could not find generated .vsix package!" -ForegroundColor Red
    exit 1
}

# 3. Install into VS Code if command is available
Write-Host "`nInstalling extension into VS Code..." -ForegroundColor Green
if (Get-Command "code" -ErrorAction SilentlyContinue) {
    code --install-extension $vsixFile.Name --force
    Write-Host "`n[SUCCESS] Extension installed in VS Code! Restart or reload VS Code window to use." -ForegroundColor Green
} else {
    Write-Host "`n[INFO] VSIX package generated: $($vsixFile.Name)" -ForegroundColor Yellow
    Write-Host "You can manually install it in VS Code via Extensions -> '...' -> 'Install from VSIX...'." -ForegroundColor Yellow
}
