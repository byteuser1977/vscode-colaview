// 预览面板管理器 — WebView 面板生命周期管理 + Milkdown 编辑器同步
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { ThemeManager } from '../themes/theme-manager';
import { exportHTML } from '../export/html-exporter';
import { exportPDF } from '../export/pdf-exporter';

/**
 * 生成随机 nonce 字符串，用于 CSP 安全策略
 */
function getNonce(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < 32; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

/**
 * PreviewManager — 管理 WebView 预览面板的创建、更新和销毁
 */
export class PreviewManager {
    private panel: vscode.WebviewPanel | null = null;
    private currentUri: vscode.Uri | null = null;
    private debounceTimer: NodeJS.Timeout | null = null;
    private disposables: vscode.Disposable[] = [];
    private pendingDocument: vscode.TextDocument | null = null;
    private exportResolve: ((html: string) => void) | null = null;

    constructor(private context: vscode.ExtensionContext) {
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
            this.updatePreview(editor.document);
        } else {
            this.panel = vscode.window.createWebviewPanel(
                'colaview',
                `Preview: ${path.basename(editor.document.fileName)}`,
                vscode.ViewColumn.Two,
                {
                    enableScripts: true,
                    localResourceRoots: [
                        vscode.Uri.joinPath(this.context.extensionUri, 'out', 'preview', 'webview'),
                        vscode.Uri.joinPath(this.context.extensionUri, 'src', 'preview', 'webview'),
                        vscode.Uri.file(path.dirname(editor.document.fileName)),
                    ],
                    retainContextWhenHidden: true,
                }
            );

            this.panel.webview.html = this.buildWebViewHTML();
            this.panel.onDidDispose(() => { this.panel = null; }, null, this.disposables);

            this.panel.webview.onDidReceiveMessage((msg: { type: string; html?: string; message?: string; name?: string }) => {
                console.log('[ColaView] WebView message:', msg.type);
                switch (msg.type) {
                    case 'ready': {
                        const theme = ThemeManager.getCurrentTheme();
                        const markdown = this.pendingDocument?.getText() || '';
                        console.log('[ColaView] Sending init: theme=', theme, 'markdownLen=', markdown.length);
                        this.panel?.webview.postMessage({
                            type: 'init',
                            markdown,
                            theme,
                        });
                        this.pendingDocument = null;
                        // 预推送主题列表，避免首次右键菜单为空
                        const list = ThemeManager.getThemeList();
                        this.panel?.webview.postMessage({ type: 'themeList', ...list });
                        break;
                    }
                    case 'exportHTMLResult': {
                        console.log('[ColaView] exportHTMLResult: htmlLen=', (msg.html || '').length);
                        if (this.exportResolve) {
                            this.exportResolve(msg.html || '');
                            this.exportResolve = null;
                        }
                        break;
                    }
                    case 'error': {
                        console.error('[ColaView] WebView error:', msg.message);
                        break;
                    }
                    case 'requestExportHTML': {
                        this.handleExportHTML();
                        break;
                    }
                    case 'requestExportPDF': {
                        this.handleExportPDF();
                        break;
                    }
                    case 'requestImportTheme': {
                        vscode.commands.executeCommand('colaview.importTheme');
                        break;
                    }
                    case 'requestThemeList': {
                        const list = ThemeManager.getThemeList();
                        this.panel?.webview.postMessage({ type: 'themeList', ...list });
                        break;
                    }
                    case 'switchTheme': {
                        if (msg.name) {
                            this.handleSwitchTheme(msg.name);
                        }
                        break;
                    }
                }
            }, null, this.disposables);

            this.pendingDocument = editor.document;

            vscode.workspace.onDidChangeTextDocument(e => {
                if (e.document.uri.toString() === this.currentUri?.toString()) {
                    if (this.debounceTimer) clearTimeout(this.debounceTimer);
                    this.debounceTimer = setTimeout(() => {
                        this.updatePreview(e.document);
                    }, 150);
                }
            }, null, this.disposables);
        }
    }

    /**
     * 处理导出 HTML 请求
     */
    private async handleExportHTML(): Promise<void> {
        if (!this.currentUri) {
            vscode.window.showWarningMessage('No Markdown file is open');
            return;
        }
        try {
            const document = await vscode.workspace.openTextDocument(this.currentUri);
            const renderedHTML = await this.getExportHTML();
            if (!renderedHTML) {
                vscode.window.showWarningMessage('Could not get rendered HTML from preview');
                return;
            }
            await exportHTML(this.context, document, renderedHTML);
        } catch (e) {
            vscode.window.showErrorMessage(`HTML export failed: ${e instanceof Error ? e.message : String(e)}`);
        }
    }

    /**
     * 处理导出 PDF 请求
     */
    private async handleExportPDF(): Promise<void> {
        if (!this.currentUri) {
            vscode.window.showWarningMessage('No Markdown file is open');
            return;
        }
        try {
            const document = await vscode.workspace.openTextDocument(this.currentUri);
            const renderedHTML = await this.getExportHTML();
            if (!renderedHTML) {
                vscode.window.showWarningMessage('Could not get rendered HTML from preview');
                return;
            }
            await exportPDF(this.context, document, renderedHTML);
        } catch (e) {
            vscode.window.showErrorMessage(`PDF export failed: ${e instanceof Error ? e.message : String(e)}`);
        }
    }

    /**
     * 处理切换主题请求
     */
    private async handleSwitchTheme(name: string): Promise<void> {
        await ThemeManager.switchTheme(name);
        // 自定义主题需要额外发送 CSS（内置主题由 applyTheme 处理）
        const builtins = ThemeManager.getBuiltinThemes();
        if (!builtins.includes(name)) {
            const css = ThemeManager.loadThemeCSS(name);
            if (css) {
                this.sendCustomThemeCSS(name, css);
            }
        }
        this.sendTheme(name);
        // 推送更新后的主题列表（current 已变化）
        const list = ThemeManager.getThemeList();
        this.panel?.webview.postMessage({ type: 'themeList', ...list });
    }

    /**
     * 更新 WebView 预览内容 — 发送 raw markdown，由 Milkdown 渲染
     */
    private updatePreview(document: vscode.TextDocument): void {
        if (!this.panel) return;

        const markdown = document.getText();
        const theme = ThemeManager.getCurrentTheme();

        this.panel.webview.postMessage({
            type: 'update',
            markdown,
            theme,
        });
    }

    /**
     * 从 WebView 获取渲染后的 HTML（用于导出）
     */
    async getExportHTML(): Promise<string> {
        if (!this.panel) {
            throw new Error('No preview panel is open. Please open a preview first.');
        }
        return new Promise<string>((resolve) => {
            this.exportResolve = resolve;
            this.panel!.webview.postMessage({ type: 'exportHTML' });
            setTimeout(() => {
                if (this.exportResolve) {
                    this.exportResolve('');
                    this.exportResolve = null;
                }
            }, 30000);
        });
    }

    /**
     * 向 WebView 发送主题切换消息
     */
    sendTheme(theme: string): void {
        if (!this.panel) return;
        this.panel.webview.postMessage({ type: 'updateTheme', theme });
    }

    /**
     * 向 WebView 发送自定义主题 CSS
     */
    sendCustomThemeCSS(name: string, css: string): void {
        if (!this.panel) return;
        this.panel.webview.postMessage({ type: 'applyCustomTheme', name, css });
    }

    /**
     * 向 WebView 发送插件开关消息
     */
    togglePlugin(id: string, enabled: boolean): void {
        if (!this.panel) return;
        this.panel.webview.postMessage({ type: 'togglePlugin', id, enabled });
    }

    /**
     * 构建 WebView HTML 内容
     */
    private buildWebViewHTML(): string {
        const outDir = path.join(this.context.extensionPath, 'out', 'preview', 'webview');
        const srcDir = path.join(this.context.extensionPath, 'src', 'preview', 'webview');
        const webviewDir = fs.existsSync(outDir) ? outDir : srcDir;

        const appJsPath = vscode.Uri.file(path.join(webviewDir, 'app.js'));
        const appJsUri = this.panel!.webview.asWebviewUri(appJsPath);

        const colamdCssPath = vscode.Uri.file(path.join(webviewDir, 'colamd.css'));
        const colamdCssUri = this.panel!.webview.asWebviewUri(colamdCssPath);

        const nonce = getNonce();

        const indexPath = path.join(webviewDir, 'index.html');
        let html = fs.readFileSync(indexPath, 'utf-8');

        html = html.replace(
            /<meta http-equiv="Content-Security-Policy"[^>]*>/,
            `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline' https://cdn.jsdelivr.net vscode-webview-resource:; script-src 'nonce-${nonce}' https://cdn.jsdelivr.net; font-src https://cdn.jsdelivr.net vscode-webview-resource: data:; img-src file: data: https: vscode-webview-resource:; connect-src https: vscode-webview-resource:;">`
        );

        html = html.replace(
            'href="colamd.css" id="colamd-css"',
            `href="${colamdCssUri}" id="colamd-css"`
        );

        html = html.replace(
            '<script src="app.js"></script>',
            `<script nonce="${nonce}" src="${appJsUri}"></script>`
        );

        return html;
    }

    /**
     * 释放所有资源
     */
    dispose(): void {
        this.panel?.dispose();
        this.disposables.forEach(d => d.dispose());
    }
}
