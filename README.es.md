[ English ](README.md) | [ Español ](README.es.md) | [ 简体中文 ](README.zh-CN.md) | [ Deutsch ](README.de.md) | [ Français ](README.fr.md) | [ Русский ](README.ru.md) | [ 日本語 ](README.ja.md)

# AntiDraw — Editor Vectorial SVG para VS Code y Antigravity

<p align="center">
  <img src="https://raw.githubusercontent.com/martinvarela206/AntiDraw/main/icon.png" width="128" height="128" alt="AntiDraw Logo" />
</p>

<p align="center">
  <strong>La precisión gráfica vectorial profesional combinada con la velocidad de tu editor de código.</strong><br>
  <em>Combina la agilidad de flujo de Figma con la precisión geométrica de CorelDraw dentro de tu IDE.</em>
</p>

<p align="center">
  <a href="https://marketplace.visualstudio.com/items?itemName=martinvarela206.antidraw"><img src="https://img.shields.io/badge/VS%20Code-Marketplace-007ACC?style=flat-square&logo=visual-studio-code" alt="VS Code Marketplace"></a>
  <a href="https://open-vsx.org/extension/martinvarela206/antidraw"><img src="https://img.shields.io/badge/Open--VSX-Registry-purple?style=flat-square" alt="Open VSX Registry"></a>
  <a href="https://github.com/martinvarela206/AntiDraw"><img src="https://img.shields.io/badge/GitHub-Repository-181717?style=flat-square&logo=github" alt="GitHub Repository"></a>
  <a href="https://github.com/martinvarela206/AntiDraw/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-Source--Available-blue?style=flat-square" alt="Source-Available License"></a>
  <a href="https://github.com/martinvarela206/AntiDraw"><img src="https://img.shields.io/badge/Status-Beta%20v0.98.1-orange?style=flat-square" alt="Status"></a>
</p>

<p align="center">
  <a href="https://ko-fi.com/martinvarela206" target="_blank">
    <img src="https://img.shields.io/badge/Ko--fi-Apoyar%20al%20Creador-FF5E5B?style=for-the-badge&logo=kofi&logoColor=white" alt="Apoyo en Ko-fi">
  </a>
</p>

---

## 🌐 Enlaces del Ecosistema y Distribución

Tanto si descubriste AntiDraw mediante GitHub, VS Code Marketplace o Open VSX, puedes acceder fácilmente a cualquier parte del proyecto:

