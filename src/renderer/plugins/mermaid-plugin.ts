// Mermaid 图表渲染插件
import type { RenderPlugin } from '../plugin-system';
import { registerPlugin } from '../plugin-system';
import mermaid from 'mermaid';

/** 待完成的渲染 Promise 集合（反竞态机制） */
const pendingRenders = new Set<Promise<unknown>>();

let mermaidInitialized = false;

/**
 * 初始化 Mermaid 引擎
 * @param theme Mermaid 主题：default / dark / neutral / forest
 */
function initMermaid(theme: 'default' | 'dark' | 'neutral' | 'forest' = 'default'): void {
    mermaid.initialize({
        startOnLoad: false,
        theme,
        securityLevel: 'loose',
        logLevel: 'error',
        suppressErrorRendering: true,
        fontSize: 14,
    });
    mermaidInitialized = true;
}

/**
 * 对 HTML 中的 mermaid 占位块进行异步 SVG 渲染
 * @param html markdown-it-mermaid 生成的基础 HTML
 * @returns 替换 SVG 后的 HTML
 */
async function renderMermaidDiagrams(html: string): Promise<string> {
    if (!mermaidInitialized) initMermaid();

    const mermaidRegex = /<pre class="mermaid">([\s\S]*?)<\/pre>/g;
    let match;
    const promises: Promise<{ search: string; replace: string }>[] = [];

    let idx = 0;
    while ((match = mermaidRegex.exec(html)) !== null) {
        const code = match[0];
        const content = match[1].trim();
        const id = `mermaid-${idx++}`;

        const renderPromise = mermaid
            .render(id, content)
            .then(result => ({
                search: code,
                replace: `<div class="mermaid-block"><div class="mermaid-preview">${result.svg}</div></div>`,
            }))
            .catch(e => ({
                search: code,
                replace: `<div class="mermaid-block"><div class="mermaid-error">Mermaid Error: ${e instanceof Error ? e.message : String(e)}</div></div>`,
            }))
            .finally(() => pendingRenders.delete(renderPromise));

        pendingRenders.add(renderPromise);
        promises.push(renderPromise);
    }

    const results = await Promise.all(promises);
    let resultHtml = html;
    for (const r of results) {
        resultHtml = resultHtml.replace(r.search, r.replace);
    }
    return resultHtml;
}

export const mermaidPlugin: RenderPlugin = {
    id: 'mermaid',
    name: 'Mermaid Diagrams',
    enabled: true,

    postRender: renderMermaidDiagrams,

    exportStyles: `
.mermaid-block {
    display: block;
    padding: 16px;
    margin: 1em 0;
    border-radius: var(--radius-md, 6px);
    background: var(--mermaid-background, var(--code-block-bg));
    border: 1px solid var(--border-color, #ddd);
}
.mermaid-preview {
    display: flex;
    justify-content: center;
    align-items: center;
}
.mermaid-preview svg { max-width: 100%; height: auto; }
.mermaid-error { color: var(--color-accent, #d32f2f); padding: 10px; }
    `,

    ensureRendered: async () => {
        await Promise.allSettled(Array.from(pendingRenders));
    },

    onThemeChange: (theme: string) => {
        const mermaidTheme = theme === 'dark' ? 'dark' : 'default';
        initMermaid(mermaidTheme);
    },
};

registerPlugin(mermaidPlugin);