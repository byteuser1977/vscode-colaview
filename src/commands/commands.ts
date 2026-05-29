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
            previewManager.showPreview();
            const fullHTML = await previewManager.getExportHTML();
            if (!fullHTML) {
                vscode.window.showWarningMessage('ColaView: Could not get rendered HTML from preview');
                return;
            }
            await exportHTML(editor.document, fullHTML);
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
            previewManager.showPreview();
            const fullHTML = await previewManager.getExportHTML();
            if (!fullHTML) {
                vscode.window.showWarningMessage('ColaView: Could not get rendered HTML from preview');
                return;
            }
            await exportPDF(editor.document, fullHTML);
        }),

        vscode.commands.registerCommand('colaview.switchTheme', async () => {
            const list = ThemeManager.getThemeList();
            const items: vscode.QuickPickItem[] = [
                ...list.builtins.map(t => ({ label: t.charAt(0).toUpperCase() + t.slice(1), description: 'Built-in' })),
                ...list.customs.map(t => ({ label: t, description: 'Custom' })),
            ];
            const picked = await vscode.window.showQuickPick(items);
            if (picked) {
                const name = picked.label.toLowerCase();
                await ThemeManager.switchTheme(name);
                // 自定义主题需要通过 handleSwitchTheme 发送 CSS
                if (previewManager) {
                    previewManager.switchThemeFromCommand(name);
                }
            }
        }),

        vscode.commands.registerCommand('colaview.importTheme', async () => {
            const uris = await vscode.window.showOpenDialog({
                filters: { 'CSS Themes': ['css'] },
                canSelectMany: false,
            });
            if (uris && uris[0]) {
                await ThemeManager.importCustomTheme(uris[0]);
                // 导入后刷新主题列表
                if (previewManager) {
                    previewManager.refreshThemeList();
                }
            }
        })
    );
}
