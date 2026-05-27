// CSS 变量收集器
// 从主题 CSS 文本中提取所有设计令牌的声明值

/** 设计令牌变量名清单 */
const DESIGN_TOKEN_NAMES = [
    '--font-family-base', '--font-family-heading', '--font-family-code',
    '--font-size-root', '--line-height-base',
    '--color-bg', '--color-text', '--color-text-muted',
    '--color-border', '--color-link', '--color-accent',
    '--color-accent-dark', '--color-accent-light',
    '--color-selection-bg',
    '--code-bg', '--code-color', '--code-block-bg', '--code-block-text',
    '--blockquote-bg', '--blockquote-border', '--blockquote-color',
    '--table-header-bg', '--table-border',
    '--radius-sm', '--radius-md', '--radius-lg',
    '--mermaid-background', '--mermaid-border-color',
    '--mermaid-node-stroke', '--mermaid-node-fill', '--mermaid-node-text',
    '--mermaid-edge-stroke', '--mermaid-edge-stroke-width',
    '--mermaid-cluster-stroke', '--mermaid-cluster-fill',
    '--mermaid-label-text', '--mermaid-font-family', '--mermaid-font-size',
    '--mermaid-cscale0', '--mermaid-cscale1', '--mermaid-cscale2',
    '--mermaid-cscale3', '--mermaid-cscale4', '--mermaid-cscale5',
    '--mermaid-cscale6', '--mermaid-cscale7', '--mermaid-cscale8',
    '--mermaid-cscale9', '--mermaid-cscale10', '--mermaid-cscale11',
];

/**
 * 从 CSS 文本中提取所有设计令牌的声明值
 * @param themeCSS 主题 CSS 文本（foundation + theme）
 * @returns 变量名 → 变量值的映射
 */
export function collectCSSVariables(themeCSS: string): Record<string, string> {
    const vars: Record<string, string> = {};
    for (const name of DESIGN_TOKEN_NAMES) {
        const escaped = name.replace(/-/g, '\\-');
        const regex = new RegExp(`${escaped}\\s*:\\s*([^;]+);`);
        const match = themeCSS.match(regex);
        if (match) vars[name] = match[1].trim();
    }
    return vars;
}

/**
 * 生成 :root CSS 块（用于导出 HTML）
 * @param vars CSS 变量映射
 */
export function buildRootCSSBlock(vars: Record<string, string>): string {
    const lines = Object.entries(vars).map(([k, v]) => `  ${k}: ${v};`);
    return `:root {\n${lines.join('\n')}\n}`;
}