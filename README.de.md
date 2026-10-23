[ English ](README.md) | [ Español ](README.es.md) | [ 简体中文 ](README.zh-CN.md) | [ Deutsch ](README.de.md) | [ Français ](README.fr.md) | [ Русский ](README.ru.md) | [ 日本語 ](README.ja.md)

# AntiDraw — SVG-Vektorgrafik-Editor für VS Code & Antigravity

<p align="center">
  <img src="https://raw.githubusercontent.com/martinvarela206/AntiDraw/main/icon.png" width="128" height="128" alt="AntiDraw Logo" />
</p>

<p align="center">
  <strong>Professionelle Vektorgrafik-Präzision trifft auf die Schnelligkeit Ihres Code-Editors.</strong><br>
  <em>Kombiniert die Workflow-Agilität von Figma mit der geometrischen Genauigkeit von CorelDraw direkt in Ihrer IDE.</em>
</p>

<p align="center">
  <a href="https://marketplace.visualstudio.com/items?itemName=martinvarela206.antidraw"><img src="https://img.shields.io/badge/VS%20Code-Marketplace-007ACC?style=flat-square&logo=visual-studio-code" alt="VS Code Marketplace"></a>
  <a href="https://open-vsx.org/extension/martinvarela206/antidraw"><img src="https://img.shields.io/badge/Open--VSX-Registry-purple?style=flat-square" alt="Open VSX Registry"></a>
  <a href="https://github.com/martinvarela206/AntiDraw"><img src="https://img.shields.io/badge/GitHub-Repository-181717?style=flat-square&logo=github" alt="GitHub Repository"></a>
  <a href="https://github.com/martinvarela206/AntiDraw/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-Source--Available-blue?style=flat-square" alt="Source-Available License"></a>
  <a href="https://github.com/martinvarela206/AntiDraw"><img src="https://img.shields.io/badge/Status-Beta%20v0.98.2-orange?style=flat-square" alt="Status"></a>
</p>

<p align="center">
  <a href="https://ko-fi.com/martinvarela206" target="_blank">
    <img src="https://img.shields.io/badge/Ko--fi-Entwickler%20unterst%C3%BCtzen-FF5E5B?style=for-the-badge&logo=kofi&logoColor=white" alt="Support on Ko-fi">
  </a>
</p>

---

## 🌐 Ökosystem & Vertriebs-Links

Egal ob Sie AntiDraw über GitHub, den Visual Studio Code Marketplace oder Open VSX entdeckt haben – Sie können jederzeit auf alle Bereiche des Projekts zugreifen:

