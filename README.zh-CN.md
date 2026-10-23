[ English ](README.md) | [ Español ](README.es.md) | [ 简体中文 ](README.zh-CN.md) | [ Deutsch ](README.de.md) | [ Français ](README.fr.md) | [ Русский ](README.ru.md) | [ 日本語 ](README.ja.md)

# AntiDraw — 适用于 VS Code 与 Antigravity 的 SVG 矢量图形编辑器

<p align="center">
  <img src="https://raw.githubusercontent.com/martinvarela206/AntiDraw/main/icon.png" width="128" height="128" alt="AntiDraw Logo" />
</p>

<p align="center">
  <strong>专业级矢量图形几何精度与现代代码编辑器闪电般响应速度的完美融合。</strong><br>
  <em>在你的 IDE 内部，将 Figma 的灵活工作流与 CorelDraw 的精确几何计算合二为一。</em>
</p>

<p align="center">
  <a href="https://marketplace.visualstudio.com/items?itemName=martinvarela206.antidraw"><img src="https://img.shields.io/badge/VS%20Code-Marketplace-007ACC?style=flat-square&logo=visual-studio-code" alt="VS Code Marketplace"></a>
  <a href="https://open-vsx.org/extension/martinvarela206/antidraw"><img src="https://img.shields.io/badge/Open--VSX-Registry-purple?style=flat-square" alt="Open VSX Registry"></a>
  <a href="https://github.com/martinvarela206/AntiDraw"><img src="https://img.shields.io/badge/GitHub-Repository-181717?style=flat-square&logo=github" alt="GitHub Repository"></a>
  <a href="https://github.com/martinvarela206/AntiDraw/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-Source--Available-blue?style=flat-square" alt="Source-Available License"></a>
  <a href="https://github.com/martinvarela206/AntiDraw"><img src="https://img.shields.io/badge/Status-Beta%20v0.99.0-orange?style=flat-square" alt="Status"></a>
</p>

<p align="center">
  <a href="https://ko-fi.com/martinvarela206" target="_blank">
    <img src="https://img.shields.io/badge/Ko--fi-赞助创作者-FF5E5B?style=for-the-badge&logo=kofi&logoColor=white" alt="Support on Ko-fi">
  </a>
</p>

---

## 🌐 生态系统与分发链接

无论您是通过 GitHub、VS Code 插件市场还是 Open VSX 了解 AntiDraw，都可以轻松访问该项目的各个环节：