| Servicio / Plataforma | Descripción | Enlace Directo |
| :--- | :--- | :--- |
| 🐙 **Repositorio GitHub** | Código fuente, arquitectura, lanzamientos y reporte de incidencias | [github.com/martinvarela206/AntiDraw](https://github.com/martinvarela206/AntiDraw) |
| 🔷 **Visual Studio Marketplace** | Tienda oficial de extensiones de Microsoft para VS Code | [marketplace.visualstudio.com/items?itemName=martinvarela206.antidraw](https://marketplace.visualstudio.com/items?itemName=martinvarela206.antidraw) |
| 🟣 **Registro Open VSX** | Registro de extensiones de código abierto para VSCodium, Antigravity, Gitpod | [open-vsx.org/extension/martinvarela206/antidraw](https://open-vsx.org/extension/martinvarela206/antidraw) |

---

> [!NOTE]
> **Estado del Proyecto: Beta Pública (v0.98.1)**  
> AntiDraw se encuentra en desarrollo activo y continuo. Aunque la edición vectorial, curvas Bézier, magnetismo y operaciones booleanas son plenamente funcionales y estables, pueden surgir casos límite ocasionales.  
> ¿Encontraste un fallo o tienes una sugerencia? Por favor [abre una incidencia en GitHub](https://github.com/martinvarela206/AntiDraw/issues); tus comentarios guían directamente los próximos lanzamientos.

---

## ⚡ ¿Por qué AntiDraw?

Desarrolladores frontend, ingenieros de interfaz y diseñadores técnicos enfrentan a diario un doloroso cambio de contexto:
1. **Los gigantes de escritorio (Illustrator, CorelDraw)** son costosos, propietarios y están aislados del flujo de trabajo de programación.
2. **Las herramientas tradicionales de código abierto (Inkscape)** presentan curvas de aprendizaje complejas y contaminan los archivos SVG con espacios de nombres propietarios (`inkscape:*`, `sodipodi:*`) que rompen los empaquetadores modernos (Vite, Next.js, Webpack).
3. **Los visores o plugins básicos de dibujo en el IDE** carecen de cálculo matemático riguroso para curvas Bézier, precisión magnética y herramientas de recorte booleano.

**AntiDraw** soluciona esto directamente en Visual Studio Code y Antigravity:
* **SVG 100% Estándar W3C Limpio**: Cero etiquetas XML propietarias. Tus archivos SVG son consumibles de inmediato por React, Vue, Flutter y aplicaciones web.
* **Persistencia Sidecar (`.svg.json`)**: Metadatos del editor (guías, pivotes de ángulo, historial, estados paramétricos) se guardan de forma no destructiva en un archivo complementario opcional.
* **Cero Cambio de Contexto**: Ajusta dimensiones, afina nodos Bézier, fusiona formas y define rellenos directamente sin abandonar tu espacio de trabajo.

---

## ✨ Características Principales

### 📐 1. Lienzo y Reglas Interactivas de Precisión
* **Lienzo Infinito**: Controles fluidos de paneo, zoom a alta tasa de cuadros y transformaciones en tiempo real.
* **Inspector de Lienzo y ViewBox a Demanda**: Accesible desde la barra de estado (`Lienzo`) para configurar presets (Icono 16-128, A4, 1080p, 1440p), límites y color de fondo del lienzo sin saturar el inspector de selección.
* **Reglas Métricas Dinámicas**: Reglas superior e izquierda con seguimiento del cursor en tiempo real, configurables en `px`, `mm`, `cm` y `pulgadas`.
* **Guías Inteligentes Interactivas**:
  * Arrastra directamente desde las reglas horizontal o vertical para colocar guías métricas.
  * Clic para seleccionar, tecla <kbd>Supr</kbd> / <kbd>Backspace</kbd> para eliminar o arrastre de vuelta hacia la regla.
  * **Manipulación con doble clic**: Rota guías a cualquier ángulo personalizado y reposiciona su pivote interactivo.

### 🎯 2. Ciclo de Selección Tri-Estado y Bounding Box
* **Ciclo Canónico de 3 Estados**: Alterna rápidamente entre **Mover** (<kbd>W</kbd>), **Escalar** (<kbd>E</kbd>) y **Rotar** (<kbd>R</kbd>).
* **Deformación Libre Dedicada** (<kbd>D</kbd>): Ajuste no uniforme de perspectiva e inclinación homográfica 3x3.
* **Mini-HUD Flotante Contextual**: Acceso instantáneo a alineaciones, dimensiones, anchos de trazo y rellenos junto al objeto seleccionado.

### 🖋️ 3. Curvas Bézier Avanzadas y Edición de Nodos
* **Deformación Directa de Segmentos**: Haz clic y arrastra cualquier tramo de curva para moldearla directamente sin manipular tangentes, con cálculo analítico de polinomios de Bernstein.
* **Conversión Automática de Recta a Curva al Vuelo**: Arrastrar segmentos rectos los promueve automáticamente a curvas cúbicas Bézier, acelerando el calco y la vectorización de siluetas.
* **Desambiguación Contextual de Arrastre**: Conmuta inteligentemente entre curvado directo de segmento y traslación rígida solidaria según la selección previa de nodos, con inversión bajo demanda mediante tecla <kbd>Alt</kbd>.
* **Modos de Vértice**: Soporte riguroso para nodos Cúspide (Esquina), Suave y Simétrico.
* **Transformación de Subgrupos de Nodos**: Selección múltiple de $N \ge 2$ vértices para escalar, rotar o inclinar alrededor de su centroide dinámico preservando tangentes.
* **Soldar / Unir Vértices** (<kbd>Ctrl</kbd> + <kbd>J</kbd>): Fusiona vértices coincidentes eliminando segmentos nulos.

### 🔷 4. Formas Paramétricas con Auto-Promoción Inteligente
* **Rectángulos**: Control independiente de redondeo de 4 esquinas con conmutador de simetría unificada.
* **Elipses y Círculos**: Ángulos de apertura de sectores circulares (tarta) y radio de hueco interior (donut).
* **Polígonos y Estrellas**: Modificación interactiva de puntas/lados con teclas <kbd>↑</kbd> / <kbd>↓</kbd> y modulación de profundidad con tecla <kbd>Ctrl</kbd>.
* **Auto-Promoción**: Modificar la geometría de una primitiva paramétrica la transforma limpiamente en `<path>` sin perder compatibilidad con deshacer ni fidelidad en el sidecar.

### ✂️ 5. Operaciones Booleanas, Corte y Relleno Inteligente
* **Pathfinder Vectorial**: Unión, Diferencia, Intersección, Exclusión, Combinar y Fragmentación.
* **Relleno Inteligente de Grafo Planar**: Detección instantánea de áreas cerradas mediante partición DCEL y trazado de rayos.
* **Herramientas de Topología**: Tijeras de precisión (<kbd>C</kbd>), Cuchilla (<kbd>K</kbd>) y Borrador vectorial (<kbd>Shift</kbd> + <kbd>E</kbd>).

### 🧲 6. Sistema Quíntuple de Magnetismo (Snapping)
* **Cuadrículas Ortogonales e Isométricas** con aceleración de patrones por GPU.
* **Atracción a Guías Inteligentes** con cálculo analítico de intersecciones línea-línea y línea-curva.
* **Alineación Píxel-Perfecta** con compensación automática de $\pm 0.5\text{px}$ para trazos impares.
* **Magnetismo Geométrico**: Bordes del ViewBox, nodos de anclaje y puntos medios de segmentos.

### 🌊 7. Trazos Variables, Deformación y Morphing
* **Curvas con Trazos Variables**: Grosor modulado mediante splines de Hermite $C^1$ y simulación de tinta.
* **Herramienta Fusión Paramétrica (Blend)**: Interpolación morfológica y cromática entre vectores con inversión de torsión.
* **Motor de Deformación y Curvado**: Deformación por arcos concéntricos preservando la analiticidad sin convertir en polígonos densos.

### 🌐 8. Arquitectura Multilingüe (i18n) e Interfaz Refinada
* **Conmutación Multilingüe Instantánea**: Alterna con 1 clic en la barra de estado entre Español (<kbd>ES</kbd>), Inglés (<kbd>EN</kbd>) y Chino Simplificado (<kbd>ZH-CN</kbd>) sin recargar el editor.
* **Cobertura Integral**: Paneles de propiedades, tooltips, guía de atajos de teclado y Mini-HUD se adaptan de forma instantánea al idioma activo.
* **Iconografía Vectorial Nítida al 100%**: Trazo estilizado de precisión a `1.4px`, reemplazando emojis por diseño SVG técnico profesional.

### 🖼️ 9. Imágenes, Texturas y Optimizador Web
* **Herramienta Interactiva de Imágenes**: Inserta mapas de bits (PNG, JPEG, WebP) desde la barra de herramientas, arrastrando al lienzo o pegando desde el portapapeles (<kbd>Ctrl</kbd> + <kbd>V</kbd>).
* **Inserción Contextual**:
  * *Sin selección*: Ubica un elemento `<image>` escalable e independiente en el lienzo.
  * *Con vector seleccionado*: Asigna la imagen como textura de fondo adaptable `<pattern>` directamente en el `fill` de la forma.
* **Umbrales Inteligentes de Ingesta**: Archivos menores a 1.5 MB o 1920 px se procesan de inmediato; archivos mayores abren el diálogo de Optimización Web.
* **Diálogo Guardar para la Web (Vista Dual 2-Up)**:
  * Comparativa pantalla dividida (Original vs. Optimizado) con zoom y paneo sincronizados y telemetría de ahorro en bytes en vivo.
  * Redimensionamiento proporcional, cuantización de paleta (de 256 a 16 colores), filtro de suavizado y control de compresión con o sin pérdida.
* **Recursos Enlazados vs. Incrustados**: Opción de copiar y enlazar la imagen en disco junto al archivo SVG (`svgNombre_id_img.ext`) manteniendo el SVG ligero, o incrustar limpiamente en URI Base64.

---

## ⌨️ Atajos de Teclado Esenciales

| Atajo | Acción |
| :--- | :--- |
| <kbd>V</kbd> | Herramienta Selección |
| <kbd>A</kbd> | Herramienta Edición de Nodos |
| <kbd>P</kbd> | Pluma Bézier |
| <kbd>L</kbd> | Línea Recta |
| <kbd>Y</kbd> | Polilínea |
| <kbd>R</kbd> | Rectángulo |
| <kbd>O</kbd> | Círculo |
| <kbd>E</kbd> | Elipse |
| <kbd>G</kbd> | Polígono Regular |
| <kbd>S</kbd> | Estrella Paramétrica |
| <kbd>T</kbd> | Herramienta Trazo |
| <kbd>C</kbd> | Tijeras |
| <kbd>K</kbd> | Cuchilla |
| <kbd>Shift</kbd> + <kbd>E</kbd> | Borrador Vectorial |
| <kbd>F</kbd> | Relleno Inteligente |
| <kbd>M</kbd> | Creador de Formas |
| <kbd>I</kbd> | Herramienta Imagen |
| <kbd>+</kbd> | Añadir Vértice |
| <kbd>Z</kbd> | Zoom y Paneo |
| <kbd>D</kbd> | Conmutar Deformación Libre / Perspectiva 3x3 |
| <kbd>Ctrl</kbd> + <kbd>J</kbd> | Unir / Soldar vértices coincidentes |
| <kbd>Supr</kbd> / <kbd>Backspace</kbd> | Eliminar elementos, nodos o líneas guía seleccionadas |
| <kbd>Ctrl</kbd> + <kbd>Z</kbd> / <kbd>Ctrl</kbd> + <kbd>Y</kbd> | Deshacer / Rehacer |
| <kbd>Ctrl</kbd> + <kbd>0</kbd> | Centrar y ajustar ViewBox a pantalla |

---

## 🚀 Primeros Pasos

1. Instala **AntiDraw** desde el **Visual Studio Code Marketplace** o desde **Open VSX**.
2. Haz clic derecho sobre cualquier archivo `.svg` en el explorador de VS Code.
3. Elige **"Abrir con..."** ➔ **"Editor SVG AntiDraw"** (o configúralo como editor predeterminado para `.svg`).
4. También puedes pulsar `Ctrl+Shift+P` (o `Cmd+Shift+P` en macOS) y escribir:  
   `AntiDraw: Abrir con Editor SVG AntiDraw`

---

## ☕ Apoyo y Donaciones

AntiDraw es desarrollado y mantenido con dedicación por un programador independiente. Se ofrece libremente a la comunidad bajo una **Licencia de Código Disponible (Source-Available)** para que desarrolladores y diseñadores de todo el mundo disfruten de un flujo vectorial ágil y directo en su IDE.

Si AntiDraw te ahorra tiempo, mejora tu rutina de código o te ayuda en tus proyectos, puedes apoyar su evolución continua:

* ☕ **Apoyar en Ko-fi (Tarjetas globales y PayPal):**  
  👉 **[ko-fi.com/martinvarela206](https://ko-fi.com/martinvarela206)**
* ⭐ **Dar una estrella:** ¡Marca una estrella en el repositorio de [GitHub](https://github.com/martinvarela206/AntiDraw) para ayudar a que más desarrolladores lo conozcan!

---

## 📄 Licencia y Propiedad Intelectual

Copyright © 2026 **Martin Varela** (`martinvarela206@gmail.com`).

AntiDraw está licenciado bajo la **Licencia PolyForm No Comercial 1.0.0** (Source-Available):
* **Uso, estudio y modificación libres** para flujos personales, educativos, de investigación y desarrollo no comercial.
* **Atribución Obligatoria**: Cualquier bifurcación (fork) o copia distribuida debe conservar los avisos de copyright originales y acreditar a Martin Varela.
* **Prohibida la redistribución comercial**: No está permitido empaquetar, renombrar ni vender AntiDraw (ni sus derivados) como producto comercial sin consentimiento previo por escrito del autor.

Consulta el archivo [LICENSE](LICENSE) para ver los términos legales completos.
