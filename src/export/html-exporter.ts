// 独立 HTML 导出器 — 从 WebView 获取渲染后的 HTML
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { ThemeManager } from '../themes/theme-manager';
import { collectCSSVariables, buildRootCSSBlock } from './css-collector';

/**
 * 加载 ColaMD 的 colamd.css（包含 ProseMirror、base、主题变量等）
 */
function loadColamdCSS(context: vscode.ExtensionContext): string {
    const outPath = path.join(context.extensionPath, 'out', 'preview', 'webview', 'colamd.css');
    const srcPath = path.join(context.extensionPath, 'src', 'preview', 'webview', 'colamd.css');
    const cssPath = fs.existsSync(outPath) ? outPath : srcPath;
    if (fs.existsSync(cssPath)) {
        return fs.readFileSync(cssPath, 'utf-8');
    }
    return '';
}

/**
 * 导出渲染后的 HTML 为独立 HTML 文件。
 * renderedHTML 由 WebView 的 Milkdown 编辑器生成（通过 getLiveHTML）。
 *
 * @param document 当前 Markdown 文档
 * @param renderedHTML WebView 渲染后的 HTML 片段
 */
export async function exportHTML(context: vscode.ExtensionContext, document: vscode.TextDocument, renderedHTML: string): Promise<void> {
    const theme = ThemeManager.getCurrentTheme();
    const themeClass = ThemeManager.getThemeClass(theme);
    const foundationCSS = ThemeManager.loadFoundationCSS();
    const themeCSS = ThemeManager.loadThemeCSS(theme);
    const combinedCSS = foundationCSS + themeCSS;
    const cssVars = collectCSSVariables(combinedCSS);
    const rootBlock = buildRootCSSBlock(cssVars);
    const colamdCSS = loadColamdCSS(context);

    console.log('[ColaView] exportHTML: renderedHTML length=', renderedHTML.length);
    console.log('[ColaView] exportHTML: renderedHTML preview=', renderedHTML.substring(0, 500));

    const fullHTML = buildStandaloneHTML(renderedHTML, rootBlock, themeCSS, themeClass, colamdCSS);

    const defaultName = document.fileName.replace(/\.md$/, '.html');
    const uri = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(defaultName),
        filters: { 'HTML Files': ['html'] },
    });
    if (uri) {
        await vscode.workspace.fs.writeFile(uri, Buffer.from(fullHTML, 'utf-8'));
        vscode.window.showInformationMessage(`Exported to ${uri.fsPath}`);
    }
}

/**
 * 构建独立 HTML 文档字符串
 */
function buildStandaloneHTML(
    html: string,
    rootBlock: string,
    themeCSS: string,
    themeClass: string,
    colamdCSS: string
): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>ColaView MD Export</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.46/dist/katex.min.css">
<style>
${colamdCSS}

${rootBlock}
${themeCSS}

/* Override base.css constraints for standalone export */
html, body {
    height: auto !important;
    overflow: visible !important;
}
body {
    max-width: 780px;
    margin: 40px auto;
    padding: 20px;
    font-size: 16px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    line-height: 1.75;
    background: var(--color-bg, #fff);
    color: var(--color-text, #24292f);
}
#editor {
    height: auto !important;
    overflow: visible !important;
    padding: 0 !important;
}
#editor .ProseMirror {
    min-height: auto !important;
}
h1 { font-size: 2em; font-weight: 700; border-bottom: 1px solid var(--color-border, #d0d7de); padding-bottom: .3em; margin: 1.5em 0 .5em; }
h2 { font-size: 1.5em; font-weight: 600; border-bottom: 1px solid var(--color-border, #d0d7de); padding-bottom: .25em; margin: 1.5em 0 .5em; }
h3 { font-size: 1.25em; font-weight: 600; margin: 1.5em 0 .5em; }
h4 { font-size: 1em; font-weight: 600; margin: 1.5em 0 .5em; }
p { margin: 0 0 0.75em; }
code {
    background: var(--code-bg, rgba(175,184,193,0.2));
    padding: 2px 6px;
    border-radius: 3px;
    font-size: .875em;
    font-family: 'SF Mono', 'Fira Code', Menlo, monospace;
}
pre {
    background: var(--code-block-bg, #f6f8fa);
    color: var(--code-block-text, var(--color-text, #24292f));
    padding: 16px;
    border-radius: 6px;
    overflow-x: auto;
    margin: 1em 0;
}
pre code { background: none; padding: 0; color: inherit; }
blockquote {
    border-left: 4px solid var(--blockquote-border, #ddd);
    padding: 8px 16px;
    margin: 1em 0;
    color: var(--color-text-muted, #656d76);
    background: var(--blockquote-bg, transparent);
}
table { border-collapse: collapse; width: 100%; margin: 1em 0; }
th, td { border: 1px solid var(--color-border, #d0d7de); padding: 8px 12px; text-align: left; }
th { background: var(--table-header-bg, #f6f8fa); font-weight: 600; }
a { color: var(--color-link, #0969da); text-decoration: none; }
a:hover { text-decoration: underline; }
img { max-width: 100%; height: auto; }
hr { border: none; border-top: 2px solid var(--color-border, #d0d7de); margin: 2em 0; }
ul, ol { padding-left: 2em; margin: 0.75em 0; }
li { margin: 0.25em 0; }

@media print {
    body { max-width: none; margin: 0; padding: 20px; }
}
</style>
</head>
<body class="${themeClass}">
${html}
</body>
</html>`;
}
