// PDF 导出器 — 使用 Puppeteer headless Chrome 渲染
import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { renderMarkdown } from '../renderer/markdown-parser';
import { ThemeManager } from '../themes/theme-manager';
import { ensureAllPluginsRendered, collectExportStyles } from '../renderer/plugin-system';
import { collectCSSVariables, buildRootCSSBlock } from './css-collector';

/**
 * 导出当前 Markdown 文件为 A4 PDF。
 * 使用 Puppeteer headless Chrome 渲染：
 * 1. 等待异步渲染完成
 * 2. 构建完整 HTML（含主题 CSS、@page A4、printBackground）
 * 3. 保存为临时 .html 文件
 * 4. Puppeteer 打开并 printToPDF()
 * 5. 保存 PDF 到用户指定路径
 *
 * @param document 当前 Markdown 文档
 */
export async function exportPDF(document: vscode.TextDocument): Promise<void> {
    await ensureAllPluginsRendered();

    const renderedHTML = await renderMarkdown(document.getText());

    const theme = ThemeManager.getCurrentTheme();
    const foundationCSS = ThemeManager.loadFoundationCSS();
    const themeCSS = ThemeManager.loadThemeCSS(theme);
    const combinedCSS = foundationCSS + themeCSS;
    const cssVars = collectCSSVariables(combinedCSS);
    const rootBlock = buildRootCSSBlock(cssVars);
    const pluginStyles = collectExportStyles();

    const fullHTML = buildPrintHTML(renderedHTML, rootBlock, themeCSS, pluginStyles);

    const tmpDir = os.tmpdir();
    const tmpHtmlPath = path.join(tmpDir, `colaview-pdf-${Date.now()}.html`);
    fs.writeFileSync(tmpHtmlPath, fullHTML, 'utf-8');

    const defaultName = document.fileName.replace(/\.md$/, '.pdf');
    const uri = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(defaultName),
        filters: { 'PDF Files': ['pdf'] },
    });
    if (!uri) {
        try { fs.unlinkSync(tmpHtmlPath); } catch { /* ignore */ }
        return;
    }

    await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: 'Exporting PDF...',
            cancellable: false,
        },
        async () => {
            try {
                const puppeteer = require('puppeteer');
                const browser = await puppeteer.launch({ headless: true });
                const page = await browser.newPage();
                await page.goto(`file://${tmpHtmlPath}`, { waitUntil: 'networkidle0' });

                await new Promise(r => setTimeout(r, 500));

                const pdfBuffer = await page.pdf({
                    format: 'A4',
                    printBackground: true,
                    margin: { top: '15mm', right: '15mm', bottom: '15mm', left: '15mm' },
                });

                await browser.close();
                await vscode.workspace.fs.writeFile(uri, pdfBuffer);
                vscode.window.showInformationMessage(`Exported to ${uri.fsPath}`);
            } catch (e) {
                vscode.window.showErrorMessage(
                    `PDF export failed: ${e instanceof Error ? e.message : String(e)}`
                );
            } finally {
                try { fs.unlinkSync(tmpHtmlPath); } catch { /* ignore */ }
            }
        }
    );
}

/**
 * 构建打印用 HTML 文档
 */
function buildPrintHTML(
    html: string,
    rootBlock: string,
    themeCSS: string,
    pluginStyles: string
): string {
    return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.46/dist/katex.min.css">
<style>
${rootBlock}
${themeCSS}
${pluginStyles}

html, body {
    height: auto !important;
    overflow: visible !important;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
}
body {
    max-width: none;
    margin: 0;
    padding: 20px;
    font-size: 16px;
    font-family: var(--font-family-base, -apple-system, sans-serif);
    line-height: var(--line-height-base, 1.75);
    background: var(--color-bg);
    color: var(--color-text);
}

h1 { font-size: 2em; font-weight: 700; border-bottom: 1px solid var(--color-border); padding-bottom: .3em; margin: 1.5em 0 .5em; }
h2 { font-size: 1.5em; font-weight: 600; border-bottom: 1px solid var(--color-border); padding-bottom: .25em; margin: 1.5em 0 .5em; }
h3 { font-size: 1.25em; font-weight: 600; margin: 1.5em 0 .5em; }
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
    page-break-inside: avoid;
}
pre code { background: none; padding: 0; color: inherit; }
blockquote {
    border-left: 4px solid var(--blockquote-border);
    padding: 8px 16px;
    margin: 1em 0;
    color: var(--color-text-muted);
}
table { border-collapse: collapse; width: 100%; margin: 1em 0; page-break-inside: avoid; }
th, td { border: 1px solid var(--table-border, var(--color-border)); padding: 8px 12px; }
th { background: var(--table-header-bg); font-weight: 600; }
a { color: var(--color-link); text-decoration: none; }
img { max-width: 100%; }

.mermaid-error, .mermaid-loading { display: none !important; }
.mermaid-block { page-break-inside: avoid; }

@page { margin: 15mm; size: A4; }
</style>
</head>
<body>
<div id="write">${html}</div>
</body>
</html>`;
}