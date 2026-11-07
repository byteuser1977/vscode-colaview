// 从「预览所用主题 CSS」中抽取令牌，并把它翻译成导出文档可用的语义样式。
//
// 背景：预览里主题的排版/强调色通过 `#editor .cm-content .cm-md-*` 选择器生效；
// 而 buildExportHTML 会把内容序列化成 `<article class="colamd-document">` 语义 HTML
// （<h1>/<strong>/<em>/<code>/<table>/<blockquote>…），并只把 `:root` 变量带过去。
// 结果：颜色令牌能跟过去，但主题的字体、加粗/行内代码强调色、表格表头下划线等丢光。
// 这里把主题 CSS 的编辑器选择器改写成语义选择器，再注入导出 HTML / Word 样式。

/** .cm-md-* 装饰类 → 导出文档里的语义标签映射（顺序敏感，长的先）。 */
const CLASS_TO_TAG: Array<[RegExp, string]> = [
    [/\.cm-md-atxheading([1-6])\b/g, 'h$1'],
    [/\.cm-md-strong\b/g, 'strong'],
    [/\.cm-md-em\b/g, 'em'],
    [/\.cm-md-strike\b/g, 's'],
    [/\.cm-md-inlinecode\b/g, 'code'],
    [/\.cm-md-highlight\b/g, 'mark'],
    [/\.cm-md-link\b/g, 'a'],
    [/\.cm-md-url\b/g, 'a'],
    [/\.cm-md-blockquote\b/g, 'blockquote'],
    [/\.cm-md-codeblock(?:-first|-last)?\b/g, 'pre'],
    [/\.cm-md-codeinfo\b/g, 'pre'],
    [/\.cm-md-table-widget\b/g, 'table'],
    [/\.cm-md-table\b/g, 'table'],
    [/\.cm-md-hr\b/g, 'hr'],
    [/\.cm-md-task-checked\b/g, 'li'],
    [/\.cm-md-task\b/g, 'li'],
    [/\.cm-md-li-[0-6]\b/g, 'li'],
    [/\.cm-md-footnote-ref\b/g, 'sup'],
    [/\.cm-md-footnote-def\b/g, 'section'],
    [/\.cm-md-image\b/g, 'img'],
];

interface ThemeTokens {
    vars: Record<string, string>;
    fontFamily: string;
    lineHeight: number | null;
}

/** 解析主题 CSS 里的 `:root {}` 变量与 `.cm-content` 上的字体/行高。 */
function parseThemeTokens(themeCss: string): ThemeTokens {
    const vars: Record<string, string> = {};
    const rootMatch = /:root\s*\{([^}]*)\}/s.exec(themeCss);
    if (rootMatch) {
        const declRe = /(--[a-zA-Z0-9-]+)\s*:\s*([^;]+)/g;
        let m: RegExpExecArray | null;
        while ((m = declRe.exec(rootMatch[1]))) {
            vars[m[1]] = m[2].trim();
        }
    }

    // 遍历所有 `.cm-content { … }` 块：字体/行高可能不在第一个块里，
    // 优先取含 font-family 的那个（如 writer 主题的整站等宽字体）。
    let fontFamily = '';
    let lineHeight: number | null = null;
    const blockRe = /([^{}]*\.cm-content\b[^{}]*)\{([^}]*)\}/gs;
    let firstBlock: string | null = null;
    let m: RegExpExecArray | null;
    while ((m = blockRe.exec(themeCss))) {
        const body = m[2];
        if (firstBlock === null) firstBlock = body;
        const fontMatch = /font-family\s*:\s*([^;]+)/i.exec(body);
        if (fontMatch) {
            fontFamily = fontMatch[1].trim();
            const lineMatch = /line-height\s*:\s*([0-9.]+)/i.exec(body);
            if (lineMatch) lineHeight = parseFloat(lineMatch[1]);
            break;
        }
    }
    if (fontFamily === '' && firstBlock !== null) {
        const lineMatch = /line-height\s*:\s*([0-9.]+)/i.exec(firstBlock);
        if (lineMatch) lineHeight = parseFloat(lineMatch[1]);
    }

    return { vars, fontFamily, lineHeight };
}

