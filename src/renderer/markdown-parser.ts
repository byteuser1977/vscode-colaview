// markdown-it 解析器 — Markdown → HTML 渲染核心
import MarkdownIt from 'markdown-it';
import { getEnabledPlugins } from './plugin-system';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const markdownItKatex = require('markdown-it-katex');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const markdownItMermaid = require('markdown-it-mermaid');

/** markdown-it 实例，配置 GFM 扩展 */
const md = new MarkdownIt({
    html: true,
    linkify: true,
    typographer: true,
    breaks: true,
});

// 注册 markdown-it 插件
md.use(require('markdown-it-task-lists'));
md.use(require('markdown-it-footnote'));
md.use(require('markdown-it-sub'));
md.use(require('markdown-it-sup'));
md.use(require('markdown-it-mark'));
md.use(markdownItKatex, {
    throwOnError: false,
    errorColor: '#cc0000',
});
md.use(markdownItMermaid);

/**
 * 同步解析 Markdown → HTML（不含异步后处理）
 * @param content Markdown 原始内容
 * @returns HTML 字符串
 */
export function parseMarkdown(content: string): string {
    return md.render(content);
}

/**
 * 解析 Markdown 并执行所有启用插件的异步后处理
 * @param content Markdown 原始内容
 * @returns 完整渲染后的 HTML 字符串
 */
export async function renderMarkdown(content: string): Promise<string> {
    let html = parseMarkdown(content);

    for (const plugin of getEnabledPlugins()) {
        if (plugin.postRender) {
            html = await plugin.postRender(html);
        }
    }

    return html;
}