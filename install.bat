@echo off
echo =========================================
echo  Building AntiDraw SVG Vector Editor...
echo =========================================

call pnpm run build
if %ERRORLEVEL% NEQ 0 (
    echo Error: Build failed!
    exit /b %ERRORLEVEL%
)

echo.
echo Packaging extension into VSIX...
call pnpm run package

if not exist antidraw-0.5.0.vsix (
    echo Error: Could not generate antidraw-0.5.0.vsix!
    exit /b 1
)

echo.
echo Installing extension into VS Code...
where code >nul 2>null
if %ERRORLEVEL% EQU 0 (
    code --install-extension antidraw-0.5.0.vsix --force
    echo.
    echo [SUCCESS] Extension installed in VS Code! Restart or reload VS Code window to use.
) else (
    echo.
    echo [INFO] VSIX package generated: antidraw-0.5.0.vsix
    echo You can manually install it in VS Code via Extensions menu -> 'Install from VSIX...'.
)