/**
 * 把主题 CSS 中针对编辑器 DOM 的规则翻译成导出文档（`.colamd-document` 语义结构）能命中的规则。
 * 返回纯 CSS 文本（不含 <style> 包裹），供注入导出 HTML。
 */
export function translateThemeCssForExport(themeCss: string): string {
    if (!themeCss) return '';

    // 保留 :root 变量块：导出 HTML 里的 :root 是渲染端收集的「运行时变量」，
    // 当 webview body 缺主题类时会退回 colamd 的浅色默认值。注入的样式排在
    // 最后，同特异性下后者胜，能让主题变量稳定覆盖默认值（自定义主题的唯一变量来源）。
    let css = themeCss;

    // 导出的 <body> 即原编辑器 #editor 容器。
    css = css.replace(/#editor\b/g, 'body');

    // 编辑器内容容器 → 导出文档容器。
    css = css.replace(/\.cm-content\b/g, '.colamd-document');

    // 编辑器装饰类 → 语义标签。
    for (const [re, tag] of CLASS_TO_TAG) {
        css = css.replace(re, tag);
    }

    return css.trim();
}

/**
 * 从 colamd.css（引擎内置样式）里提取主题作用域的正文规则并翻译成导出可用的语义选择器。
 *
 * 背景：各主题的正文差异化规则（加粗/行内代码/标题配色、表格表头、引用块等）以
 * `body.theme-x .cm-content .cm-md-*` 形式写在引擎的 colamd.css 里，导出 HTML 虽然原样
 * 内联了 colamd.css，但导出文档是语义化结构（.colamd-document strong 等），这些规则
 * 全部无法命中 —— 表现为导出的加粗、行内代码等颜色与预览/ColaMD-extend 不一致。
 * 这里按主题抽出这些规则，套用与 translateThemeCssForExport 相同的映射翻译后返回。
 */
export function translateEngineThemeCssForExport(colamdCss: string): string {
    if (!colamdCss) return '';

    // 抽出所有 body.theme-* 作用域、且作用于编辑器内容层的规则块
    const ruleRe = /body\.theme-[a-z0-9-]+[^{}]*\.cm-content[^{}]*\{[^}]*\}/g;
    const rules = colamdCss.match(ruleRe);
    if (!rules || rules.length === 0) return '';

    const out = rules.join('\n');
    return translateThemeCssForExport(out);
}

/**
 * 从主题 CSS 构造 Word 导出用的样式令牌（docx 的 DocxStyle）。只覆盖能可靠取到的字段，
 * 其余由 markdownToDocx 的 normalizeStyle 回退到默认浅色样式。颜色返回原始值（hex），
 * 由 docx-exporter 的 hexColor 归一化。
 */
export function buildDocxStyleFromThemeCss(themeCss: string): Record<string, string | number | null> {
    const { vars, fontFamily, lineHeight } = parseThemeTokens(themeCss);

    const style: Record<string, string | number | null> = {};
    const put = (key: string, varName: string) => {
        if (vars[varName]) style[key] = vars[varName];
    };

    put('text', '--text-color');
    put('secondaryText', '--text-secondary');
    put('link', '--link-color');
    put('inlineCodeBackground', '--code-bg');
    put('codeBlockBackground', '--code-block-bg');
    put('codeBlockText', '--code-block-text');
    put('highlightBackground', '--highlight-bg');
    put('blockquoteBorder', '--blockquote-border');
    put('blockquoteBackground', '--blockquote-bg');
    put('border', '--border-color');
    put('tableHeaderBackground', '--table-header-bg');

    // 主题若显式定义了等宽字体栈（如自定义 .themes 主题），一并带上
    if (vars['--font-mono']) style.monoFontStack = vars['--font-mono'];

    if (fontFamily) style.bodyFontStack = fontFamily;
    if (lineHeight !== null && Number.isFinite(lineHeight)) style.lineHeight = lineHeight;

    return style;
}