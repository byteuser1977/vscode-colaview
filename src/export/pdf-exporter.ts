// PDF 导出器 — 使用 puppeteer-core + 系统 Chrome/Edge 渲染
// fullHTML 由 WebView 的 buildExportHTML() 生成，已包含所有 CSS 和主题
import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

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
 * 导出完整 HTML 为 A4 PDF。
 * fullHTML 由 WebView 的 buildExportHTML() 生成，已是完整独立文档。
 */
export async function exportPDF(document: vscode.TextDocument, fullHTML: string): Promise<void> {
    // 在 </head> 前注入打印专用 CSS
    const printCSS = `<style>
html, body { height: auto !important; overflow: visible !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
body { max-width: none !important; margin: 0 !important; padding: 20px !important; }
.mermaid-error, .mermaid-loading { display: none !important; }
.mermaid-block { page-break-inside: avoid; }
@page { margin: 15mm; size: A4; }
</style>`;
    const htmlWithPrint = fullHTML.replace('</head>', printCSS + '\n</head>');

    const tmpDir = os.tmpdir();
    const tmpHtmlPath = path.join(tmpDir, `colaview-pdf-${Date.now()}.html`);
    fs.writeFileSync(tmpHtmlPath, htmlWithPrint, 'utf-8');

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
