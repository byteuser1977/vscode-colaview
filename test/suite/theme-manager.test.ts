// 主题管理器单元测试
import * as assert from 'assert';

suite('Theme Manager', () => {
    test('should load built-in theme CSS files', () => {
        const fs = require('fs');
        const path = require('path');
        const themesPath = path.resolve(
            __dirname, '../../../src/themes/built-in'
        );
        const themes = ['light', 'dark', 'elegant', 'newsprint'];
        for (const t of themes) {
            const cssPath = path.join(themesPath, `${t}.css`);
            assert.ok(fs.existsSync(cssPath), `${t}.css should exist`);
            const css = fs.readFileSync(cssPath, 'utf-8');
            assert.ok(css.includes('--color-bg'), `${t}.css should have color-bg variable`);
        }
    });

    test('foundation.css should exist and contain variables', () => {
        const fs = require('fs');
        const path = require('path');
        const cssPath = path.resolve(
            __dirname, '../../../src/themes/foundation.css'
        );
        assert.ok(fs.existsSync(cssPath), 'foundation.css should exist');
        const css = fs.readFileSync(cssPath, 'utf-8');
        assert.ok(css.includes('--mermaid-cscale'), 'should have mermaid color scale');
        assert.ok(css.includes('--font-family-base'), 'should have font-family-base');
    });
});