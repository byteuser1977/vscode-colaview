// HTML 导出器 — WebView 的 buildExportHTML() 已生成完整独立 HTML，直接保存
import * as vscode from 'vscode';

/**
 * 导出 WebView 渲染的完整 HTML 为独立文件。
 * fullHTML 由 WebView 的 buildExportHTML() 生成，已包含所有 CSS 和主题。
 */
export async function exportHTML(document: vscode.TextDocument, fullHTML: string): Promise<void> {
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
