// 模拟 VS Code 扩展加载，逐步定位报错
const path = require('path');

// 1. 测试 markdown-it 加载
console.log('--- Step 1: markdown-it ---');
try {
    const MarkdownIt = require('markdown-it').default || require('markdown-it');
    const md = new MarkdownIt({ html: true, breaks: true });
    console.log('markdown-it: OK, version =', require('markdown-it/package.json').version);
} catch(e) {
    console.log('markdown-it: FAIL -', e.message);
}

// 2. 测试各插件加载
console.log('\n--- Step 2: plugins ---');
const plugins = [
    'markdown-it-task-lists',
    'markdown-it-footnote',
    'markdown-it-sub',
    'markdown-it-sup',
    'markdown-it-mark',
    'markdown-it-katex',
    '@agoose77/markdown-it-mermaid',
];
for (const mod of plugins) {
    try {
        let p = require(mod);
        if (p.default) p = p.default;
        console.log(`${mod}: OK (type: ${typeof p})`);
    } catch(e) {
        console.log(`${mod}: FAIL - ${e.message}`);
    }
}

// 3. 测试 mermaid 加载
console.log('\n--- Step 3: mermaid ---');
try {
    const mermaid = require('mermaid');
    console.log('mermaid: OK (type:', typeof mermaid, ', keys:', Object.keys(mermaid).slice(0,5).join(','), ')');
} catch(e) {
    console.log('mermaid: FAIL -', e.message);
}

// 4. 测试 puppeteer 加载
console.log('\n--- Step 4: puppeteer ---');
try {
    const puppeteer = require('puppeteer');
    console.log('puppeteer: OK (type:', typeof puppeteer, ')');
} catch(e) {
    console.log('puppeteer: FAIL -', e.message);
}

// 5. 测试整个 markdown-parser 模块加载
console.log('\n--- Step 5: markdown-parser module ---');
try {
    const mp = require('./out/renderer/markdown-parser');
    console.log('markdown-parser: OK, exports:', Object.keys(mp).join(', '));
} catch(e) {
    console.log('markdown-parser: FAIL -', e.message);
    console.log('  stack:', e.stack?.split('\n').slice(0,5).join('\n'));
}

// 6. 测试 preview-manager 模块加载
console.log('\n--- Step 6: preview-manager module ---');
try {
    const pm = require('./out/preview/preview-manager');
    console.log('preview-manager: OK, exports:', Object.keys(pm).join(', '));
} catch(e) {
    console.log('preview-manager: FAIL -', e.message);
    console.log('  stack:', e.stack?.split('\n').slice(0,5).join('\n'));
}

// 7. 测试 commands 模块加载
console.log('\n--- Step 7: commands module ---');
try {
    const cmd = require('./out/commands/commands');
    console.log('commands: OK, exports:', Object.keys(cmd).join(', '));
} catch(e) {
    console.log('commands: FAIL -', e.message);
    console.log('  stack:', e.stack?.split('\n').slice(0,5).join('\n'));
}

// 8. 测试 theme-manager 模块加载
console.log('\n--- Step 8: theme-manager module ---');
try {
    const tm = require('./out/themes/theme-manager');
    console.log('theme-manager: OK, exports:', Object.keys(tm).join(', '));
} catch(e) {
    console.log('theme-manager: FAIL -', e.message);
    console.log('  stack:', e.stack?.split('\n').slice(0,5).join('\n'));
}

// 9. 测试整个 extension 模块加载
console.log('\n--- Step 9: extension module ---');
try {
    const ext = require('./out/extension');
    console.log('extension: OK, exports:', Object.keys(ext).join(', '));
} catch(e) {
    console.log('extension: FAIL -', e.message);
    console.log('  stack:', e.stack?.split('\n').slice(0,8).join('\n'));
}

console.log('\n--- Done ---');