| Dienst / Plattform | Beschreibung | Direktlink |
| :--- | :--- | :--- |
| 🐙 **GitHub Repository** | Quellcode, Architekturdokumentation, Releases und Issue-Tracker | [github.com/martinvarela206/AntiDraw](https://github.com/martinvarela206/AntiDraw) |
| 🔷 **Visual Studio Marketplace** | Offizieller Microsoft Extension Store für VS Code | [marketplace.visualstudio.com/items?itemName=martinvarela206.antidraw](https://marketplace.visualstudio.com/items?itemName=martinvarela206.antidraw) |
| 🟣 **Open VSX Registry** | Open-Source-Erweiterungsregister für VSCodium, Antigravity, Gitpod | [open-vsx.org/extension/martinvarela206/antidraw](https://open-vsx.org/extension/martinvarela206/antidraw) |

---

> [!NOTE]
> **Projektstatus: Öffentliche Beta (v0.98.2)**  
> AntiDraw befindet sich in aktiver, kontinuierlicher Weiterentwicklung. Während Vektor-Transformationen, Bézier-Kurven, Einrasten und boolesche Topologie-Werkzeuge stabil funktionieren, können gelegentlich Randfälle auftreten.  
> Fehler gefunden oder Funktionswunsch? Bitte [eröffnen Sie ein GitHub Issue](https://github.com/martinvarela206/AntiDraw/issues) – Ihr Feedback gestaltet die kommenden Versionen maßgeblich mit!

---

## ⚡ Warum AntiDraw?

Frontend-Entwickler, UI-Ingenieure und technische Designer stehen täglich vor mühsamen Kontextwechseln:
1. **Schwere Desktop-Programme (Illustrator, CorelDraw)** sind teuer, proprietär und isoliert von Programmierabläufen.
2. **Klassische Open-Source-Werkzeuge (Inkscape)** haben steile Lernkurven und verunreinigen SVG-Dateien mit proprietären Tags (`inkscape:*`, `sodipodi:*`), die moderne Bundler (Vite, Next.js, Webpack) beschädigen.
3. **Einfache IDE-Viewer** bieten keine exakte Bézier-Mathematik, geometrisches Snapping oder boolesche Pfad-Operationen.

**AntiDraw** löst dies nahtlos direkt in Visual Studio Code und Antigravity:
* **100% sauberer W3C-Standard-SVG**: Null proprietärer XML-Ballast. Ihre SVGs sind sofort direkt in React, Vue, Flutter und Web-Apps einsatzbereit.
* **Sidecar-Persistenz (`.svg.json`)**: Editor-Metadaten (Hilfslinien, Drehpunkte, Verlauf, Formen-Parameter) werden zerstörungsfrei in einer optionalen Begleitdatei gesichert.
* **Kein Kontextwechsel**: Passen Sie Maße an, modellieren Sie Kurven, vereinen Sie Konturen und bearbeiten Sie Füllungen direkt in Ihrem Arbeitsbereich.

---

## ✨ Wichtigste Funktionen

### 📐 1. Leinwand & Interaktive Präzisionslineale
* **Unendliche Leinwand**: Flüssiges Schwenken und Zoomen bei hoher Bildrate.
* **Leinwand- & ViewBox-Inspektor**: Direkt über die Statusleiste (`Leinwand`) zugänglich, um Presets (Icon 16-128, A4, 1080p, 1440p) und Hintergründe einzustellen.
* **Dynamische Lineale**: Horizontale und vertikale Lineale mit Cursor-Verfolgung in `px`, `mm`, `cm` und `in`.
* **Smarte Hilfslinien**:
  * Direkt aus dem Lineal auf die Leinwand ziehen.
  * Mit <kbd>Entf</kbd> / <kbd>Backspace</kbd> löschen oder ins Lineal zurückschieben.
  * **Winkelrotation**: Hilfslinien doppelklicken, um sie frei um einen Drehpunkt zu rotieren.

### 🎯 2. Dreistufige Auswahl-Transformation & Mini-HUD
* **3-Stufen-Zyklus**: Schnell umschalten zwischen **Verschieben** (<kbd>W</kbd>), **Skalieren** (<kbd>E</kbd>) und **Drehen** (<kbd>R</kbd>).
* **Freie Verzerrung** (<kbd>D</kbd>): Perspektivische Homografie-Modulation über 3x3-Eckpunkte.
* **Schwebendes Mini-HUD**: Direkter Zugriff auf Ausrichtung, Maße, Konturstärken und Füllungen direkt neben dem aktiven Element.

### 🖋️ 3. Fortgeschrittene Bézier-Kurven & Knotenbearbeitung
* **Direktes Kurvenbiegen**: Beliebige Kurvensegmente direkt mit der Maus in Form ziehen – mathematisch exakt gewichtet mit Bernstein-Polynomen.
* **Linien-Auto-Umwandlung**: Durch Ziehen von geraden Segmenten werden diese unmittelbar zu kubischen Bézier-Kurven aufgewertet.
* **Vollständige Knotentypen**: Spitzen (Ecken), geglättete und symmetrische Bézier-Tangenten.
* **Subgruppen-Transformation**: Mehrfachauswahl von $N \ge 2$ Knoten zum gemeinsamen Drehen, Skalieren oder Scheren um ihren Schwerpunkt.
* **Knoten verbinden / verschmelzen** (<kbd>Ctrl</kbd> + <kbd>J</kbd>): Koinzidente Endpunkte nahtlos ohne Null-Segmente verschweißen.

### 🔷 4. Parametrische Grundformen & Auto-Promotion
* **Rechtecke**: 4 Eckenradien unabhängig oder synchron regelbar.
* **Ellipsen & Kreise**: Tortenstück-Winkel und innerer Lochradius (Donut).
* **Polygone & Sterne**: Interaktive Seitenanzahl über <kbd>↑</kbd> / <kbd>↓</kbd> und Modulierung des Innenradius mit <kbd>Ctrl</kbd>.
* **Auto-Promotion**: Das Ändern geometrischer Pfadeigenschaften überführt Grundformen transparent in saubere `<path>`-Elemente.

### ✂️ 5. Boolesche Operationen, Schnittwerkzeuge & Intelligente Füllung
* **Vektor-Pathfinder**: Vereinigung, Differenz, Schnittmenge, Ausschluss, Kombinieren und Fragmentieren.
* **Planare Intelligente Füllung**: Automatische Erkennung geschlossener Flächen durch DCEL-Planargraphen-Zerlegung.
* **Topologie-Werkzeuge**: Präzisionsschere (<kbd>C</kbd>), Messer (<kbd>K</kbd>) und Vektor-Radierer (<kbd>Shift</kbd> + <kbd>E</kbd>).

### 🧲 6. Fünffaches Fangraster- & Snapping-System
* **Orthogonale & Isometrische Raster** mit GPU-Muster-Caching.
* **Hilfslinien-Snapping** mit analytischer Schnittpunktberechnung.
* **Pixelgenaue Ausrichtung** mit $\pm 0.5\text{px}$-Kompensation für ungerade Konturen.
* **Geometrie-Snapping**: ViewBox-Ränder, Knoten und Kantenmitten.

### 🌐 7. Internationalisierung (i18n) & Fliegendes Sprachmenü
* **Fliegendes Sprachmenü**: Auswahl über Popover mit SVG-Flaggen (Deutsch, Englisch, Spanisch, Chinesisch, Französisch, Russisch, Japanisch) aus der Statusleiste.
* **Vollständige Abdeckung**: Alle Inspektoren, Symbolleisten, Statusanzeigen und Hilfetexte adaptieren sich verzögerungsfrei.

---

## ⌨️ Wichtige Tastaturkürzel

| Tastenkürzel | Aktion |
| :--- | :--- |
| <kbd>V</kbd> | Auswahlwerkzeug |
| <kbd>A</kbd> | Knotenwerkzeug |
| <kbd>P</kbd> | Bézier-Stift |
| <kbd>L</kbd> | Gerade Linie |
| <kbd>Y</kbd> | Polylinie |
| <kbd>R</kbd> | Rechteck |
| <kbd>O</kbd> | Kreis |
| <kbd>E</kbd> | Ellipse |
| <kbd>G</kbd> | Regelmäßiges Polygon |
| <kbd>S</kbd> | Stern |
| <kbd>T</kbd> | Konturwerkzeug |
| <kbd>C</kbd> | Schere |
| <kbd>K</kbd> | Messer |
| <kbd>Shift</kbd> + <kbd>E</kbd> | Radiergummi |
| <kbd>F</kbd> | Intelligente Füllung |
| <kbd>M</kbd> | Form-Ersteller |
| <kbd>I</kbd> | Bildwerkzeug |
| <kbd>+</kbd> | Knoten hinzufügen |
| <kbd>Z</kbd> | Zoom & Verschieben |
| <kbd>D</kbd> | Freie Verzerrung umschalten |
| <kbd>Ctrl</kbd> + <kbd>J</kbd> | Knoten verbinden / verschweißen |
| <kbd>Entf</kbd> / <kbd>Backspace</kbd> | Ausgewählte Elemente, Knoten oder Hilfslinien löschen |
| <kbd>Ctrl</kbd> + <kbd>Z</kbd> / <kbd>Ctrl</kbd> + <kbd>Y</kbd> | Rückgängig / Wiederholen |
| <kbd>Ctrl</kbd> + <kbd>0</kbd> | ViewBox zentrieren und einpassen |

---

## 🚀 Erste Schritte

1. Installieren Sie **AntiDraw** über den **VS Code Marketplace** oder **Open VSX**.
2. Klicken Sie im Explorer mit der rechten Maustaste auf eine `.svg`-Datei.
3. Wählen Sie **"Öffnen mit..."** ➔ **"AntiDraw SVG-Editor"**.
4. Alternativ drücken Sie `Ctrl+Shift+P` (bzw. `Cmd+Shift+P` auf macOS) und geben Sie ein:  
   `AntiDraw: Open with AntiDraw SVG Editor`

---

## ☕ Unterstützung & Spenden

AntiDraw wird von einem unabhängigen Entwickler mit viel Sorgfalt gepflegt. Es wird der weltweiten Entwickler- und Designer-Community frei unter einer **Source-Available-Lizenz** zur Verfügung gestellt.

Wenn AntiDraw Ihnen Zeit spart und Ihre tägliche Entwicklungsarbeit erleichtert:
* ☕ **Auf Ko-fi unterstützen (Kreditkarten & PayPal):** [ko-fi.com/martinvarela206](https://ko-fi.com/martinvarela206)
* ⭐ **Einen Stern vergeben:** Vergeben Sie einen Stern auf [GitHub](https://github.com/martinvarela206/AntiDraw)!

---

## 📄 Lizenz

Copyright © 2026 **Martin Varela** (`martinvarela206@gmail.com`). Lizenziert unter der **PolyForm Noncommercial License 1.0.0** (Source-Available). Siehe [LICENSE](LICENSE).
