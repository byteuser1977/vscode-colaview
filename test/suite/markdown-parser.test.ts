// Markdown 解析器单元测试
import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { parseMarkdown, renderMarkdown } from '../../renderer/markdown-parser';

suite('Markdown Parser', () => {
    test('should parse basic Markdown to HTML', () => {
        const content = fs.readFileSync(
            path.resolve(__dirname, '../../test/fixtures/basic.md'), 'utf-8'
        );
        const html = parseMarkdown(content);
        assert.ok(html.includes('<h2>'), 'should contain h2 heading');
        assert.ok(html.includes('<code>'), 'should contain inline code');
        assert.ok(html.includes('<pre><code'), 'should contain code block');
        assert.ok(html.includes('<blockquote>'), 'should contain blockquote');
        assert.ok(html.includes('<table>'), 'should contain table');
    });

    test('should render KaTeX inline math', () => {
        const content = fs.readFileSync(
            path.resolve(__dirname, '../../test/fixtures/math.md'), 'utf-8'
        );
        const html = parseMarkdown(content);
        assert.ok(html.includes('katex'), 'should contain KaTeX elements');
    });

    test('should render Mermaid diagrams', async () => {
        const content = fs.readFileSync(
            path.resolve(__dirname, '../../test/fixtures/mermaid.md'), 'utf-8'
        );
        const html = await renderMarkdown(content);
        assert.ok(html.includes('mermaid-preview'), 'should contain mermaid SVG blocks');
    });
});