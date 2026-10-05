# AntiDraw Project Specific Rules

## 1. Generación de Artefactos VSIX
- Tras completar modificaciones y actualizar la versión, generar el paquete `.vsix` de la extensión (`pnpm run package` / `vsce package --no-dependencies`).

## 2. Serialización SVG Estándar W3C vs Companion JSON
- El SVG exportado por `SvgSerializer.toSvgString()` debe ser **SVG W3C estrictamente estándar y limpio**.
- **PROHIBIDO** serializar atributos no estándar o privados (`data-shape`, `data-parametric`, `data-corner-*`, etc.) en los tags SVG.
- Toda la metadata paramétrica, configuración de vértices, bloqueos de gradientes y configuraciones de editor se guardan exclusivamente en el archivo de metadatos `.json` acompañante.
- Al cargar (`SvgDeserializer.loadSvgString()`), fusionar el SVG estándar con su companion `.json`.

## 3. Paridad Universal de Elementos y Herramientas
- Cuando se corrija o añada un comportamiento de interacción, snapping o manipulación en una herramienta/elemento, auditar y aplicar el comportamiento idéntico a todos los elementos paralelos (rectángulos, círculos, arcos, polígonos, estrellas, trazados libres) y controladores de interacción.

## 4. Salvaguardas Arquitectónicas Anti-Regresión
- **Prototipos y Getters:** No utilizar spreads superficiales (`{ ...this }`, `Object.assign({}, instance)`) para contextos con getters (`get grids()`, `get guides()`), pues produce valores `undefined` silenciosos.
- **Desacoplamiento:** Servicios algorítmicos (snapping, geometría, hit-test) no deben condicionarse a flags visuales.
- **Precedencia de Eventos:** Asegurar que nuevos listeners no anulen interacciones base (arrastre de canvas, selección de nodos).
- **Documentación:** Mantener sincronizado `Docs/Descripción de las herramientas.md`. Para tareas múltiples y TODO.md, seguir el skill global `task-atomic-workflow`.