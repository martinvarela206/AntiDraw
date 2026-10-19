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

set "VSIX_FILE="
for /f "delims=" %%F in ('dir /b /o-d antidraw-*.vsix 2^>nul') do (
    set "VSIX_FILE=%%F"
    goto :found_vsix
)
:found_vsix

if "%VSIX_FILE%"=="" (
    echo Error: Could not find generated .vsix package!
    exit /b 1
)

echo.
echo Installing extension (%VSIX_FILE%) into VS Code...
where code >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    code --install-extension %VSIX_FILE% --force
    echo.
    echo [SUCCESS] Extension (%VSIX_FILE%) installed in VS Code! Restart or reload VS Code window to use.
) else (
    echo.
    echo [INFO] VSIX package generated: %VSIX_FILE%
    echo You can manually install it in VS Code via Extensions menu -^> 'Install from VSIX...'.
)
