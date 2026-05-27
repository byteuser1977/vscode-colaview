// VSCode 命令注册 — 所有 ColaView MD 命令入口
import * as vscode from 'vscode';
import { PreviewManager } from '../preview/preview-manager';
import { ThemeManager } from '../themes/theme-manager';
import { exportHTML } from '../export/html-exporter';
import { exportPDF } from '../export/pdf-exporter';

/**
 * 注册所有 ColaView MD 命令
 * @param context VSCode 扩展上下文
 * @param previewManager 预览面板管理器
 */
export function registerCommands(
    context: vscode.ExtensionContext,
    previewManager: PreviewManager
): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('colaview.showPreview', () => {
            previewManager.showPreview();
        }),

        vscode.commands.registerCommand('colaview.exportHTML', async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor || editor.document.languageId !== 'markdown') {
                vscode.window.showWarningMessage('Open a Markdown file first');
                return;
            }
            await exportHTML(editor.document);
        }),

        vscode.commands.registerCommand('colaview.exportPDF', async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor || editor.document.languageId !== 'markdown') {
                vscode.window.showWarningMessage('Open a Markdown file first');
                return;
            }
            await exportPDF(editor.document);
        }),

        vscode.commands.registerCommand('colaview.switchTheme', async () => {
            const picked = await vscode.window.showQuickPick([
                { label: 'Light', description: 'Clean & bright' },
                { label: 'Dark', description: 'GitHub Dark style' },
                { label: 'Elegant', description: 'Warm serif style' },
                { label: 'Newsprint', description: 'Newsprint style' },
            ]);
            if (picked) {
                await ThemeManager.switchTheme(picked.label.toLowerCase());
                previewManager.showPreview();
            }
        }),

        vscode.commands.registerCommand('colaview.importTheme', async () => {
            const uris = await vscode.window.showOpenDialog({
                filters: { 'CSS Themes': ['css'] },
                canSelectMany: false,
            });
            if (uris && uris[0]) {
                await ThemeManager.importCustomTheme(uris[0]);
            }
        })
    );
}