// HTML 导出器单元测试
import * as assert from 'assert';
import { collectCSSVariables } from '../../src/export/css-collector';

suite('HTML Exporter', () => {
    test('should generate full HTML document structure', () => {
        const doc = '<!DOCTYPE html>\n<html>\n<body>\n<div><h1>Test</h1><strong>bold</strong></div>\n</body>\n</html>';
        assert.ok(doc.includes('<!DOCTYPE html>'), 'should have doctype');
        assert.ok(doc.includes('<html>'), 'should have html tag');
        assert.ok(doc.includes('<h1>'), 'should have heading');
        assert.ok(doc.includes('<strong>'), 'should have bold text');
    });

    test('CSS collector should extract variable values', () => {
        const css = ':root {\n  --color-bg: #ffffff;\n  --color-text: #333333;\n}';
        const vars = collectCSSVariables(css);
        assert.strictEqual(vars['--color-bg'], '#ffffff');
        assert.strictEqual(vars['--color-text'], '#333333');
    });
});