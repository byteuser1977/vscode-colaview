// PDF 导出器 — 使用 puppeteer-core + 系统 Chrome/Edge 渲染
import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
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
 * 查找系统中已安装的 Chrome 或 Edge 可执行文件路径
 */
function findChromePath(): string | null {
    const platform = process.platform;
    const candidates: string[] = [];

    if (platform === 'darwin') {
        candidates.push(
            '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            '/Applications/Chromium.app/Contents/MacOS/Chromium',
            '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
            `${os.homedir()}/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`,
        );
    } else if (platform === 'win32') {
        const progFiles = process.env['PROGRAMFILES'] || 'C:\\Program Files';
        const progFilesX86 = process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)';
        const localAppData = process.env['LOCALAPPDATA'] || '';
        candidates.push(
            `${progFiles}\\Google\\Chrome\\Application\\chrome.exe`,
            `${progFilesX86}\\Google\\Chrome\\Application\\chrome.exe`,
            `${localAppData}\\Google\\Chrome\\Application\\chrome.exe`,
            `${progFiles}\\Microsoft\\Edge\\Application\\msedge.exe`,
            `${progFilesX86}\\Microsoft\\Edge\\Application\\msedge.exe`,
        );
    } else {
        candidates.push(
            '/usr/bin/google-chrome',
            '/usr/bin/google-chrome-stable',
            '/usr/bin/chromium',
            '/usr/bin/chromium-browser',
            '/snap/bin/chromium',
        );
    }

    for (const p of candidates) {
        if (fs.existsSync(p)) return p;
    }
    return null;
}

/**
 * 导出渲染后的 HTML 为 A4 PDF。
 * renderedHTML 由 WebView 的 Milkdown 编辑器生成（通过 getLiveHTML）。
 */
export async function exportPDF(context: vscode.ExtensionContext, document: vscode.TextDocument, renderedHTML: string): Promise<void> {
    const theme = ThemeManager.getCurrentTheme();
    const foundationCSS = ThemeManager.loadFoundationCSS();
    const themeCSS = ThemeManager.loadThemeCSS(theme);
    const combinedCSS = foundationCSS + themeCSS;
    const cssVars = collectCSSVariables(combinedCSS);
    const rootBlock = buildRootCSSBlock(cssVars);
    const colamdCSS = loadColamdCSS(context);

    const fullHTML = buildPrintHTML(renderedHTML, rootBlock, themeCSS, colamdCSS);

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
                const chromePath = findChromePath();
                if (!chromePath) {
                    throw new Error(
                        'Chrome or Edge not found. Please install Google Chrome or Microsoft Edge.'
                    );
                }

                const puppeteer = require('puppeteer-core');
                const browser = await puppeteer.launch({
                    headless: true,
                    executablePath: chromePath,
                });
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
    colamdCSS: string
): string {
    return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.46/dist/katex.min.css">
<style>
${colamdCSS}

${rootBlock}
${themeCSS}

html, body {
    height: auto !important;
    overflow: visible !important;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
}
#editor {
    height: auto !important;
    overflow: visible !important;
    padding: 0 !important;
}
#editor .ProseMirror {
    min-height: auto !important;
}
body {
    max-width: none;
    margin: 0;
    padding: 20px;
    font-size: 16px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    line-height: 1.75;
    background: var(--color-bg, #fff);
    color: var(--color-text, #24292f);
}

h1 { font-size: 2em; font-weight: 700; border-bottom: 1px solid var(--color-border, #d0d7de); padding-bottom: .3em; margin: 1.5em 0 .5em; }
h2 { font-size: 1.5em; font-weight: 600; border-bottom: 1px solid var(--color-border, #d0d7de); padding-bottom: .25em; margin: 1.5em 0 .5em; }
h3 { font-size: 1.25em; font-weight: 600; margin: 1.5em 0 .5em; }
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
    page-break-inside: avoid;
}
pre code { background: none; padding: 0; color: inherit; }
blockquote {
    border-left: 4px solid var(--blockquote-border, #ddd);
    padding: 8px 16px;
    margin: 1em 0;
    color: var(--color-text-muted, #656d76);
}
table { border-collapse: collapse; width: 100%; margin: 1em 0; page-break-inside: avoid; }
th, td { border: 1px solid var(--color-border, #d0d7de); padding: 8px 12px; }
th { background: var(--table-header-bg, #f6f8fa); font-weight: 600; }
a { color: var(--color-link, #0969da); text-decoration: none; }
img { max-width: 100%; }

.mermaid-error, .mermaid-loading { display: none !important; }
.mermaid-block { page-break-inside: avoid; }

@page { margin: 15mm; size: A4; }
</style>
</head>
<body>
${html}
</body>
</html>`;
}
