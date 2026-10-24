[ English ](README.md) | [ Español ](README.es.md) | [ 简体中文 ](README.zh-CN.md) | [ Deutsch ](README.de.md) | [ Français ](README.fr.md) | [ Русский ](README.ru.md) | [ 日本語 ](README.ja.md)

# AntiDraw — Векторный редактор SVG для VS Code и Antigravity

<p align="center">
  <img src="https://raw.githubusercontent.com/martinvarela206/AntiDraw/main/icon.png" width="128" height="128" alt="AntiDraw Logo" />
</p>

<p align="center">
  <strong>Профессиональная точность векторной графики и скорость редактора кода в одном инструменте.</strong><br>
  <em>Объединяет гибкость Figma и геометрическую строгость CorelDraw прямо в вашей IDE.</em>
</p>

<p align="center">
  <a href="https://marketplace.visualstudio.com/items?itemName=martinvarela206.antidraw"><img src="https://img.shields.io/badge/VS%20Code-Marketplace-007ACC?style=flat-square&logo=visual-studio-code" alt="VS Code Marketplace"></a>
  <a href="https://open-vsx.org/extension/martinvarela206/antidraw"><img src="https://img.shields.io/badge/Open--VSX-Registry-purple?style=flat-square" alt="Open VSX Registry"></a>
  <a href="https://github.com/martinvarela206/AntiDraw"><img src="https://img.shields.io/badge/GitHub-Repository-181717?style=flat-square&logo=github" alt="GitHub Repository"></a>
  <a href="https://github.com/martinvarela206/AntiDraw/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-Source--Available-blue?style=flat-square" alt="Source-Available License"></a>
  <a href="https://github.com/martinvarela206/AntiDraw"><img src="https://img.shields.io/badge/Status-Beta%20v0.102.0-orange?style=flat-square" alt="Status"></a>
</p>

<p align="center">
  <a href="https://ko-fi.com/martinvarela206" target="_blank">
    <img src="https://img.shields.io/badge/Ko--fi-Поддержать%20автора-FF5E5B?style=for-the-badge&logo=kofi&logoColor=white" alt="Support on Ko-fi">
  </a>
</p>

---

## 🌐 Ссылки экосистемы и дистрибуции

| Сервис / Платформа | Описание | Прямая ссылка |
| :--- | :--- | :--- |
| 🐙 **GitHub Репозиторий** | Исходный код, архитектура, релизы и трекер задач | [github.com/martinvarela206/AntiDraw](https://github.com/martinvarela206/AntiDraw) |
| 🔷 **Visual Studio Marketplace** | Официальный каталог расширений Microsoft для VS Code | [marketplace.visualstudio.com/items?itemName=martinvarela206.antidraw](https://marketplace.visualstudio.com/items?itemName=martinvarela206.antidraw) |
| 🟣 **Реестр Open VSX** | Открытый каталог расширений для VSCodium, Antigravity, Gitpod | [open-vsx.org/extension/martinvarela206/antidraw](https://open-vsx.org/extension/martinvarela206/antidraw) |

---

> [!NOTE]
> **Статус проекта: Публичная бета (v0.102.0)**  
> AntiDraw активно развивается. Хотя векторные преобразования, кривые Безье, привязка и булевы операции полностью работоспособны, могут встречаться крайние случаи.  
> Нашли ошибку? Пожалуйста, [создайте Issue на GitHub](https://github.com/martinvarela206/AntiDraw/issues).

---

## ⚡ Почему AntiDraw?

* **100% чистый стандарт W3C SVG**: Никакого лишнего проприетарного XML-мусора (`inkscape:*` и т.д.). Ваши SVG сразу готовы к использованию в React, Vue, Flutter и веб-приложениях.
* **Sidecar-сохранение (`.svg.json`)**: Метаданные редактора (направляющие, центры вращения, история, параметры) надежно сохраняются в отдельном файле без повреждения SVG.
* **Без переключения контекста**: Редактируйте узлы, сваривайте контуры и настраивайте заливки прямо в вашей рабочей среде кода.

---

## ✨ Основные возможности

* **Бесконечный холст и динамические линейки** в `px`, `mm`, `cm`, `in`.
* **Трехпозиционный цикл трансформации**: Перемещение (<kbd>W</kbd>), Масштаб (<kbd>E</kbd>) и Поворот (<kbd>R</kbd>).
* **Свободная перспектива (Homography 3x3)** (<kbd>D</kbd>).
* **Прямое моделирование кривых Безье** с автопреобразованием прямых в кривые.
* **Векторный Pathfinder и умная заливка** на базе DCEL-графов.
* **Всплывающее меню переключения языков** с векторными SVG-флагами (Русский, Английский, Испанский, Китайский, Немецкий, Французский, Японский).

---

## ⌨️ Горячие клавиши

| Клавиша | Действие |
| :--- | :--- |
| <kbd>V</kbd> | Инструмент выделения |
| <kbd>A</kbd> | Редактирование узлов |
| <kbd>P</kbd> | Перо Безье |
| <kbd>L</kbd> | Прямая линия |
| <kbd>Y</kbd> | Полилиния |
| <kbd>R</kbd> | Прямоугольник |
| <kbd>O</kbd> | Круг |
| <kbd>E</kbd> | Эллипс |
| <kbd>G</kbd> | Правильный многоугольник |
| <kbd>S</kbd> | Звезда |
| <kbd>T</kbd> | Инструмент обводки |
| <kbd>C</kbd> | Ножницы |
| <kbd>K</kbd> | Нож |
| <kbd>Shift</kbd> + <kbd>E</kbd> | Ластик |
| <kbd>F</kbd> | Умная заливка |
| <kbd>M</kbd> | Создатель форм |
| <kbd>I</kbd> | Изображение |
| <kbd>+</kbd> | Добавить узел |
| <kbd>Z</kbd> | Масштаб и панорама |
| <kbd>D</kbd> | Свободная деформация |
| <kbd>Ctrl</kbd> + <kbd>J</kbd> | Объединить узлы |
| <kbd>Del</kbd> / <kbd>Backspace</kbd> | Удалить объект |
| <kbd>Ctrl</kbd> + <kbd>Z</kbd> / <kbd>Ctrl</kbd> + <kbd>Y</kbd> | Отмена / Повтор |
| <kbd>Ctrl</kbd> + <kbd>0</kbd> | Центрировать холст |

---

## 📄 Лицензия

Copyright © 2026 **Martin Varela** (`martinvarela206@gmail.com`). Лицензировано под **PolyForm Noncommercial License 1.0.0** (Source-Available). См. [LICENSE](LICENSE).
