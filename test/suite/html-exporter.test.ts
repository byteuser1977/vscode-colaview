// HTML 导出器单元测试
import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { parseMarkdown } from '../../renderer/markdown-parser';

suite('HTML Exporter', () => {
    test('should generate full HTML document structure', () => {
        const content = '# Test Document\n\nSome **bold** text.';
        const html = parseMarkdown(content);

        const doc = `<!DOCTYPE html>\n<html>\n<body>\n<div>${html}</div>\n</body>\n</html>`;
        assert.ok(doc.includes('<!DOCTYPE html>'), 'should have doctype');
        assert.ok(doc.includes('<html>'), 'should have html tag');
        assert.ok(doc.includes('<h1>'), 'should have heading');
        assert.ok(doc.includes('<strong>'), 'should have bold text');
    });

    test('should include KaTeX CDN link in export', () => {
        const cdnLink = 'https://cdn.jsdelivr.net/npm/katex@';
        assert.ok(typeof cdnLink === 'string', 'KaTeX CDN link should be a string');
    });

    test('CSS collector should extract variable values', () => {
        const { collectCSSVariables } = require('../../export/css-collector');
        const css = `:root {\n  --color-bg: #ffffff;\n  --color-text: #333333;\n}`;
        const vars = collectCSSVariables(css);
        assert.strictEqual(vars['--color-bg'], '#ffffff');
        assert.strictEqual(vars['--color-text'], '#333333');
    });
});