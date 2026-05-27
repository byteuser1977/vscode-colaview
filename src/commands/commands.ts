// VSCode 命令注册 — 所有 ColaView MD 命令入口
import * as vscode from 'vscode';
import { PreviewManager } from '../preview/preview-manager';
import { ThemeManager } from '../themes/theme-manager';
import { exportHTML } from '../export/html-exporter';
import { exportPDF } from '../export/pdf-exporter';

/**
 * 注册所有 ColaView MD 命令
 * @param context VSCode 扩展上下文
 * @param previewManager 预览面板管理器（可能为 null）
 */
export function registerCommands(
    context: vscode.ExtensionContext,
    previewManager: PreviewManager | null
): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('colaview.showPreview', () => {
            if (!previewManager) {
                vscode.window.showErrorMessage('ColaView: Preview manager not available');
                return;
            }
            previewManager.showPreview();
        }),

        vscode.commands.registerCommand('colaview.exportHTML', async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor || editor.document.languageId !== 'markdown') {
                vscode.window.showWarningMessage('Open a Markdown file first');
                return;
            }
            if (!previewManager) {
                vscode.window.showErrorMessage('ColaView: Preview manager not available');
                return;
            }
            // Ensure preview panel is open and get rendered HTML from WebView
            previewManager.showPreview();
            const renderedHTML = await previewManager.getExportHTML();
            if (!renderedHTML) {
                vscode.window.showWarningMessage('ColaView: Could not get rendered HTML from preview');
                return;
            }
            await exportHTML(context, editor.document, renderedHTML);
        }),

        vscode.commands.registerCommand('colaview.exportPDF', async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor || editor.document.languageId !== 'markdown') {
                vscode.window.showWarningMessage('Open a Markdown file first');
                return;
            }
            if (!previewManager) {
                vscode.window.showErrorMessage('ColaView: Preview manager not available');
                return;
            }
            // Ensure preview panel is open and get rendered HTML from WebView
            previewManager.showPreview();
            const renderedHTML = await previewManager.getExportHTML();
            if (!renderedHTML) {
                vscode.window.showWarningMessage('ColaView: Could not get rendered HTML from preview');
                return;
            }
            await exportPDF(context, editor.document, renderedHTML);
        }),

        vscode.commands.registerCommand('colaview.switchTheme', async () => {
            const list = ThemeManager.getThemeList();
            const items: vscode.QuickPickItem[] = [
                ...list.builtins.map(t => ({ label: t.charAt(0).toUpperCase() + t.slice(1), description: 'Built-in' })),
                ...list.customs.map(t => ({ label: t, description: 'Custom' })),
            ];
            const picked = await vscode.window.showQuickPick(items);
            if (picked) {
                const theme = picked.label.toLowerCase();
                await ThemeManager.switchTheme(theme);
                previewManager?.sendTheme(theme);
            }
        }),

        vscode.commands.registerCommand('colaview.importTheme', async () => {
            const uris = await vscode.window.showOpenDialog({
                filters: { 'CSS Themes': ['css'] },
                canSelectMany: false,
            });
            if (uris && uris[0]) {
                const result = await ThemeManager.importCustomTheme(uris[0]);
                if (result) {
                    previewManager?.sendCustomThemeCSS(result.name, result.css);
                }
            }
        })
    );
}
