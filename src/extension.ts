// 扩展激活入口
import * as vscode from 'vscode';
import { PreviewManager } from './preview/preview-manager';
import { registerCommands } from './commands/commands';
import { ThemeManager } from './themes/theme-manager';

export function activate(context: vscode.ExtensionContext) {
    try {
        ThemeManager.init(context);
    } catch (e) {
        console.error('ColaView: ThemeManager.init failed:', e);
    }

    let previewManager: PreviewManager | null = null;
    try {
        previewManager = new PreviewManager(context);
    } catch (e) {
        console.error('ColaView: PreviewManager init failed:', e);
    }

    try {
        registerCommands(context, previewManager);
    } catch (e) {
        console.error('ColaView: registerCommands failed:', e);
    }

    if (previewManager && vscode.workspace.getConfiguration('colaview').get('autoPreview')) {
        try {
            previewManager.showPreview();
        } catch (e) {
            console.error('ColaView: autoPreview failed:', e);
        }
    }

    // Sync plugin toggle settings to WebView
    vscode.workspace.onDidChangeConfiguration(e => {
        if (!previewManager) return;
        const cfg = vscode.workspace.getConfiguration('colaview');
        if (e.affectsConfiguration('colaview.plugins.math')) {
            previewManager.togglePlugin('math', cfg.get('plugins.math', true));
        }
        if (e.affectsConfiguration('colaview.plugins.mermaid')) {
            previewManager.togglePlugin('mermaid', cfg.get('plugins.mermaid', true));
        }
    });

    vscode.window.showInformationMessage('ColaView MD activated');
}

export function deactivate() {}