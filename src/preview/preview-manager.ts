// 预览面板管理器 — WebView 面板生命周期管理 + Milkdown 编辑器同步
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { ThemeManager } from '../themes/theme-manager';
import { exportHTML } from '../export/html-exporter';
import { exportPDF } from '../export/pdf-exporter';
import { exportWord } from '../export/docx-exporter';
import { translateThemeCssForExport, translateEngineThemeCssForExport } from '../export/theme-style';

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
        this.registerActiveEditorListener();
        this.registerScrollSyncListeners();
    }

    private registerActiveEditorListener(): void {
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
                    console.error('[ColaView] onDidChangeActiveTextEditor error:', e);
                }
            }, null, this.disposables);
        } catch (e) {
            console.error('[ColaView] registerActiveEditorListener failed:', e);
        }
    }

    private registerScrollSyncListeners(): void {
        try {
            vscode.window.onDidChangeTextEditorSelection((event) => {
                try {
                    if (!this.isScrollSyncEnabled()) { return; }
                    const editor = event.textEditor;
                    if (Date.now() < this.editorScrollDelay) { return; }
                    if (editor.document.languageId !== 'markdown') { return; }
                    if (editor.document.uri.toString() !== this.currentUri?.toString()) { return; }

                    const topLine = getTopVisibleLine(editor);
                    const bottomLine = getBottomVisibleLine(editor);
                    if (typeof topLine === 'undefined' || typeof bottomLine === 'undefined') { return; }

                    const cursorLine = event.selections[0].active.line;
                    const topRatio = (bottomLine > topLine)
                        ? (cursorLine - topLine) / (bottomLine - topLine)
                        : 0.3;

                    this.panel?.webview.postMessage({
                        type: 'editorScroll',
                        line: cursorLine,
                        totalLines: editor.document.lineCount,
                        topRatio: Math.max(0, Math.min(1, topRatio)),
                    });
                } catch (e) {
                    // silently ignore errors in scroll sync handler
                }
            }, null, this.disposables);

            vscode.window.onDidChangeTextEditorVisibleRanges((event) => {
                try {
                    if (!this.isScrollSyncEnabled()) { return; }
                    const editor = event.textEditor;
                    if (Date.now() < this.editorScrollDelay) { return; }
                    if (editor.document.languageId !== 'markdown') { return; }
                    if (editor.document.uri.toString() !== this.currentUri?.toString()) { return; }

                    const totalLines = editor.document.lineCount;
                    if (totalLines <= 1) { return; }

                    const topLine = getTopVisibleLine(editor);
                    const bottomLine = getBottomVisibleLine(editor);
                    if (typeof topLine === 'undefined' || typeof bottomLine === 'undefined') { return; }

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
                    // silently ignore errors in scroll sync handler
                }
            }, null, this.disposables);
        } catch (e) {
            console.error('[ColaView] registerScrollSyncListeners failed:', e);
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
                switch (msg.type) {
                    case 'ready': {
                        const theme = ThemeManager.getCurrentTheme();
                        const markdown = this.pendingDocument?.getText() || '';
                        const builtins = ThemeManager.getBuiltinThemes();
                        const isCustom = !builtins.includes(theme);
                        const customCSS = isCustom ? ThemeManager.loadThemeCSS(theme) : undefined;
                        const themeCSS = ThemeManager.loadThemeCSS(theme);
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
                    case 'requestExportWord': {
                        this.handleExportWord();
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
                        if (msg.scrollPercent !== undefined) {
                            this.handleScrollSync({ scrollPercent: msg.scrollPercent });
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

    private async handleExportWord(): Promise<void> {
        if (!this.currentUri) {
            vscode.window.showWarningMessage('No Markdown file is open');
            return;
        }
        try {
            const document = await vscode.workspace.openTextDocument(this.currentUri);
            await exportWord(document);
        } catch (e) {
            vscode.window.showErrorMessage(`Word export failed: ${e instanceof Error ? e.message : String(e)}`);
        }
    }

    private async handleSwitchTheme(name: string): Promise<void> {
        await ThemeManager.switchTheme(name);
        const builtins = ThemeManager.getBuiltinThemes();
        const isCustom = !builtins.includes(name);
        const customCSS = isCustom ? ThemeManager.loadThemeCSS(name) : undefined;
        const themeCSS = ThemeManager.loadThemeCSS(name);
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
        const themeCSS = ThemeManager.loadThemeCSS(theme);
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
        const html = await new Promise<string>((resolve) => {
            this.exportResolve = resolve;
            const title = this.currentUri
                ? path.basename(this.currentUri.fsPath, '.md')
                : undefined;
            this.panel!.webview.postMessage({ type: 'exportHTML', title });
            setTimeout(() => {
                if (this.exportResolve) {
                    this.exportResolve('');
                    this.exportResolve = null;
                }
            }, 30000);
        });
        return this.patchExportHTML(html);
    }

    /**
     * 导出 HTML 后处理：
     * colamd.css 末尾带一条 Electron 桌面版专用的打印规则
     *   `@media print { body > :not(#editor-region), ... { display: none !important } }`
     * 它假定打印时 body 下只保留 #editor-region（ColaMD 桌面版结构），而我们的导出
     * HTML 是 <body><article class="colamd-document">，没有 #editor-region ——
     * article 会被整体隐藏，PDF/浏览器打印全部空白（仅剩一页空纸）。
     *
     * 覆盖规则用 :not(#_) 抬高特异性：原规则含 ID（:not(#editor-region) = 1,0,1），
     * 普通 class 选择器（0,1,2）同带 !important 时也输给它；:not(#_) 恒真但贡献
     * ID 特异性，得到 (1,1,2)，稳定压制原规则。
     * HTML 导出在浏览器中 Ctrl+P 同样受益。
     */
    private patchExportHTML(html: string): string {
        if (!html) return html;

        // colamd 导出器把 document.body 的 class 原样复制到导出 HTML 的 <body> 上，
        // 而它收集的主题规则（colamd.css 内置的 body.theme-X 字体/强调色/变量）全部
        // 以 body.theme-X 为作用域 —— body 缺主题类时这些规则整体失配，导出就只剩
        // 浅色默认样式。这里兜底把主题类补到导出 body 上。
        const theme = ThemeManager.getCurrentTheme();
        const isBuiltin = ThemeManager.getBuiltinThemes().includes(theme);
        const themeClass = isBuiltin ? ThemeManager.getThemeClass(theme) : 'theme-custom';
        let patched = html;
        const bodyTagMatch = /<body[^>]*>/i.exec(patched);
        if (bodyTagMatch) {
            const bodyTag = bodyTagMatch[0];
            if (/\sclass="/.test(bodyTag)) {
                if (!new RegExp(`\\s${themeClass}[\\s"]`).test(bodyTag)) {
                    patched = patched.replace(bodyTag, bodyTag.replace(/\sclass="/, ` class="${themeClass} `));
                }
            } else {
                patched = patched.replace(bodyTag, bodyTag.replace(/<body/i, `<body class="${themeClass}"`));
            }
        }

        // 自定义主题的规则不在 colamd.css 里（内置主题的翻译规则是冗余兜底），
        // 翻译成语义选择器后注入到 </head> 前，保证优先级最高。
        const themeOverrideCss = translateThemeCssForExport(ThemeManager.loadThemeCSS(theme));
        const THEME_FIX = themeOverrideCss ? `<style>${themeOverrideCss}</style>` : '';
        // colamd.css 里还有一批 body.theme-X .cm-content .cm-md-* 的正文差异化规则
        // （sepia/dark/notion/midnight/writer 等主题的加粗、行内代码、标题配色只存在于
        // 这一层），导出文档的语义化结构无法命中原选择器 —— 抽取并翻译后一并注入，
        // 导出的正文颜色才能跟预览一致。
        const ENGINE_THEME_FIX = `<style>${translateEngineThemeCssForExport(this.loadEngineColamdCss())}</style>`;
        const PRINT_FIX = `<style>@media print { body > article.colamd-document:not(#_) { display: block !important; } }</style>`;
        // 导出文档里 mermaid 块被引擎序列化成不带类名的 `<p><svg class="pele pele-…">…</svg></p>`
        // （实测 block widget 以非 .cm-line 子节点进入序列化，走段落分支，不是
        // `hte('mermaid')` 的 `<div>` 分支）—— .cm-md-mermaid 上的居中、--pele-* 令牌、
        // 代码块底色都随之丢掉。所以这里按导出文档的实际结构再补一份：<p> 容器给代码块底色
        // （图和代码块共用一块底，和 ColaMD 导出一致），SVG 用 block + 左右 auto 外边距居中。
        // 图上的缩放控件（.pele-zoom）是编辑器的东西，不是文档内容 —— 导出纸面上藏掉
        // （镜像 colamd-extend print-layout.ts 的修复；Chromium 打印不执行脚本，
        // pele 没机会收回它们，控件会叠在图上进 PDF）。
        const MERMAID_FIX = `<style>
/* 图表配色不要在这里重新推导：buildExportHTML 已经把预览里 \`.cm-md-mermaid\` 上
   实际生效的 --pele-* 变量（含自定义主题显式覆盖的值）收进导出文档的 :root，
   那才是“预览中的配色”。导出端只需要补两件引擎序列化时丢掉的东西：
   代码块底色背景（图和代码块共用一块底）与居中。 */
.colamd-document .cm-md-mermaid,
.colamd-document p:has(> svg.pele) {
  background: var(--code-block-bg);
  border-radius: 6px;
  padding: 0.8em 1em;
  text-align: center;
}
.colamd-document svg.pele {
  display: block; margin: 0 auto; max-width: 100%; height: auto;
}
.colamd-document .pele-zoom { display: none !important; }
</style>`;
        // 兜底：导出那一刻文档里没有已渲染的 mermaid 节点（虚拟滚动把它们卸载了）时，
        // 引擎收集不到 --pele-*，SVG 只能落回 pele 的浅色兜底色 —— 深色主题下整张图
        // 会明显偏离预览。仅在 :root 确实缺这组令牌时按引擎同一份公式补一次；
        // 已有运行时值的场景一律不动，避免覆盖预览里的真实配色。
        const PELE_TOKEN_FALLBACK = /:root\s*\{[^}]*--pele-bg\s*:/i.test(patched)
            ? ''
            : `<style>:root {
  --pele-bg: var(--code-block-bg);
  --pele-fg: var(--code-block-text, var(--text-color));
  --pele-muted: color-mix(in srgb, var(--code-block-text, var(--text-color)) 70%, var(--code-block-bg));
  --pele-line: var(--code-block-text, var(--text-color));
  --pele-surface: color-mix(in srgb, var(--code-block-text, var(--text-color)) 18%, var(--code-block-bg));
  --pele-surface-alt: color-mix(in srgb, var(--code-block-text, var(--text-color)) 28%, var(--code-block-bg));
  --pele-border: color-mix(in srgb, var(--code-block-text, var(--text-color)) 45%, var(--code-block-bg));
  --pele-accent: var(--link-color);
  --pele-radius: 6px;
}</style>`;
        return patched.replace('</head>', PRINT_FIX + '\n' + MERMAID_FIX + '\n' + PELE_TOKEN_FALLBACK + '\n' + ENGINE_THEME_FIX + '\n' + THEME_FIX + '\n</head>');
    }

    /**
     * 读取引擎自带的 colamd.css（与 WebView 加载的是同一份），供导出侧抽取主题规则。
     */
    private loadEngineColamdCss(): string {
        const outDir = path.join(this.context.extensionPath, 'out', 'preview', 'webview');
        const srcDir = path.join(this.context.extensionPath, 'src', 'preview', 'webview');
        const webviewDir = fs.existsSync(outDir) ? outDir : srcDir;
        try {
            return fs.readFileSync(path.join(webviewDir, 'colamd.css'), 'utf-8');
        } catch {
            return '';
        }
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
        const themeCSS = ThemeManager.loadThemeCSS(name);
        this.panel.webview.postMessage({ type: 'updateTheme', theme: name, customCSS, themeCSS });
        const list = ThemeManager.getThemeList();
        this.panel.webview.postMessage({ type: 'themeList', ...list });
    }

    refreshThemeList(): void {
        if (!this.panel) return;
        const list = ThemeManager.getThemeList();
        this.panel.webview.postMessage({ type: 'themeList', ...list });
    }

    private handleScrollSync(msg: { scrollPercent: number }): void {
        if (!this.isScrollSyncEnabled()) { return; }

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

        const nonce = getNonce();

        const indexPath = path.join(webviewDir, 'index.html');
        let html = fs.readFileSync(indexPath, 'utf-8');

        html = html.replace(
            /<meta http-equiv="Content-Security-Policy"[^>]*>/,
            `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline' vscode-webview-resource:; script-src 'nonce-${nonce}' vscode-webview-resource:; font-src vscode-webview-resource: data:; img-src file: data: https: vscode-webview-resource:; connect-src https: vscode-webview-resource:;">`
        );

        // colamd.css 必须内联为 <style>，不能用 <link>：
        // 跨源 <link> 的 cssRules 对 CSSOM 不可访问（SecurityError），buildExportHTML 的
        // collectExportStyles() 会静默丢掉全部渲染样式（1.43MB → 15KB），导出的 HTML/PDF
        // 就没有排版和 KaTeX 字体了。内联样式对 CSSOM 完全可读，导出管线才能完整带走样式。
        const colamdCss = fs.readFileSync(path.join(webviewDir, 'colamd.css'), 'utf-8')
            .replace(/<\/style/gi, '<\\/style') // 防 css 内容意外闭合 style 标签
            // 剥离 ColaMD 桌面版打印隐藏规则，从源头避免导出 HTML/PDF 里 article 被 display:none
            .replace(/@media\s*print\s*\{[^}]*\}/gi, (m) => m.includes('#editor-region') ? '' : m);
        html = html.replace(
            /<link rel="stylesheet" href="colamd\.css" id="colamd-css">/,
            `<style id="colamd-css">${colamdCss}</style>`
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