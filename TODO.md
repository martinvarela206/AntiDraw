# AntiDraw — Backlog & Roadmap (TODO)

## 🚨 Prioritario (High Priority)

### [UI/UX] Optimización de Contraste en Tema Claro (WCAG AAA) & Actualización de Skill Global
- [ ] **Ajuste de tokens en AntiDraw (`main.css`)**:
  - Incrementar la densidad y contraste de `--figma-text-secondary` en `[data-theme="light"]` (actualmente `#555555`, ratio ~4.6:1) elevándolo a un valor más oscuro (ej. `#333333` o `#2d2d2d`) para garantizar cumplimiento estricto **WCAG AAA** (ratio $\ge 7:1$) sobre fondos de entrada (`--figma-bg-input: #f5f5f5`) y paneles (`--figma-bg-panel: #ffffff`).
  - Revisar la visibilidad de `--figma-text-tertiary` y etiquetas en estados deshabilitados (`.tool-btn:disabled`) para que mantengan legibilidad accesible sin romper la jerarquía visual de micro-precisión de Figma Studio.
- [ ] **Evolución y refuerzo de la Skill Global (`figma-ux-ui`)**:
  - Actualizar la especificación de tokens Dual-Theme en la skill global `figma-ux-ui` (`~/.gemini/config/skills/figma-ux-ui/SKILL.md`).
  - Formalizar en la guía de la skill que la escala de luminancia para temas claros debe validar por defecto ratios WCAG AAA en textos secundarios y labels funcionales, evitando contrastes lavados en aplicaciones densas inspiradas en Figma Studio.

---

## 📌 Decisiones de Diseño Registradas (Design Rationale)
- **TopBar en Ventanas Compactas**:
  - El salto a doble fila en ventanas angostas (`flex-wrap: wrap`) es una decisión deliberada de diseño para mantener la totalidad de herramientas visibles y operativas sin recurrir a barras de desplazamiento horizontal (`overflow-x: auto`), priorizando el acceso rápido a los controles.
