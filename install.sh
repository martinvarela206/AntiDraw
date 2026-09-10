#!/usr/bin/env bash
set -e

# AntiDraw Extension Build & Install Script (Bash / Linux / macOS)
# Automates environment verification, dependency installation, build, packaging,
# and installation of the AntiDraw VS Code extension.

# Color definitions
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
GREEN='\033[0;32m'
GRAY='\033[0;90m'
NC='\033[0m' # No Color

echo -e "${CYAN}=========================================${NC}"
echo -e "${CYAN} AntiDraw SVG Vector Editor - Installer ${NC}"
echo -e "${CYAN}=========================================${NC}"

# 1. Verify Prerequisites
echo -e "\n${YELLOW}[1/5] Verifying environment prerequisites...${NC}"

if ! command -v node >/dev/null 2>&1; then
    echo -e "${RED}Error: Node.js is not installed or not found in PATH. Please install Node.js.${NC}"
    exit 1
fi

if ! command -v pnpm >/dev/null 2>&1; then
    echo -e "${RED}Error: pnpm is not installed or not found in PATH.${NC}"
    echo -e "${YELLOW}You can install pnpm via: npm install -g pnpm or corepack enable${NC}"
    exit 1
fi

echo -e "${GRAY}Node.js: $(node -v)${NC}"
echo -e "${GRAY}pnpm:    $(pnpm -v)${NC}"

# 2. Install Project Dependencies
echo -e "\n${YELLOW}[2/5] Installing dependencies (pnpm install)...${NC}"
pnpm install

# 3. Compile Extension & Webview code
echo -e "\n${YELLOW}[3/5] Building extension and webview...${NC}"
pnpm run build

# 4. Package into .vsix
echo -e "\n${YELLOW}[4/5] Packaging extension into VSIX...${NC}"
pnpm run package

VSIX_FILE=$(ls -t antidraw-*.vsix 2>/dev/null | head -n 1 || true)
if [ -z "$VSIX_FILE" ] || [ ! -f "$VSIX_FILE" ]; then
    echo -e "${RED}Error: Could not find generated .vsix package!${NC}"
    exit 1
fi

# 5. Install into VS Code if command is available
echo -e "\n${GREEN}[5/5] Installing extension into VS Code...${NC}"
if command -v code >/dev/null 2>&1; then
    if code --install-extension "$VSIX_FILE" --force; then
        echo -e "\n${GREEN}[SUCCESS] AntiDraw extension ($VSIX_FILE) installed successfully!${NC}"
        echo -e "${GREEN}Reload or restart VS Code to activate changes.${NC}"
    else
        echo -e "\n${YELLOW}[WARNING] 'code --install-extension' returned a non-zero exit code.${NC}"
        echo -e "${YELLOW}You can manually install it via Extensions -> '...' -> 'Install from VSIX...' selecting: $(pwd)/$VSIX_FILE${NC}"
    fi
else
    echo -e "\n${YELLOW}[INFO] 'code' command not found in PATH.${NC}"
    echo -e "${CYAN}Generated VSIX: $(pwd)/$VSIX_FILE${NC}"
    echo -e "${YELLOW}You can manually install it in VS Code via Extensions -> '...' -> 'Install from VSIX...'.${NC}"
fi
