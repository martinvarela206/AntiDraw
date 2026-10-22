# AntiDraw Project Specific Rules

## 0. Versionado SemVer y Commit Atómico Obligatorio en CADA Modificación (Fix / Feat)
- **Incremento Obligatorio:** CADA VEZ que se realice una modificación de código en el repositorio, sea una corrección de bugs puntual (`fix`) o una nueva capacidad (`feat`), sin importar si es una solicitud aislada de un solo mensaje o un plan complejo:
  - **Patch (`x.y.Z+1`)**: Obligatorio para correcciones de bugs, fixes de UI, ajustes de interacción o refactorizaciones.
  - **Minor (`x.Y+1.0`)**: Obligatorio para nuevas herramientas, nuevos paneles, o capacidades funcionales añadidas.
- **Sincronización y Commit Simultáneo:** En ese mismo turno, es **ESTRICTAMENTE OBLIGATORIO** ejecutar:
  1. El incremento y sincronización multicapa de versión en todos los archivos del proyecto mediante `npm run version:sync` o `npm run version:bump <patch|minor>`:
     - `package.json` (`version` y `publish:openvsx`).
     - `README.md` (insignia de estado L17 y bloque de estado del proyecto `Project Status: Public Beta (vX.Y.Z)` L41).
  2. La entrada en `changelog.md` exclusivamente en idioma inglés con fecha y desglose de cambios (`Fixed`, `Added`, etc.).
  3. La compilación y empaquetado del artefacto `.vsix` con `pnpm run package`.
  4. **El Commit Atómico Inmediato:** Realizar el commit en Git con formato convencional (`fix: ...`, `feat: ...`, o `chore(release): bump version to X.Y.Z`).
- **Prohibición de Turnos Incompletos:** Queda terminantemente PROHIBIDO finalizar un turno de trabajo donde se haya modificado código funcional o documentación sin haber ejecutado el commit en Git y el empaquetado VSIX correspondientes en esa misma ronda de herramientas.

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
- **Documentación:** Mantener sincronizado `Docs/Descripción de las herramientas.md`. El directorio `Docs/` es un repositorio Git independiente (`AntiDraw-Docs`); cada modificación en la documentación o en `Docs/TODO.md` debe recibir su propio commit atómico en dicho sub-repositorio siguiendo el skill global `task-atomic-workflow`.

## 5. Prohibición de Límites Arbitrarios de Líneas de Código (Anti-Sobreingeniería)
- **Prohibido el Conteo y Restricciones Numéricas de Líneas:** Queda terminantemente PROHIBIDO imponer límites artificiales (ej. `< 350 líneas`), ejecutar comandos de conteo de líneas o fraccionar archivos/clases cohesionadas por motivos de tamaño.
- **Cohesión sobre Fragmentación:** Se prioriza la cohesión funcional, la claridad y la arquitectura unificada frente a divisiones arbitrarias que dispersen el código y provoquen sobreingeniería innecesaria.

## 6. Sincronización Pre-Commit Obligatoria de Documentación, README y Changelog
- **Prohibición de Commits Huérfanos de Documentación:** Antes de ejecutar cualquier commit que incorpore nuevas características, correcciones, mejoras visuales o bumps de versión en el repositorio principal `AntiDraw`, es **ESTRICTAMENTE OBLIGATORIO** haber actualizado previamente todos los documentos relacionados del proyecto:
  1. **`changelog.md`**: Registrar bajo el estándar *Keep a Changelog* la nueva versión, fecha y desglose exhaustivo de cambios (`Added`, `Changed`, `Fixed`, etc.). **Idioma Obligatorio:** El archivo `changelog.md` se debe redactar y mantener **ESTRICTAMENTE EN INGLÉS** para todas las versiones y entradas.
  2. **`readme.md`**: Actualizar tanto la insignia de versión (`badge` L17) como el bloque de estado del proyecto (`Project Status` L41), las descripciones de nuevas capacidades (ej. i18n bilingüe, barras de herramientas actualizadas), enlaces a marketplaces y tablas de soporte.
  3. **`package.json`**: Verificar coherencia total entre la versión declarada, scripts (`publish:openvsx` apuntando al `.vsix` actual) y metadatos (utilizar `pnpm run version:sync`).
  4. **Documentación Técnica en `Docs/`**: Toda modificación en herramientas, atajos, parámetros o flujos debe quedar reflejada en `Descripción de las herramientas.md`, `Catálogo de Iconos y Herramientas.md`, guías operativas y `Docs/TODO.md`, completando su propio commit atómico en el sub-repositorio `AntiDraw-Docs` antes o en simultáneo.
  5. **Empaquetado Inmediato**: Finalizado el commit de código y documentación sincronizada, ejecutar sin excepción `pnpm run package` para generar el artefacto VSIX correspondiente.

## 7. Sincronización Bilingüe Obligatoria en Correcciones y Textos (i18n Espejado)
- **Paridad Obligatoria Español-Inglés:** Cualquier adición, modificación o corrección de textos en la interfaz de usuario, cadenas de internacionalización (`src/webview/i18n/es.ts`), mensajes de error, tooltips o documentación técnica que se realice en español debe realizarse **estricta y simétricamente en inglés** (`src/webview/i18n/en.ts`), y viceversa.
- **Prohibición de Textos Huérfanos o Asimétricos:** No se permite introducir cadenas hardcodeadas en un solo idioma ni actualizar las claves de traducción de un archivo de localización sin reflejar de inmediato su contraparte exacta con su tipado correspondiente en `types.ts`.
- **Escape de Caracteres HTML en Textos de UI:** Al incluir referencias a etiquetas o elementos sintácticos (como `<svg>`, `<div>`, etc.) en cadenas de traducción que se renderizan mediante `innerHTML`, es obligatorio usar entidades HTML (`&lt;svg&gt;`) para evitar que el motor del navegador los interprete como elementos del DOM provocando deformaciones de layout o renderizados vacíos.

## 8. Idioma Exclusivo en Inglés para el Changelog (`changelog.md`)
- **Redacción Obligatoria en Inglés:** Toda entrada, descripción de versión, título de sección (`Added`, `Changed`, `Fixed`, `Deprecated`, `Removed`) y viñeta explicativa en `changelog.md` debe redactarse **exclusivamente en idioma inglés**, siguiendo el estándar internacional *Keep a Changelog*.
- **Prohibición de Entradas en Español en Changelog:** Queda terminantemente prohibido incorporar entradas, títulos o explicaciones en español en `changelog.md`. Todo registro histórico y nuevas versiones deben mantenerse en inglés técnico de alta precisión.