// 独立 HTML 导出器
import * as vscode from 'vscode';
import { renderMarkdown } from '../renderer/markdown-parser';
import { ThemeManager } from '../themes/theme-manager';
import { ensureAllPluginsRendered, collectExportStyles } from '../renderer/plugin-system';
import { collectCSSVariables, buildRootCSSBlock } from './css-collector';

/**
 * 导出当前 Markdown 文件为独立 HTML 文件。
 * 1. 等待异步渲染完成
 * 2. 渲染 Markdown → HTML
 * 3. 收集 CSS 变量 → :root 块
 * 4. 注入主题 CSS + 插件样式
 * 5. 构建完整 HTML 文档
 * 6. 保存到用户指定路径
 *
 * @param document 当前 Markdown 文档
 */
export async function exportHTML(document: vscode.TextDocument): Promise<void> {
    // 1. 确保所有异步渲染完成
    await ensureAllPluginsRendered();

    // 2. 渲染 Markdown → HTML
    const renderedHTML = await renderMarkdown(document.getText());

    // 3. CSS 处理
    const theme = ThemeManager.getCurrentTheme();
    const themeClass = ThemeManager.getThemeClass(theme);
    const foundationCSS = ThemeManager.loadFoundationCSS();
    const themeCSS = ThemeManager.loadThemeCSS(theme);
    const combinedCSS = foundationCSS + themeCSS;
    const cssVars = collectCSSVariables(combinedCSS);
    const rootBlock = buildRootCSSBlock(cssVars);
    const pluginStyles = collectExportStyles();

    // 4. 构建完整 HTML
    const fullHTML = buildStandaloneHTML(renderedHTML, rootBlock, themeCSS, pluginStyles, themeClass);

    // 5. 保存文件
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
    pluginStyles: string,
    themeClass: string
): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>ColaView MD Export</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.46/dist/katex.min.css">
<style>
${rootBlock}
${themeCSS}
${pluginStyles}

body {
    max-width: 780px;
    margin: 40px auto;
    padding: 20px;
    font-size: var(--font-size-root, 16px);
    font-family: var(--font-family-base, -apple-system, sans-serif);
    line-height: var(--line-height-base, 1.75);
    background: var(--color-bg);
    color: var(--color-text);
}
h1 { font-size: 2em; font-weight: 700; border-bottom: 1px solid var(--color-border); padding-bottom: .3em; margin: 1.5em 0 .5em; }
h2 { font-size: 1.5em; font-weight: 600; border-bottom: 1px solid var(--color-border); padding-bottom: .25em; margin: 1.5em 0 .5em; }
h3 { font-size: 1.25em; font-weight: 600; margin: 1.5em 0 .5em; }
h4 { font-size: 1em; font-weight: 600; margin: 1.5em 0 .5em; }
p { margin: 0 0 0.75em; }
code {
    background: var(--code-bg);
    color: var(--code-color, var(--color-text));
    padding: 2px 6px;
    border-radius: var(--radius-sm, 3px);
    font-size: .875em;
    font-family: var(--font-family-code, monospace);
}
pre {
    background: var(--code-block-bg);
    color: var(--code-block-text, var(--color-text));
    padding: 16px;
    border-radius: var(--radius-md, 6px);
    overflow-x: auto;
    margin: 1em 0;
}
pre code { background: none; padding: 0; color: inherit; }
blockquote {
    border-left: 4px solid var(--blockquote-border);
    padding: 8px 16px;
    margin: 1em 0;
    color: var(--color-text-muted);
    background: var(--blockquote-bg);
}
table { border-collapse: collapse; width: 100%; margin: 1em 0; }
th, td { border: 1px solid var(--table-border, var(--color-border)); padding: 8px 12px; text-align: left; }
th { background: var(--table-header-bg); font-weight: 600; }
a { color: var(--color-link); text-decoration: none; }
a:hover { text-decoration: underline; }
img { max-width: 100%; height: auto; }
hr { border: none; border-top: 2px solid var(--color-border); margin: 2em 0; }
ul, ol { padding-left: 2em; margin: 0.75em 0; }
li { margin: 0.25em 0; }
.task-list-item { list-style: none; margin-left: -1.5em; }
.task-list-item input { margin-right: 6px; }

@media print {
    body { max-width: none; margin: 0; padding: 20px; }
}
</style>
</head>
<body class="${themeClass}">
<div id="write">${html}</div>
</body>
</html>`;
}