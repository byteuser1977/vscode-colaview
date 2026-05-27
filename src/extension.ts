// 扩展激活入口
import * as vscode from 'vscode';
import { PreviewManager } from './preview/preview-manager';
import { registerCommands } from './commands/commands';
import { ThemeManager } from './themes/theme-manager';

export function activate(context: vscode.ExtensionContext) {
    // 1. 初始化主题管理器
    ThemeManager.init(context);

    // 2. 初始化预览管理器
    const previewManager = new PreviewManager(context);

    // 3. 注册所有命令
    registerCommands(context, previewManager);

    // 4. 自动预览（如果配置启用）
    if (vscode.workspace.getConfiguration('colaview').get('autoPreview')) {
        previewManager.showPreview();
    }

    vscode.window.showInformationMessage('ColaView MD activated');
}

export function deactivate() {}