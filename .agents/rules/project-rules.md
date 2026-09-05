---
trigger: always_on
---

# Project Specific Rules

This file contains rules specific to the AntiPaint project. Rules are written in English to optimize context window efficiency and reduce token usage.

---

## Operational Execution

1. **Project Prompt Acknowledgment**:
   - Every response must explicitly include: `Project Prompt Loaded.` right after the Markdown Prompt acknowledgment.

---

## Semantic Versioning Scheme

2. **Strict Project Versioning Format (`MAJOR.MINOR.PATCH`)**:
   - **Bug Fixes / Corrections**: Increment only the patch version (`X.X.x+1`). The patch counter increments indefinitely (e.g., `0.1.9` -> `0.1.10` -> `0.1.100` -> `0.1.1000`) without rolling over into minor version.
   - **New Features / Functionality**: Increment only the minor version (`X.x+1.X`). The minor counter increments indefinitely without modifying the major version.
   - **User Explicit Milestone / Release Selection**: Only when explicitly requested by the user, increment the major version and reset lower components to zero (`x+1.0.0`).
3. **Mandatory VSIX Generation & Packaging**:
   - After completing code modifications and updating the project version, always build and package the extension into a `.vsix` artifact (`pnpm run package` / `vsce package --no-dependencies`).
4. **File-Specific Metadata Persistence**:
   - All extension configuration, editor state, and visual tool parameters directly associated with the edited SVG file (such as guide lines, ruler origin/positions, grid settings, etc.) must be automatically persisted to and loaded from the companion JSON metadata file associated with the SVG (`.json`).
5. **Atomic Task Execution & Commit Workflow**:
   - Apply fixes and features atomically and individually one by one.
   - Categorization: If a feature already exists partially or has functional defects, classify and implement it as a `fix`. If the capability did not exist previously, classify it as a `feat`.
   - For each completed item:
     - Remove or mark complete the corresponding item in `Docs/TODO.md`.
     - Bump the version in `package.json` (`patch` for fixes, `minor` for features).
     - Build and package the `.vsix` artifact (`pnpm run package`).
     - Commit the atomic change using simple format: `fix: <element or problem fixed>` or `feat: <new element or functionality added>`.
     - Update `Docs/Descripción de las herramientas.md` with any relevant functional details.
     - Provide a summary checklist of changes for user verification.

