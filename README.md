# ColaView MD

**ColaView MD — Rich Markdown Preview & PDF/HTML Export for VSCode**

[![VSCode](https://img.shields.io/badge/VSCode-1.85%2B-blue)](https://code.visualstudio.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/License-MIT-green)](LICENSE)

## ✨ Features

- **Rich Markdown Preview**: Full GFM (GitHub Flavored Markdown) support with syntax highlighting, tables, task lists, footnotes, and more
- **Math Formula Rendering**: KaTeX integration for beautiful mathematical expressions (inline and display mode)
- **Diagram Support**: Mermaid diagrams for flowcharts, sequence diagrams, class diagrams, and more
- **PDF Export**: High-quality PDF generation with customizable page format and margins
- **HTML Export**: Clean HTML output with optional image embedding and CDN support
- **Multiple Themes**: Built-in themes including Light, Dark, Elegant, and Newsprint
- **Custom Themes**: Import and use your own CSS themes for personalized preview experience
- **Plugin System**: Extensible architecture with declarative plugin interface

## 🚀 Installation

### From VS Code Marketplace (Coming Soon)

```bash
# Search for "ColaView MD" in VS Code Extensions marketplace
# Or install via command line:
code --install-extension bytechain.vscode-colaview
```

### From Source

```bash
# Clone the repository
git clone https://github.com/bytechain/vscode-colaview.git
cd vscode-colaview

# Install dependencies
npm install

# Compile the extension
npm run compile

# Package for distribution
npm run package
```

## 📖 Usage

### Show Preview

- **Command Palette**: Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on Mac) and type `ColaView MD: Show Preview`
- **Editor Title Bar**: Click the preview icon in the editor toolbar
- **Right-click Context Menu**: Right-click in a Markdown file and select `Show Preview`
- **Auto Preview**: Enable auto-preview in settings to automatically show preview when opening Markdown files

### Export to PDF

1. Open a Markdown file
2. Press `Ctrl+Shift+P` / `Cmd+Shift+P`
3. Type `ColaView MD: Export to PDF...`
4. Choose export options (format, margins)
5. Select save location

### Export to HTML

1. Open a Markdown file
2. Press `Ctrl+Shift+P` / `Cmd+Shift+P`
3. Type `ColaView MD: Export to HTML...`
4. Configure export settings (embed images, include CDN)
5. Select save location

### Switch Theme

- Use Command Palette: `ColaView MD: Switch Preview Theme...`
- Or configure in Settings: `colaview.theme`

## ⚙️ Configuration

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `colaview.theme` | string | `light` | Visual theme (`light`, `dark`, `elegant`, `newsprint`) |
| `colaview.plugins.math` | boolean | `true` | Enable KaTeX math formula rendering |
| `colaview.plugins.mermaid` | boolean | `true` | Enable Mermaid diagram rendering |
| `colaview.pdfMethod` | string | `puppeteer` | PDF export method (`puppeteer`, `webviewPrint`) |
| `colaview.autoPreview` | boolean | `false` | Auto show preview on opening Markdown files |
| `colaview.customThemesPath` | string | `` | Custom theme CSS directory path |

## 🎨 Supported Markdown Features

### Basic Syntax
- Headings (H1-H6)
- Bold, Italic, Strikethrough
- Inline code and code blocks with syntax highlighting
- Links and images
- Lists (ordered and unordered)
- Blockquotes

### Extended Syntax (GFM)
- Tables
- Task lists
- Footnotes
- Strikethrough text
- Superscript and subscript
- Auto-linking URLs

### Advanced Features
- **Math Formulas**: LaTeX math via `$...$` (inline) and `$$...$$` (display)
- **Diagrams**: Mermaid diagram syntax for various chart types
- **Syntax Highlighting**: Powered by highlight.js with 180+ languages

## 🏗️ Architecture

```
src/
├── extension.ts              # Extension entry point
├── types.ts                  # Common type definitions
├── renderer/
│   ├── markdown-parser.ts    # Markdown-it parser configuration
│   ├── plugin-system.ts      # Declarative plugin interface
│   └── plugins/
│       ├── math-plugin.ts    # KaTeX math rendering plugin
│       └── mermaid-plugin.ts # Mermaid diagram plugin
└── utils/
    └── file-utils.ts         # File operation utilities
```

### Plugin System

The extension uses a **declarative plugin system** powered by a flexible declarative plugin interface:

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

This architecture allows easy extension with new plugins while maintaining clean separation of concerns.

## 🔧 Development

### Prerequisites

- Node.js >= 18.x
- npm >= 9.x
- VS Code >= 1.85.0
- TypeScript >= 5.7

### Setup

```bash
# Install dependencies
npm install

# Start development watch mode
npm run watch

# Run tests
npm test

# Build for production
npm run compile

# Package .vsix file
npm run package
```

### Debugging

Open the project in VS Code and press F5 to launch the Extension Development Host. The extension will be loaded in the new window for debugging.

## 📦 Dependencies

### Runtime Dependencies
- [markdown-it](https://github.com/markdown-it/markdown-it) - Markdown parser
- [highlight.js](https://highlightjs.org/) - Syntax highlighting
- [katex](https://katex.org/) - Math formula rendering
- [mermaid](https://mermaid.js.org/) - Diagram generation
- [puppeteer](https://pptr.dev/) - PDF generation engine

### Dev Dependencies
- [TypeScript](https://www.typescriptlang.org/) - Type safety
- [@vscode/vsce](https://github.com/microsoft/vscode-vsce) - VS Code packaging tool
- [@vscode/test-electron](https://github.com/microsoft/vscode-test) - Testing utilities

## 🤝 Contributing

Contributions are welcome! Please feel free to submit issues and pull requests.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [markdown-it](https://github.com/markdown-it/markdown-it) - Excellent Markdown parser
- [KaTeX](https://katex.org/) - Fast math typesetting library
- [Mermaid](https://mermaid.js.org/) - Diagramming and charting tool
- [highlight.js](https://highlightjs.org/) - Syntax highlighting library
- [Puppeteer](https://pptr.dev/) - Headless Chrome automation

---

**Made with ❤️ by [ByteChain](https://github.com/bytechain)**
# vscode-colaview
