// esbuild 打包脚本 — 扩展宿主(Node.js) + WebView 浏览器端 分别打包
const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const isWatch = process.argv.includes('--watch');
const isProd = process.argv.includes('--production');

// ── 扩展宿主 (Node.js, CJS) ──
const extensionOpts = {
    entryPoints: ['src/extension.ts'],
    bundle: true,
    outfile: 'out/extension.js',
    external: ['vscode', 'puppeteer-core'],
    format: 'cjs',
    platform: 'node',
    target: 'node18',
    sourcemap: !isProd,
    minify: isProd,
    logLevel: 'info',
};

// ── WebView 浏览器端 (IIFE, bundled) ──
const webviewOpts = {
    entryPoints: ['src/preview/webview/app.ts'],
    bundle: true,
    outfile: 'out/preview/webview/app.js',
    format: 'iife',
    platform: 'browser',
    target: 'es2020',
    sourcemap: !isProd,
    minify: isProd,
    logLevel: 'info',
};

async function build() {
    if (isWatch) {
        const ctx1 = await esbuild.context(extensionOpts);
        const ctx2 = await esbuild.context(webviewOpts);
        await Promise.all([ctx1.watch(), ctx2.watch()]);
        console.log('Watching for changes...');
    } else {
        await Promise.all([
            esbuild.build(extensionOpts),
            esbuild.build(webviewOpts),
        ]);
        copyResources();
    }
}

/**
 * 复制资源文件到 out/ 目录（CSS、WebView HTML 等）
 */
function copyResources() {
    const copies = [
        { src: 'src/preview/webview/index.html', dst: 'out/preview/webview/index.html' },
        { src: 'src/themes/foundation.css', dst: 'out/themes/foundation.css' },
        { src: 'src/themes/built-in', dst: 'out/themes/built-in' },
    ];

    // Copy ColaMD renderer CSS if available
    const colamdCss = 'node_modules/@bytechain.cn/colamd/dist/lib/colamd.css';
    if (fs.existsSync(colamdCss)) {
        copies.push({ src: colamdCss, dst: 'out/preview/webview/colamd.css' });
    }

    for (const { src, dst } of copies) {
        if (!fs.existsSync(src)) continue;
        if (fs.statSync(src).isDirectory()) {
            copyDirSync(src, dst);
        } else {
            fs.mkdirSync(path.dirname(dst), { recursive: true });
            fs.copyFileSync(src, dst);
        }
    }
    console.log('Resources copied to out/');
}

/**
 * 递归复制目录
 */
function copyDirSync(src, dst) {
    fs.mkdirSync(dst, { recursive: true });
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
        const srcPath = path.join(src, entry.name);
        const dstPath = path.join(dst, entry.name);
        if (entry.isDirectory()) {
            copyDirSync(srcPath, dstPath);
        } else {
            fs.copyFileSync(srcPath, dstPath);
        }
    }
}

build().catch(() => process.exit(1));
