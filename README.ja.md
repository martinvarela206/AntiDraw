[ English ](README.md) | [ Español ](README.es.md) | [ 简体中文 ](README.zh-CN.md) | [ Deutsch ](README.de.md) | [ Français ](README.fr.md) | [ Русский ](README.ru.md) | [ 日本語 ](README.ja.md)

# AntiDraw — VS Code & Antigravity 向け SVG ベクターグラフィックエディタ

<p align="center">
  <img src="https://raw.githubusercontent.com/martinvarela206/AntiDraw/main/icon.png" width="128" height="128" alt="AntiDraw Logo" />
</p>

<p align="center">
  <strong>プロ仕様のベクター精度とコードエディタの高速性を兼ね備えたツール。</strong><br>
  <em>IDE の中で Figma の軽快な操作性と CorelDraw の厳密な幾何演算を一体化。</em>
</p>

<p align="center">
  <a href="https://marketplace.visualstudio.com/items?itemName=martinvarela206.antidraw"><img src="https://img.shields.io/badge/VS%20Code-Marketplace-007ACC?style=flat-square&logo=visual-studio-code" alt="VS Code Marketplace"></a>
  <a href="https://open-vsx.org/extension/martinvarela206/antidraw"><img src="https://img.shields.io/badge/Open--VSX-Registry-purple?style=flat-square" alt="Open VSX Registry"></a>
  <a href="https://github.com/martinvarela206/AntiDraw"><img src="https://img.shields.io/badge/GitHub-Repository-181717?style=flat-square&logo=github" alt="GitHub Repository"></a>
  <a href="https://github.com/martinvarela206/AntiDraw/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-Source--Available-blue?style=flat-square" alt="Source-Available License"></a>
  <a href="https://github.com/martinvarela206/AntiDraw"><img src="https://img.shields.io/badge/Status-Beta%20v0.97.1-orange?style=flat-square" alt="Status"></a>
</p>

<p align="center">
  <a href="https://ko-fi.com/martinvarela206" target="_blank">
    <img src="https://img.shields.io/badge/Ko--fi-開発者をサポート-FF5E5B?style=for-the-badge&logo=kofi&logoColor=white" alt="Support on Ko-fi">
  </a>
</p>

---

## 🌐 エコシステム & 配布リンク

| サービス / プラットフォーム | 説明 | リンク |
| :--- | :--- | :--- |
| 🐙 **GitHub リポジトリ** | ソースコード、ドキュメント、リリース、イシュー管理 | [github.com/martinvarela206/AntiDraw](https://github.com/martinvarela206/AntiDraw) |
| 🔷 **Visual Studio Marketplace** | 公式 Microsoft VS Code 拡張機能ストア | [marketplace.visualstudio.com/items?itemName=martinvarela206.antidraw](https://marketplace.visualstudio.com/items?itemName=martinvarela206.antidraw) |
| 🟣 **Open VSX Registry** | VSCodium、Antigravity、Gitpod 向けオープン拡張機能ストア | [open-vsx.org/extension/martinvarela206/antidraw](https://open-vsx.org/extension/martinvarela206/antidraw) |

---

> [!NOTE]
> **プロジェクトステータス: パブリックベータ (v0.97.1)**  
> AntiDraw は活発に開発が進められています。ベクター編集、ベジェ曲線、スナップ、ブール演算機能は安定して動作しますが、特殊な境界ケースが発生する場合があります。  
> ご意見やバグ報告は [GitHub Issues](https://github.com/martinvarela206/AntiDraw/issues) までお気軽にお寄せください。

---

## ⚡ AntiDraw を選ぶ理由

* **100% クリーンな W3C 標準 SVG**: 独自の名前空間タグ（`inkscape:*` 等）を一切含みません。React、Vue、Flutter などで即座に読み込み可能です。
* **Sidecar 永続化 (`.svg.json`)**: ガイドライン、回転中心、履歴、パラメータ状態を安全に別ファイルに保存し、SVGを一切汚しません。
* **コンテキストスイッチ不要**: エディタを離れることなく、ノードの調整、パスの結合、塗りの設定を直接実行できます。

---

## ✨ 主な機能

* **無限キャンバス & 高精度動的ルーラー** (`px`, `mm`, `cm`, `in` 対応)。
* **3モード変形バウンディングボックス**: 移動 (<kbd>W</kbd>)、拡大縮小 (<kbd>E</kbd>)、回転 (<kbd>R</kbd>)。
* **自由遠近歪み変形** (<kbd>D</kbd>)。
* **ベジェ曲線の直接ドラッグ成形** & 直線から曲線への自動昇格。
* **インテリジェントなパラメトリック基本図形** (角丸、円弧、星形深さ調整)。
* **平面図スマート塗りつぶし** & ベクターパスファインダー。
* **SVG国旗付き言語選択ポップアップメニュー** (日本語、英語、スペイン語、中国語、ドイツ語、フランス語、ロシア語)。

---

## ⌨️ 主なキーボードショートカット

| ショートカット | 機能 |
| :--- | :--- |
| <kbd>V</kbd> | 選択ツール |
| <kbd>A</kbd> | ノード編集ツール |
| <kbd>P</kbd> | ベジェペンツール |
| <kbd>L</kbd> | 直線ツール |
| <kbd>Y</kbd> | 折れ線ツール |
| <kbd>R</kbd> | 長方形ツール |
| <kbd>O</kbd> | 円ツール |
| <kbd>E</kbd> | 楕円ツール |
| <kbd>G</kbd> | 正多角形ツール |
| <kbd>S</kbd> | 星形ツール |
| <kbd>T</kbd> | 線ツール |
| <kbd>C</kbd> | はさみツール |
| <kbd>K</kbd> | ナイフツール |
| <kbd>Shift</kbd> + <kbd>E</kbd> | 消しゴムツール |
| <kbd>F</kbd> | スマート塗りつぶし |
| <kbd>M</kbd> | シェイプ形成ツール |
| <kbd>I</kbd> | 画像ツール |
| <kbd>+</kbd> | 頂点を追加 |
| <kbd>Z</kbd> | ズーム & パン |
| <kbd>D</kbd> | 自由変形切り替え |
| <kbd>Ctrl</kbd> + <kbd>J</kbd> | ノードを結合 |
| <kbd>Del</kbd> / <kbd>Backspace</kbd> | 要素を削除 |
| <kbd>Ctrl</kbd> + <kbd>Z</kbd> / <kbd>Ctrl</kbd> + <kbd>Y</kbd> | 元に戻す / やり直し |
| <kbd>Ctrl</kbd> + <kbd>0</kbd> | 画面中央にフィット |

---

## 📄 ライセンス

Copyright © 2026 **Martin Varela** (`martinvarela206@gmail.com`). **PolyForm Noncommercial License 1.0.0** (Source-Available)。詳細は [LICENSE](LICENSE) をご覧ください。
