// 预览面板管理器 — WebView 面板生命周期管理 + 编辑器实时同步
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { renderMarkdown } from '../renderer/markdown-parser';
import { ThemeManager } from '../themes/theme-manager';
import { collectExportStyles } from '../renderer/plugin-system';

/**
 * PreviewManager — 管理 WebView 预览面板的创建、更新和销毁
 */
export class PreviewManager {
    private panel: vscode.WebviewPanel | null = null;
    private currentUri: vscode.Uri | null = null;
    private debounceTimer: NodeJS.Timeout | null = null;
    private disposables: vscode.Disposable[] = [];

    constructor(private context: vscode.ExtensionContext) {
        // 注册编辑器切换事件
        vscode.window.onDidChangeActiveTextEditor(editor => {
            if (editor && editor.document.languageId === 'markdown' && this.panel) {
                if (this.currentUri?.toString() !== editor.document.uri.toString()) {
                    this.currentUri = editor.document.uri;
                    this.updatePreview(editor.document);
                }
            }
        }, null, this.disposables);
    }

    /**
     * 打开或聚焦预览面板
     */
    showPreview(): void {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document.languageId !== 'markdown') {
            vscode.window.showWarningMessage('No Markdown file is open');
            return;
        }

        this.currentUri = editor.document.uri;

        if (this.panel) {
            this.panel.reveal(vscode.ViewColumn.Two);
        } else {
            this.panel = vscode.window.createWebviewPanel(
                'colaview',
                `Preview: ${path.basename(editor.document.fileName)}`,
                vscode.ViewColumn.Two,
                {
                    enableScripts: true,
                    localResourceRoots: [
                        vscode.Uri.joinPath(this.context.extensionUri, 'media'),
                        vscode.Uri.joinPath(this.context.extensionUri, 'src', 'preview', 'webview'),
                        vscode.Uri.file(path.dirname(editor.document.fileName)),
                    ],
                    retainContextWhenHidden: true,
                }
            );

            this.panel.webview.html = this.buildWebViewHTML();
            this.panel.onDidDispose(() => { this.panel = null; }, null, this.disposables);

            // 编辑器内容变更 → 更新预览（150ms 防抖）
            vscode.workspace.onDidChangeTextDocument(e => {
                if (e.document.uri.toString() === this.currentUri?.toString()) {
                    if (this.debounceTimer) clearTimeout(this.debounceTimer);
                    this.debounceTimer = setTimeout(() => {
                        this.updatePreview(e.document);
                    }, 150);
                }
            }, null, this.disposables);
        }

        this.updatePreview(editor.document);
    }

    /**
     * 更新 WebView 预览内容
     * @param document 当前文本编辑器文档
     */
    private async updatePreview(document: vscode.TextDocument): Promise<void> {
        if (!this.panel) return;

        try {
            const markdown = document.getText();
            const html = await renderMarkdown(markdown);
            const theme = ThemeManager.getCurrentTheme();
            const foundationCSS = ThemeManager.loadFoundationCSS();
            const themeCSS = ThemeManager.loadThemeCSS(theme);
            const themeClass = ThemeManager.getThemeClass(theme);
            const basePath = vscode.Uri.file(path.dirname(document.fileName)).toString() + '/';

            this.panel.webview.postMessage({
                type: 'update',
                data: {
                    html,
                    themeCSS: foundationCSS + themeCSS,
                    themeClass,
                    basePath,
                },
            });
        } catch (e) {
            console.error('Preview update failed:', e);
        }
    }

    /**
     * 构建 WebView HTML 内容
     */
    private buildWebViewHTML(): string {
        const appJsPath = vscode.Uri.joinPath(
            this.context.extensionUri, 'src', 'preview', 'webview', 'app.js'
        );
        const appJsUri = this.panel!.webview.asWebviewUri(appJsPath);

        const indexPath = path.join(
            this.context.extensionPath, 'src', 'preview', 'webview', 'index.html'
        );
        const html = fs.readFileSync(indexPath, 'utf-8');

        return html.replace(
            '<script src="app.js"></script>',
            `<script src="${appJsUri}"></script>`
        );
    }

    /**
     * 释放所有资源
     */
    dispose(): void {
        this.panel?.dispose();
        this.disposables.forEach(d => d.dispose());
    }
}