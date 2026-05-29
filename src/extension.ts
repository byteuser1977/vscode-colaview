// 扩展激活入口
import * as vscode from 'vscode';
import { PreviewManager } from './preview/preview-manager';
import { registerCommands } from './commands/commands';
import { ThemeManager } from './themes/theme-manager';

export function activate(context: vscode.ExtensionContext) {
    console.log('ColaView: Activating extension...');
    
    let themeManagerReady = false;
    try {
        ThemeManager.init(context);
        themeManagerReady = true;
        console.log('ColaView: ThemeManager initialized');
    } catch (e) {
        console.error('ColaView: ThemeManager.init failed:', e);
        vscode.window.showWarningMessage(`ColaView: ThemeManager init failed, some features may not work: ${e instanceof Error ? e.message : String(e)}`);
    }

    let previewManager: PreviewManager | null = null;
    try {
        previewManager = new PreviewManager(context);
        console.log('ColaView: PreviewManager initialized');
    } catch (e) {
        console.error('ColaView: PreviewManager init failed:', e);
        vscode.window.showErrorMessage(`ColaView: Failed to initialize preview manager: ${e instanceof Error ? e.message : String(e)}. Please check the developer console for more details.`);
    }

    try {
        registerCommands(context, previewManager);
        console.log('ColaView: Commands registered');
    } catch (e) {
        console.error('ColaView: registerCommands failed:', e);
        vscode.window.showErrorMessage(`ColaView: registerCommands failed: ${e instanceof Error ? e.message : String(e)}`);
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