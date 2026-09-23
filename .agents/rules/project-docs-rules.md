---
trigger: always_on
---

# Project Documentation Standards & Lifecycle Rules

This file contains the rules governing the lifecycle, directory structure, task tracking, and synchronization of AntiDraw's project documentation located in `Docs/`. Rules are written in English to optimize context window efficiency and reduce token usage.

---

## Operational Execution

1. **Project Documentation Prompt Acknowledgment**:
   - Every response must explicitly include: `Project Docs Prompt Loaded.` right after the Project Prompt acknowledgment.

---

## Documentation Ecosystem & Directory Governance

2. **AntiDraw `Docs/` Ecosystem & File Responsibilities**:
   - `Docs/TODO.md`: The active roadmap and atomic task registry. Must be continuously synchronized during feature development and bug fixing.
   - `Docs/Descripción de las herramientas.md`: The exhaustive, authoritative manual describing every tool, interaction handler, shortcut, geometry mode, visual feedback element, and parameter in AntiDraw.
   - `Docs/Catálogo de Iconos y Herramientas.md`: Comprehensive visual and UI reference catalog for toolbar icons, buttons, SVG identifiers, and action bindings.
   - `Docs/Guía de Recorrido y Verificación Funcional.md`: Structured verification scripts, test scenarios, and regression inspection checklists.
   - `Docs/Informe Competencia.md`: Feature comparison matrix and competitive benchmarking against external vector design applications.

---

## Task Registry Lifecycle & `Docs/TODO.md` Hygiene

3. **Dynamic Task Ingestion into `Docs/TODO.md`**:
   - Whenever a user prompt mentions, enumerates, or identifies problems, bugs, corrections, missing functionality, or new features, these items MUST be cataloged and added to `Docs/TODO.md` before execution.
   - **Exception / Direct Flow**: If `Docs/TODO.md` has no pending items (empty list) and a problem is diagnosed, do not leave it parked in the TODO; immediately initiate the required implementation to resolve it.

4. **Strict Deletion & Zero-Item Goal for `Docs/TODO.md`**:
   - Completely DELETE / REMOVE completed or solved items from `Docs/TODO.md` (both from the roadmap and the gap analysis table).
   - NEVER leave items marked with checkboxes (`[x]`).
   - `Docs/TODO.md` must remain strictly clean, with the ultimate objective of achieving a zero-item (empty) TODO.

---

## Catalog Synchronization & Language Standards

5. **Atomic Tool Catalog Synchronization (`Docs/Descripción de las herramientas.md` tacit updates)**:
   - During each atomic development cycle, any modification, fix, handle change, shortcut adjustment, or new capability affecting an AntiDraw tool must immediately be reflected in `Docs/Descripción de las herramientas.md`.

6. **Documentation Language & Technical Tone**:
   - All user-facing documents, manuals, and task lists inside `Docs/` must be authored in professional Spanish to maintain stylistic parity with the existing project documentation.
   - Rule definition files (`.agents/rules/`) and in-code technical comments remain in English for optimal token efficiency.
