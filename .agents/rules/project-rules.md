---
trigger: always_on
---

# Project Specific Rules

This file contains rules specific to the AntiDraw project. Rules are written in English to optimize context window efficiency and reduce token usage.

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
   - After completing code modifications and updating the project version for each atomic item, always build and package the extension into a `.vsix` artifact (`pnpm run package` / `vsce package --no-dependencies`).
4. **File-Specific Metadata Persistence**:
   - All extension configuration, editor state, and visual tool parameters directly associated with the edited SVG file (such as guide lines, ruler origin/positions, grid settings, etc.) must be automatically persisted to and loaded from the companion JSON metadata file associated with the SVG (`.json`).

---

## Architectural Componentization & Proactive Refactoring

5. **Strict Componentization & Refactoring Prioritization**:
   - Every feature, UI panel, tool handler, and engine subsystem must remain strictly modular and componentized.
   - If any component, class, or handler grows too large, acquires excessive complexity, or violates single-responsibility principles, a dedicated refactoring task MUST immediately be added and prioritized at the top of `Docs/TODO.md`.

---

## Multi-Item Prompt Decomposition & Atomic Loop Execution

6. **Dynamic Task Ingestion into `Docs/TODO.md`**:
   - Whenever a user prompt mentions, enumerates, or identifies problems, bugs, corrections, missing functionality, or new features, these items MUST immediately be cataloged and added to `Docs/TODO.md` before execution.

7. **Mandatory Decomposition of Multi-Item Prompts**:
   - Whenever the prompt or active TODO list contains multiple tasks, bullet points, fixes, additions, or removals (2 or more distinct items):
     - **NEVER** bundle, combine, or resolve multiple items together in a single step, file edit block, version bump, or commit.
     - You MUST immediately decompose the work into an ordered list of individual, discrete items.
     - Evaluate and classify each item individually before executing it:
       - If the feature already exists partially, or has defects/modifications: classify as `fix`.
       - If the capability is completely new and did not exist before: classify as `feat`.

8. **Strict Sequential Atomic Execution Loop**:
   - Execute items sequentially, one by one, completing the entire cycle for each item before touching the next:
     1. **Implement Code**: Make code changes strictly for the single active item.
     2. **Update Documentation**:
        - **Clean `Docs/TODO.md`**: Completely DELETE/REMOVE the corresponding solved or completed item from `Docs/TODO.md` (both from the roadmap and the gap analysis table). NEVER leave items marked with checkboxes (`[x]`); `Docs/TODO.md` must remain strictly clean, with the ultimate objective of achieving a zero-item (empty) TODO.
        - **Update Catalog**: Update `Docs/Descripción de las herramientas.md` with relevant functional details for this item.
     3. **Version Bump**: Increment `package.json` (`patch` for `fix`, `minor` for `feat`).
     4. **Build & Package**: Run `pnpm run package` to compile and create the `.vsix` artifact for that specific version.
     5. **Atomic Commit**: Stage files and commit with simple conventional format:
        - `fix: <element or problem fixed>`
        - `feat: <new element or functionality added>`
     6. **Advance to Next Item**: Only after the commit has been successfully created, proceed to the next item in the prompt list and repeat steps 1 to 5.
   - In the final response, provide a distinct verification checklist grouped by each atomic commit for user testing.

---

## Code Hygiene & Architectural Rationale

9. **Mandatory In-Code Rationale & Technical Solution Comments**:
   - Whenever a specific technical solution, algorithm, non-obvious workaround, or architectural choice is implemented in code, comprehensive comments MUST be placed directly in the code explaining the exact rationale:
     - **Why it was built this way and not another** (the underlying technical justification).
     - **Which edge cases, race conditions, focus/blur quirks, or numerical stability issues it solves**.
     - **Which naive or alternate approaches were discarded and why**.
   - Comments must be placed immediately above or within the relevant functions, event handlers, and data structures.

10. **Permanent Preservation of Historical and Technical In-Code Comments**:
   - All historical, architectural, algorithmic, and optimization comments placed within code files MUST be preserved permanently across all future edits and refactorings.
   - These comments serve as living technical documentation and learning records for the repository. Never remove, strip, or truncate existing in-code rationale, performance diagnostics, or architectural comments unless the underlying subsystem itself is formally deprecated and removed.




