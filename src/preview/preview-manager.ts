// 预览面板管理器 — WebView 面板生命周期管理 + Milkdown 编辑器同步
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { ThemeManager } from '../themes/theme-manager';
import { exportHTML } from '../export/html-exporter';
import { exportPDF } from '../export/pdf-exporter';

function getNonce(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < 32; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

function getTopVisibleLine(editor: vscode.TextEditor): number | undefined {
    if (!editor.visibleRanges.length) {
        return undefined;
    }
    return editor.visibleRanges[0].start.line;
}

function getBottomVisibleLine(editor: vscode.TextEditor): number | undefined {
    if (!editor.visibleRanges.length) {
        return undefined;
    }
    const lastRange = editor.visibleRanges[editor.visibleRanges.length - 1];
    return lastRange.end.line;
}

export class PreviewManager {
    private panel: vscode.WebviewPanel | null = null;
    private currentUri: vscode.Uri | null = null;
    private debounceTimer: NodeJS.Timeout | null = null;
    private disposables: vscode.Disposable[] = [];
    private pendingDocument: vscode.TextDocument | null = null;
    private exportResolve: ((html: string) => void) | null = null;
    private editorScrollDelay = Date.now();

    constructor(private context: vscode.ExtensionContext) {
        try {
            this.setupEventListeners();
            console.log('[ColaView] PreviewManager constructor completed successfully');
        } catch (e) {
            console.error('[ColaView] PreviewManager constructor failed:', e);
            throw e;
        }
    }

    private setupEventListeners(): void {
        try {
            vscode.window.onDidChangeActiveTextEditor(editor => {
                try {
                    if (editor && editor.document.languageId === 'markdown' && this.panel) {
                        if (this.currentUri?.toString() !== editor.document.uri.toString()) {
                            this.currentUri = editor.document.uri;
                            this.updatePreview(editor.document);
                        }
                    }
                } catch (e) {
                    console.error('[ColaView] onDidChangeActiveTextEditor handler error:', e);
                }
            }, null, this.disposables);

            vscode.window.onDidChangeTextEditorSelection((event) => {
                try {
                    if (!this.isScrollSyncEnabled()) {
                        return;
                    }
                    const textEditor = event.textEditor;
                    if (Date.now() < this.editorScrollDelay) {
                        return;
                    }
                    if (textEditor.document.languageId !== 'markdown') {
                        return;
                    }
                    if (textEditor.document.uri.toString() !== this.currentUri?.toString()) {
                        return;
                    }

                    const topLine = getTopVisibleLine(textEditor);
                    const bottomLine = getBottomVisibleLine(textEditor);

                    if (typeof topLine === 'undefined' || typeof bottomLine === 'undefined') {
                        return;
                    }

                    const cursorLine = event.selections[0].active.line;
                    const topRatio = (bottomLine > topLine) 
                        ? (cursorLine - topLine) / (bottomLine - topLine) 
                        : 0.3;

                    this.panel?.webview.postMessage({
                        type: 'editorScroll',
                        line: cursorLine,
                        totalLines: textEditor.document.lineCount,
                        topRatio: Math.max(0, Math.min(1, topRatio)),
                    });
                } catch (e) {
                    console.error('[ColaView] onDidChangeTextEditorSelection handler error:', e);
                }
            }, null, this.disposables);

            vscode.window.onDidChangeTextEditorVisibleRanges((event) => {
                try {
                    if (!this.isScrollSyncEnabled()) {
                        return;
                    }
                    const textEditor = event.textEditor;
                    if (Date.now() < this.editorScrollDelay) {
                        return;
                    }
                    if (textEditor.document.languageId !== 'markdown') {
                        return;
                    }
                    if (textEditor.document.uri.toString() !== this.currentUri?.toString()) {
                        return;
                    }

                    const totalLines = textEditor.document.lineCount;
                    if (totalLines <= 1) {
                        return;
                    }

                    const topLine = getTopVisibleLine(textEditor);
                    const bottomLine = getBottomVisibleLine(textEditor);

                    if (typeof topLine === 'undefined' || typeof bottomLine === 'undefined') {
                        return;
                    }

                    let midLine: number;
                    if (topLine === 0) {
                        midLine = 0;
                    } else if (Math.floor(bottomLine) === totalLines - 1) {
                        midLine = bottomLine;
                    } else {
                        midLine = Math.floor((topLine + bottomLine) / 2);
                    }

                    const scrollPercent = midLine / (totalLines - 1);

                    this.panel?.webview.postMessage({
                        type: 'editorScroll',
                        scrollPercent: Math.max(0, Math.min(1, scrollPercent)),
                    });
                } catch (e) {
                    console.error('[ColaView] onDidChangeTextEditorVisibleRanges handler error:', e);
                }
            }, null, this.disposables);

            vscode.window.onDidChangeConfiguration((event) => {
                try {
                    if (event.affectsConfiguration('colaview.scrollSync')) {
                        console.log('[ColaView] scrollSync setting changed:', this.isScrollSyncEnabled());
                    }
                } catch (e) {
                    console.error('[ColaView] onDidChangeConfiguration handler error:', e);
                }
            }, null, this.disposables);
        } catch (e) {
            console.error('[ColaView] setupEventListeners failed:', e);
        }
    }

    private isScrollSyncEnabled(): boolean {
        try {
            return vscode.workspace.getConfiguration('colaview').get<boolean>('scrollSync', false);
        } catch {
            return false;
        }
    }

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

            this.panel.webview.onDidReceiveMessage((msg: { type: string; html?: string; message?: string; name?: string; scrollPercent?: number }) => {
                console.log('[ColaView] WebView message:', msg.type);
                switch (msg.type) {
                    case 'ready': {
                        const theme = ThemeManager.getCurrentTheme();
                        const markdown = this.pendingDocument?.getText() || '';
                        const builtins = ThemeManager.getBuiltinThemes();
                        const isCustom = !builtins.includes(theme);
                        const customCSS = isCustom ? ThemeManager.loadThemeCSS(theme) : undefined;
                        const themeCSS = ThemeManager.loadFoundationCSS() + ThemeManager.loadThemeCSS(theme);
                        console.log('[ColaView] Sending init: theme=', theme, 'isCustom=', isCustom, 'markdownLen=', markdown.length);
                        this.panel?.webview.postMessage({
                            type: 'init',
                            markdown,
                            theme,
                            customCSS,
                            themeCSS,
                        });
                        this.pendingDocument = null;
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
                    case 'scrollSync': {
                        this.handleScrollSync(msg);
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

    private async handleExportHTML(): Promise<void> {
        if (!this.currentUri) {
            vscode.window.showWarningMessage('No Markdown file is open');
            return;
        }
        try {
            const document = await vscode.workspace.openTextDocument(this.currentUri);
            const fullHTML = await this.getExportHTML();
            if (!fullHTML) {
                vscode.window.showWarningMessage('Could not get rendered HTML from preview');
                return;
            }
            await exportHTML(document, fullHTML);
        } catch (e) {
            vscode.window.showErrorMessage(`HTML export failed: ${e instanceof Error ? e.message : String(e)}`);
        }
    }

    private async handleExportPDF(): Promise<void> {
        if (!this.currentUri) {
            vscode.window.showWarningMessage('No Markdown file is open');
            return;
        }
        try {
            const document = await vscode.workspace.openTextDocument(this.currentUri);
            const fullHTML = await this.getExportHTML();
            if (!fullHTML) {
                vscode.window.showWarningMessage('Could not get rendered HTML from preview');
                return;
            }
            await exportPDF(document, fullHTML);
        } catch (e) {
            vscode.window.showErrorMessage(`PDF export failed: ${e instanceof Error ? e.message : String(e)}`);
        }
    }

    private async handleSwitchTheme(name: string): Promise<void> {
        await ThemeManager.switchTheme(name);
        const builtins = ThemeManager.getBuiltinThemes();
        const isCustom = !builtins.includes(name);
        const customCSS = isCustom ? ThemeManager.loadThemeCSS(name) : undefined;
        const themeCSS = ThemeManager.loadFoundationCSS() + ThemeManager.loadThemeCSS(name);
        this.panel?.webview.postMessage({ type: 'updateTheme', theme: name, customCSS, themeCSS });
        const list = ThemeManager.getThemeList();
        this.panel?.webview.postMessage({ type: 'themeList', ...list });
    }

    private updatePreview(document: vscode.TextDocument): void {
        if (!this.panel) return;

        const markdown = document.getText();
        const theme = ThemeManager.getCurrentTheme();
        const builtins = ThemeManager.getBuiltinThemes();
        const isCustom = !builtins.includes(theme);
        const customCSS = isCustom ? ThemeManager.loadThemeCSS(theme) : undefined;
        const themeCSS = ThemeManager.loadFoundationCSS() + ThemeManager.loadThemeCSS(theme);

        this.panel.webview.postMessage({
            type: 'update',
            markdown,
            theme,
            customCSS,
            themeCSS,
        });
    }

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

    sendTheme(theme: string): void {
        if (!this.panel) return;
        this.panel.webview.postMessage({ type: 'updateTheme', theme });
    }

    switchThemeFromCommand(name: string): void {
        if (!this.panel) return;
        const builtins = ThemeManager.getBuiltinThemes();
        const isCustom = !builtins.includes(name);
        const customCSS = isCustom ? ThemeManager.loadThemeCSS(name) : undefined;
        const themeCSS = ThemeManager.loadFoundationCSS() + ThemeManager.loadThemeCSS(name);
        this.panel.webview.postMessage({ type: 'updateTheme', theme: name, customCSS, themeCSS });
        const list = ThemeManager.getThemeList();
        this.panel.webview.postMessage({ type: 'themeList', ...list });
    }

    refreshThemeList(): void {
        if (!this.panel) return;
        const list = ThemeManager.getThemeList();
        this.panel.webview.postMessage({ type: 'themeList', ...list });
    }

    togglePlugin(id: string, enabled: boolean): void {
        if (!this.panel) return;
        this.panel.webview.postMessage({ type: 'togglePlugin', id, enabled });
    }

    private handleScrollSync(msg: { scrollPercent: number }): void {
        const scrollSyncEnabled = vscode.workspace.getConfiguration('colaview').get<boolean>('scrollSync', false);
        if (!scrollSyncEnabled) {
            return;
        }

        const scrollPercent = msg.scrollPercent;
        
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document.uri.toString() !== this.currentUri?.toString()) {
            return;
        }

        const totalLines = editor.document.lineCount;
        const targetLine = Math.floor(scrollPercent * (totalLines - 1));
        
        this.editorScrollDelay = Date.now() + 500;
        
        const range = new vscode.Range(targetLine, 0, targetLine + 1, 0);
        editor.revealRange(range, vscode.TextEditorRevealType.AtTop);
    }

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

    dispose(): void {
        this.panel?.dispose();
        this.disposables.forEach(d => d.dispose());
    }
}