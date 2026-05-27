# ColaView MD

**ColaView MD — VSCode 富文本 Markdown 预览与 PDF/HTML 导出扩展**

[![VSCode](https://img.shields.io/badge/VSCode-1.85%2B-blue)](https://code.visualstudio.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/License-MIT-green)](LICENSE)

## ✨ 功能特性

- **富文本 Markdown 预览**：完整的 GFM（GitHub 风格 Markdown）支持，包括语法高亮、表格、任务列表、脚注等
- **数学公式渲染**：集成 KaTeX，支持美观的数学表达式（行内和块级模式）
- **图表支持**：Mermaid 图表，支持流程图、时序图、类图等多种类型
- **PDF 导出**：高质量 PDF 生成，支持自定义页面格式和边距
- **HTML 导出**：干净的 HTML 输出，可选图片嵌入和 CDN 支持
- **多主题支持**：内置主题包括浅色、深色、优雅、新闻纸风格
- **自定义主题**：导入和使用自己的 CSS 主题，打造个性化预览体验
- **插件系统**：可扩展架构，采用声明式插件接口设计

## 🚀 安装

### 从 VS Code 应用市场安装（即将上线）

```bash
# 在 VS Code 扩展市场中搜索 "ColaView MD"
# 或通过命令行安装：
code --install-extension bytechain.vscode-colaview
```

### 从源码安装

```bash
# 克隆仓库
git clone https://github.com/bytechain/vscode-colaview.git
cd vscode-colaview

# 安装依赖
npm install

# 编译扩展
npm run compile

# 打包发布文件
npm run package
```

## 📖 使用方法

### 显示预览

- **命令面板**：按 `Ctrl+Shift+P`（Mac 上为 `Cmd+Shift+P`），输入 `ColaView MD: Show Preview`
- **编辑器标题栏**：点击工具栏中的预览图标
- **右键菜单**：在 Markdown 文件中右键选择 `Show Preview`
- **自动预览**：在设置中启用自动预览功能，打开 Markdown 文件时自动显示预览

### 导出为 PDF

1. 打开一个 Markdown 文件
2. 按 `Ctrl+Shift+P` / `Cmd+Shift+P`
3. 输入 `ColaView MD: Export to PDF...`
4. 选择导出选项（格式、边距等）
5. 选择保存位置

### 导出为 HTML

1. 打开一个 Markdown 文件
2. 按 `Ctrl+Shift+P` / `Cmd+Shift+P`
3. 输入 `ColaView MD: Export to HTML...`
4. 配置导出设置（嵌入图片、包含 CDN 等）
5. 选择保存位置

### 切换主题

- 使用命令面板：`ColaView MD: Switch Preview Theme...`
- 或在设置中配置：`colaview.theme`

## ⚙️ 配置项

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `colaview.theme` | string | `light` | 视觉主题（`light`, `dark`, `elegant`, `newsprint`） |
| `colaview.plugins.math` | boolean | `true` | 启用 KaTeX 数学公式渲染 |
| `colaview.plugins.mermaid` | boolean | `true` | 启用 Mermaid 图表渲染 |
| `colaview.pdfMethod` | string | `puppeteer` | PDF 导出方式（`puppeteer`, `webviewPrint`） |
| `colaview.autoPreview` | boolean | `false` | 打开 Markdown 文件时自动显示预览 |
| `colaview.customThemesPath` | string | `` | 自定义主题 CSS 目录路径 |

## 🎨 支持的 Markdown 语法

### 基础语法
- 标题（H1-H6）
- 粗体、斜体、删除线
- 行内代码和带语法高亮的代码块
- 链接和图片
- 有序和无序列表
- 引用块

### 扩展语法（GFM）
- 表格
- 任务列表
- 脚注
- 删除线文本
- 上标和下标
- URL 自动链接

### 高级特性
- **数学公式**：通过 `$...$`（行内）和 `$$...$$`（块级）使用 LaTeX 数学语法
- **图表**：使用 Mermaid 图表语法创建各种类型的图表
- **语法高亮**：由 highlight.js 提供支持，覆盖 180+ 种编程语言

## 🏗️ 项目结构

```
src/
├── extension.ts              # 扩展入口文件
├── types.ts                  # 公共类型定义
├── renderer/
│   ├── markdown-parser.ts    # Markdown-it 解析器配置
│   ├── plugin-system.ts      # 声明式插件系统
│   └── plugins/
│       ├── math-plugin.ts    # KaTeX 数学渲染插件
│       └── mermaid-plugin.ts # Mermaid 图表插件
└── utils/
    └── file-utils.ts         # 文件操作工具函数
```

### 插件系统

本扩展采用了灵活的**声明式插件系统**：

```typescript
interface RenderPlugin {
  id: string;
  name: string;
  enabled: boolean;
  markdownItPlugin?: { plugin: any; options?: any };
  postRender?: (html: string) => Promise<string>;
  exportStyles?: string;
  ensureRendered?: () => Promise<void>;
  onThemeChange?: (theme: string) => void;
}
```

这种架构允许轻松添加新插件，同时保持清晰的关注点分离。

## 🔧 开发指南

### 环境要求

- Node.js >= 18.x
- npm >= 9.x
- VS Code >= 1.85.0
- TypeScript >= 5.7

### 环境搭建

```bash
# 安装依赖
npm install

# 启动开发监听模式
npm run watch

# 运行测试
npm test

# 生产环境构建
npm run compile

# 打包 .vsix 文件
npm run package
```

### 调试方法

在 VS Code 中打开本项目，按 F5 启动**扩展开发宿主**。扩展将在新窗口中加载，可用于调试。

## 📦 技术依赖

### 运行时依赖
- [markdown-it](https://github.com/markdown-it/markdown-it) - Markdown 解析器
- [highlight.js](https://highlightjs.org/) - 语法高亮
- [katex](https://katex.org/) - 数学公式渲染
- [mermaid](https://mermaid.js.org/) - 图表生成
- [puppeteer](https://pptr.dev/) - PDF 生成引擎

### 开发依赖
- [TypeScript](https://www.typescriptlang.org/) - 类型安全
- [@vscode/vsce](https://github.com/microsoft/vscode-vsce) - VS Code 打包工具
- [@vscode/test-electron](https://github.com/microsoft/vscode-test) - 测试工具

## 🤝 贡献指南

欢迎贡献！请随时提交 Issue 和 Pull Request。

1. Fork 本仓库
2. 创建功能分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'Add amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 创建 Pull Request

## 📄 许可证

本项目基于 MIT 许可证开源 - 详见 [LICENSE](LICENSE) 文件。

## 🙏 致谢

- [markdown-it](https://github.com/markdown-it/markdown-it) - 优秀的 Markdown 解析器
- [KaTeX](https://katex.org/) - 快速的数学排版库
- [Mermaid](https://mermaid.js.org/) - 强大的图表绘制工具
- [highlight.js](https://highlightjs.org/) - 语法高亮库
- [Puppeteer](https://pptr.dev/) - 无头 Chrome 自动化工具

---

**由 [ByteChain](https://github.com/bytechain) 用 ❤️ 制作**
