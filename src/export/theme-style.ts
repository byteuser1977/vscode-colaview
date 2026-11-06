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

    let fontFamily = '';
    let lineHeight: number | null = null;
    // 字体/行高定义在 `#editor .cm-content { … }`（或等价的 `… .cm-content { … }`）里。
    const contentMatch = /([^{}]*\.cm-content\b[^{}]*)\{([^}]*)\}/s.exec(themeCss);
    if (contentMatch) {
        const body = contentMatch[2];
        const fontMatch = /font-family\s*:\s*([^;]+)/i.exec(body);
        if (fontMatch) fontFamily = fontMatch[1].trim();
        const lineMatch = /line-height\s*:\s*([0-9.]+)/i.exec(body);
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

    // 去掉 :root 变量块（导出 HTML 已由渲染端重新收集运行时变量，无需重复注入）。
    let css = themeCss.replace(/:root\s*\{[^}]*\}/g, '');

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

    if (fontFamily) style.bodyFontStack = fontFamily;
    if (lineHeight !== null && Number.isFinite(lineHeight)) style.lineHeight = lineHeight;

    return style;
}