| 服务 / 平台 | 描述 | 直达链接 |
| :--- | :--- | :--- |
| 🐙 **GitHub 代码仓库** | 源代码、技术架构文档、发布版本与 Issue 反馈追踪 | [github.com/martinvarela206/AntiDraw](https://github.com/martinvarela206/AntiDraw) |
| 🔷 **Visual Studio Marketplace** | 微软官方 VS Code 扩展商店 | [marketplace.visualstudio.com/items?itemName=martinvarela206.antidraw](https://marketplace.visualstudio.com/items?itemName=martinvarela206.antidraw) |
| 🟣 **Open VSX Registry** | 面向 VSCodium、Antigravity、Gitpod 的开源扩展注册中心 | [open-vsx.org/extension/martinvarela206/antidraw](https://open-vsx.org/extension/martinvarela206/antidraw) |

---

> [!NOTE]
> **项目状态：公开公测版 (Public Beta v0.99.0)**  
> AntiDraw 正处于高频持续迭代开发中。虽然核心矢量编辑、贝塞尔曲线算法、磁吸吸附和布尔运算拓扑已全面完备且稳定，但在复杂极端场景下仍可能遇到边界情况。  
> 发现 Bug 或有新特性建议？欢迎在 [GitHub Issues 提交反馈](https://github.com/martinvarela206/AntiDraw/issues) —— 您的反馈将直接驱动下一个版本的演进！

---

## ⚡ 为什么选择 AntiDraw？

前端开发者、UI 工程师和全栈开发者常年在矢量图形与代码工作流之间经历割裂的上下文切换痛点：
1. **重型桌面软件（Illustrator、CorelDraw）**：高昂昂贵、闭源专有，与现代 IDE 和 Git 仓库完全脱节。
2. **传统开源工具（Inkscape）**：学习门槛陡峭，且会在 SVG XML 文件中注入大量专有命名空间标签（`inkscape:*`、`sodipodi:*`），导致现代构建打包工具（Vite、Next.js、Webpack）报错或代码臃肿。
3. **简易的 IDE 内嵌绘图插件**：缺乏严谨的贝塞尔曲线解析数学、缺乏微米级几何吸附、缺乏布尔运算和拓扑路径修剪工具。

**AntiDraw** 直接在 Visual Studio Code 与 Antigravity 中彻底解决了这些难题：
* **100% 纯净 W3C 标准 SVG**：零私有 XML 垃圾数据。导出的 SVG 文件可直接在 React、Vue、Flutter 及 Web 应用中无缝加载。
* **Sidecar 伴生持久化机制 (`.svg.json`)**：编辑状态元数据（辅助参考线、旋转中心原点、撤销重做树、参数化形状状态）非破坏性地保存在同名附带文件中。
* **零上下文切换**：无需离开代码编辑器即可微调尺寸、重塑贝塞尔曲线、焊接轮廓或调试填充。

---

## ✨ 核心特性

### 📐 1. 画布与高精度交互式标尺
* **无限画布**：流畅高帧率平移与缩放手势支持。
* **按需画布与 ViewBox 检查器**：直接集成于状态栏（`画布` / `Canvas`），一键配置预设（Icon 16-128、A4、1080p、1440p）、视图边界与工作区背景色，保持属性面板整洁。
* **动态物理标尺**：顶部与左侧标尺实时追踪光标坐标，支持 `px`、`mm`、`cm` 及 `in`（英寸）无缝切换。
* **智能交互式参考线**：
  * 直接从水平或垂直标尺拖拽出参考线。
  * 单击选中，按下 <kbd>Del</kbd> / <kbd>Backspace</kbd> 删除，或直接拖回标尺中移除。
  * **双击角度旋转**：支持将参考线旋转至任意角度并交互式调整旋转原点。

### 🎯 2. 三态变换定界框与 Mini-HUD
* **经典三态循环**：一键在 **移动** (<kbd>W</kbd>)、**缩放** (<kbd>E</kbd>) 与 **旋转** (<kbd>R</kbd>) 变换模式间极速切换。
* **专用自由变形** (<kbd>D</kbd>)：透视拉伸与 3x3 单应性四边形扭曲微调。
* **悬浮上下文 Mini-HUD**：在选中图形紧邻区域即时调整对齐、精确宽高、描边粗细与填充色彩。

### 🖋️ 3. 进阶贝塞尔曲线与节点编辑
* **曲线线段直接拉拽塑形**：直接按住任意曲线线段进行拖拽塑形，无需逐一调试切线手柄，底层由严谨的 Bernstein 伯恩斯坦多项式加权算法驱动。
* **直线即时升阶为三次贝塞尔曲线**：按住并拖拽原本笔直的线段，系统将自动将其升阶为三次贝塞尔曲线，极大加速矢量描摹工作流。
* **上下文拖拽智能识别**：根据当前选中顶点的状态，自动智能甄别是进行线段塑形还是节点群整体平移，并支持按住 <kbd>Alt</kbd> 临时翻转逻辑。
* **节点类型支持**：尖角（Cusp）、平滑（Smooth）与完全对称（Symmetric）贝塞尔手柄。
* **顶点子集变形**：框选 $N \ge 2$ 个顶点即可绕其动态质心进行局部缩放、旋转或倾斜，同时严谨保护切线连续性。
* **节点焊接与合并** (<kbd>Ctrl</kbd> + <kbd>J</kbd>)：无缝焊接空间重合的端点，消除多余的零长度线段。

### 🔷 4. 参数化几何形状与智能自动转换
* **矩形**：支持 4 个圆角独立半径调节与一键四角对称联动。
* **椭圆与正圆**：支持扇形张角切片与内环镂空半径（Donut 环形）参数微调。
* **多边形与星形**：使用 <kbd>↑</kbd> / <kbd>↓</kbd> 方向键实时调节边数与角数，按住 <kbd>Ctrl</kbd> 调节星形内外半径凹凸深度。
* **智能自动转换**：一旦对几何形状进行非参数化节点塑形，底层将无缝升级为标准 `<path>` 路径，同时保持撤销重做链与伴生 sidecar 的完整性。

### ✂️ 5. 布尔运算、路径修剪与智能填充
* **矢量布尔运算器**：并集（Union）、差集（Difference）、交集（Intersection）、异或排除（Exclusion）、组合（Combine）与几何碎片化（Fragmentation）。
* **平面图智能填充**：基于 DCEL 平面图划分与光线投射算法，实时感知重叠相交线段围成的任意封闭多边形区域并一键生成矢量路径。
* **拓扑工具链**：高精度剪刀 (<kbd>C</kbd>)、美工刀 (<kbd>K</kbd>) 与矢量橡皮擦 (<kbd>Shift</kbd> + <kbd>E</kbd>)。

### 🧲 6. 五重几何吸附系统 (Snapping)
* **正交网格与等轴测（Isometric）网格**，配合 GPU 纹理加速。
* **智能参考线吸附**，解析线-线与线-曲线空间交点。
* **像素对齐**：针对奇数描边宽度自动应用 $\pm 0.5\text{px}$ 亚像素抗锯齿补偿。
* **几何拓扑吸附**：ViewBox 边界、锚点顶点与边缘中点吸附。

### 🌊 7. 渐变描边、变形与 Morph 混合
* **变宽描边**：Hermite $C^1$ 样条插值驱动的动态笔触宽度，支持模拟手绘墨水质感。
* **参数化混合工具 (Blend)**：矢量轮廓之间的拓扑形态与色值平滑过渡，内置防扭曲反向映射修正。
* **变形扭曲引擎**：同心圆弧弯曲与局部膨胀/收缩变形，无需离散为大量密集多边形。

### 🌐 8. 多语言国际化 (i18n) 与精细化界面
* **即时语言切换**：在状态栏一键在 英语 (<kbd>EN</kbd>)、西班牙语 (<kbd>ES</kbd>) 与 简体中文 (<kbd>ZH-CN</kbd>) 之间平滑切换，无需重新加载扩展。
* **全局无缝覆盖**：所有属性面板、浮动气泡提示、键盘快捷键速查表与 Mini-HUD 均实现 100% 本地化语言支持。
* **全矢量高精度图标体系**：全界面采用 `1.4px` 细腻专业描边设计，全面摒弃 Emoji，呈现工业级 IDE 工具质感。

### 🖼️ 9. 图像导入、纹理贴图与 Web 优化导出
* **交互式图像工具**：通过工具栏、画布拖放或剪贴板粘贴 (<kbd>Ctrl</kbd> + <kbd>V</kbd>) 导入位图图片（PNG、JPEG、WebP）。
* **上下文感知导入逻辑**：
  * *无选中图形*：在画布上创建独立的响应式 `<image>` 元素。
  * *选中矢量图形*：将图像作为 `<pattern>` 背景纹理无缝注入到当前矢量的 `fill` 属性中。
* **智能体积阈值判定**：小于 1.5 MB 且低于 1920 px 的轻量素材即时放置；较大资源将自动呼出 Web 保存优化面板。
* **Web 保存优化面板（左右双分屏对比 2-Up Viewport）**：
  * 原图与优化图并排实时对比，支持滚轮平移缩放同步联动与实时字节体积节省遥测。
  * 保持比例的多尺度缩放、调色板颜色量化（256 色至 16 色）、平滑滤镜与有损/无损压缩调节。
* **链接外置 vs Base64 内嵌**：支持将图像复制至本地并生成同级相对路径 (`svgName_id_img.ext`) 以保持 SVG 源码极简精炼，亦支持一键转存为 Data URI 独立自包含文件。

---

## ⌨️ 常用快捷键速查

| 快捷键 | 功能描述 |
| :--- | :--- |
| <kbd>V</kbd> | 选择工具 |
| <kbd>A</kbd> | 节点编辑工具 |
| <kbd>P</kbd> | 贝塞尔钢笔 |
| <kbd>L</kbd> | 直线工具 |
| <kbd>Y</kbd> | 折线工具 |
| <kbd>R</kbd> | 矩形工具 |
| <kbd>O</kbd> | 圆形工具 |
| <kbd>E</kbd> | 椭圆工具 |
| <kbd>G</kbd> | 正多边形工具 |
| <kbd>S</kbd> | 参数化星形工具 |
| <kbd>T</kbd> | 描边检查工具 |
| <kbd>C</kbd> | 剪刀工具 |
| <kbd>K</kbd> | 美工刀工具 |
| <kbd>Shift</kbd> + <kbd>E</kbd> | 矢量橡皮擦 |
| <kbd>F</kbd> | 智能填充工具 |
| <kbd>M</kbd> | 形状生成器工具 |
| <kbd>I</kbd> | 图像导入工具 |
| <kbd>+</kbd> | 添加顶点工具 |
| <kbd>Z</kbd> | 缩放与平移工具 |
| <kbd>D</kbd> | 切换自由变形 / 3x3 透视单应性 |
| <kbd>Ctrl</kbd> + <kbd>J</kbd> | 焊接 / 合并重合的选中顶点 |
| <kbd>Del</kbd> / <kbd>Backspace</kbd> | 删除选中的元素、节点或参考线 |
| <kbd>Ctrl</kbd> + <kbd>Z</kbd> / <kbd>Ctrl</kbd> + <kbd>Y</kbd> | 撤销 / 重做 |
| <kbd>Ctrl</kbd> + <kbd>0</kbd> | 重置中心并适配 ViewBox 至屏幕 |

---

## 🚀 快速上手

1. 在 **Visual Studio Code Marketplace** 或 **Open VSX** 中搜索并安装 **AntiDraw**。
2. 在 VS Code 资源管理器中右键单击任意 `.svg` 文件。
3. 选择 **"Reopen Editor With..."** ➔ **"AntiDraw SVG Editor"**（或设为 `.svg` 默认打开方式）。
4. 也可通过快捷键 `Ctrl+Shift+P`（macOS 上为 `Cmd+Shift+P`）呼出命令面板并输入：  
   `AntiDraw: Open with AntiDraw SVG Editor`

---

## ☕ 赞助与支持

AntiDraw 由独立开发者倾注心血持续构建与维护。本项目在 **Source-Available（源码可用）许可证** 下向全球社区免费提供，旨在让每一位开发者与设计师在日常代码编辑中享受酣畅淋漓的矢量创作体验。

如果 AntiDraw 为您节省了宝贵时间、提升了开发效率或助力了您的产品发布，欢迎支持它的后续研发与维护：

* ☕ **在 Ko-fi 平台赞助（支持国际信用卡与 PayPal）：**  
  👉 **[ko-fi.com/martinvarela206](https://ko-fi.com/martinvarela206)**
* ⭐ **点亮 Star：** 在 [GitHub](https://github.com/martinvarela206/AntiDraw) 上为本项目点一颗 Star，帮助更多开发者发现 AntiDraw！

---

## 📄 许可证与知识产权声明

Copyright © 2026 **Martin Varela** (`martinvarela206@gmail.com`).

AntiDraw 采用 **PolyForm Noncommercial License 1.0.0** 源码可用许可证授权：
* **免费使用、研读与修改**：适用于个人、教学、学术研究以及非商业性质的软件开发工作流。
* **强制署名**：任何分支（Fork）或再分发副本必须完整保留原作者版权声明并注明 Martin Varela 的署名。
* **禁止商业重分发**：未经作者明确的书面许可，严禁将 AntiDraw（或其衍生版本）二次包装、更名或作为商业产品进行销售。

详细法律条款请参阅完整的 [LICENSE](LICENSE) 文件。
