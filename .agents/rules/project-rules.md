# AntiDraw Project Specific Rules

## 1. Generación Obligatoria de Artefacto VSIX con Cada Commit
- **Empaquetado Inmediato con Cada Commit:** Cada vez que se culmine una tarea atómica, se actualice la versión en `package.json` y se realice su correspondiente commit, **ES OBLIGATORIO** ejecutar `pnpm run package` para compilar y empaquetar el binario `.vsix` instalable actualizado (ej. `antidraw-X.Y.Z.vsix`).
- **Sincronización Permanente:** El desarrollador o diseñador debe contar siempre con el artefacto `.vsix` listo para instalar y probar en VS Code reflejando exactamente el estado del último commit.
- **Naturaleza del Archivo:** Los archivos `.vsix` están excluidos del control de versiones en `.gitignore`, pero su generación local es un requisito ineludible al cerrar cada ciclo atómico.

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

## 5. Prohibición de Límites Arbitrarios de Líneas de Código (Anti-Sobreingeniería)
- **Prohibido el Conteo y Restricciones Numéricas de Líneas:** Queda terminantemente PROHIBIDO imponer límites artificiales (ej. `< 350 líneas`), ejecutar comandos de conteo de líneas o fraccionar archivos/clases cohesionadas por motivos de tamaño.
- **Cohesión sobre Fragmentación:** Se prioriza la cohesión funcional, la claridad y la arquitectura unificada frente a divisiones arbitrarias que dispersen el código y provoquen sobreingeniería innecesaria.