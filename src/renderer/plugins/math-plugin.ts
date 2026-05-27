// KaTeX 数学公式渲染插件
import type { RenderPlugin } from '../plugin-system';
import { registerPlugin } from '../plugin-system';

export const mathPlugin: RenderPlugin = {
    id: 'math',
    name: 'Math Formulas',
    enabled: true,

    exportStyles: `
.math-inline {
    display: inline;
    padding: 2px 4px;
    border-radius: var(--radius-sm, 3px);
    background: var(--code-bg);
}
.math-inline .katex { font-size: 1.1em; }
.math-block {
    display: block;
    padding: 0.875em;
    margin: 1em 0;
    border-radius: var(--radius-md, 6px);
    background: var(--code-block-bg);
    text-align: center;
    overflow-x: auto;
}
.math-block .katex { font-size: 1.2em; }
    `,
};

registerPlugin(mathPlugin);