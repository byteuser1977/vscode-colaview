// 公式(KaTeX) / 图(Mermaid) 转 PNG —— 复用 puppeteer-core + 系统 Chrome/Edge。
// 扩展宿主是纯 Node（无 DOM），故用无头浏览器把 `$$`/`$` 公式与 ```mermaid 代码块
// 光栅化为 PNG，并把源 Markdown 重写为 `![...](colamd-xxx-N.png)` 占位图，
// 与 colamd-extend 渲染进程的做法一致（最终由 docx 的 ImageRun 内嵌）。
import * as fs from 'fs';
import * as path from 'path';
import katex from 'katex';
import { findChromePath } from './pdf-exporter';

export interface RichImageResult {
  /** 重写后的 Markdown（公式/图已替换为图片占位）。 */
  content: string;
  /** 占位图名字 → PNG dataURL。 */
  images: Record<string, string>;
  /** 占位图名字 → 目标尺寸（CSS 像素）。 */
  imageSizes: Record<string, { width: number; height: number }>;
}

interface RenderItem {
  kind: 'math-block' | 'math-inline' | 'mermaid';
  tex: string;
  name: string;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** 定位依赖内的静态资源（打包后优先取 out/assets 下的副本，其次回退 node_modules）。 */
function assetPath(pkg: string, file: string): string | null {
  const candidates: string[] = [];
  // 打包进 vsix 时 node_modules 被 .vscodeignore 排除，故把散件复制到 out/assets/。
  candidates.push(path.resolve(__dirname, 'assets', path.basename(file)));
  try {
    candidates.push(path.resolve(path.dirname(require.resolve(`${pkg}/package.json`)), file));
  } catch {
    /* ignore */
  }
  candidates.push(path.resolve(__dirname, '..', 'node_modules', pkg, file));
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function readIfExists(p: string | null): string | null {
  if (!p) return null;
  try {
    return fs.readFileSync(p, 'utf-8');
  } catch {
    return null;
  }
}

/**
 * 把 katex.min.css 里相对路径的字体 URL 换成 base64 data URI。
 *
 * 公式截图页通过 page.setContent 加载（about:blank 基准），CSS 内联后
 * `url(fonts/KaTeX_*.woff2)` 解析不到任何文件 —— KaTeX 全部退回回退字体，
 * 公式字形错乱（问题表现就是「导出到 Word 时公式没有正确渲染」）。
 * 字体优先取 CSS 同级的 fonts/ 目录，其次 out/assets/katex-fonts/，
 * 最后回退 node_modules 的 katex 发行目录。
 */
function inlineKatexFonts(css: string, cssPath: string): string {
  const candidates = [
    path.resolve(path.dirname(cssPath), 'fonts'),
    path.resolve(__dirname, 'assets', 'katex-fonts'),
  ];
  try {
    const katexDist = path.dirname(require.resolve('katex/package.json'));
    candidates.push(path.join(katexDist, 'dist', 'fonts'), path.join(katexDist, 'fonts'));
  } catch {
    /* ignore */
  }
  const fontDir = candidates.find((dir) => fs.existsSync(dir));
  if (!fontDir) return css;

  const cache = new Map<string, string>();
  const load = (file: string): string | null => {
    if (cache.has(file)) return cache.get(file)!;
    let dataUri: string | null = null;
    try {
      const buf = fs.readFileSync(path.join(fontDir, file));
      dataUri = `data:font/woff2;base64,${buf.toString('base64')}`;
    } catch {
      /* ignore */
    }
    cache.set(file, dataUri ?? '');
    return dataUri;
  };

  return css.replace(/url\(\s*['"]?(fonts\/[^)'"]+)['"]?\s*\)/g, (match, file: string) => {
    const dataUri = load(file);
    return dataUri ? `url(${dataUri})` : match;
  });
}

/** 是否为纯数字/货币式内容（避免把 "$5.99" 之类误判为行内公式）。 */
function isPlainNumber(s: string): boolean {
  return /^[\d\s.,%\-+()]*$/.test(s);
}

/** sRGB 按权重混合，等价于 `color-mix(in srgb, a w%, b)`。入参出参都不带 `#`。 */
function mixSrgb(a: string, b: string, weightA: number): string {
  const parse = (hex: string) => [0, 2, 4].map((index) => Number.parseInt(hex.slice(index, index + 2), 16) || 0);
  const [ra, ga, ba] = parse(a);
  const [rb, gb, bb] = parse(b);
  const mix = (x: number, y: number) => Math.max(0, Math.min(255, Math.round(x * weightA + y * (1 - weightA))));
  return [mix(ra, rb), mix(ga, gb), mix(ba, bb)]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
}

/**
 * Mermaid 画图用的调色板令牌（镜像 colamd-extend diagramPrintPalette 的推导规则）。
 * 令牌与 DocxStyle 同源：「浅色跟随主题、深色整体回落浅色」，混合比例照抄
 * colamd.css 的 `.cm-md-mermaid`（18% / 28% / 45% 三档），两边要一起改。
 */
export interface DiagramPalette {
  background: string;
  foreground: string;
  accent: string;
}

/** 没有主题令牌时按浅色默认画（与 docx-exporter 的 DEFAULT_STYLE 同源）。 */
const DEFAULT_DIAGRAM_PALETTE: DiagramPalette = {
  background: 'F6F8FA',
  foreground: '24292F',
  accent: '0969DA',
};

function normalizeHex(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const raw = value.trim().replace(/^#/, '');
  if (/^[0-9a-f]{6}$/i.test(raw)) return raw.toUpperCase();
  if (/^[0-9a-f]{3}$/i.test(raw)) return raw.split('').map((digit) => digit + digit).join('').toUpperCase();
  if (/^[0-9a-f]{8}$/i.test(raw)) return raw.slice(0, 6).toUpperCase();
  return fallback;
}

/** 从主题令牌推导 Mermaid 的 themeVariables（theme: 'base'）。 */
function mermaidThemeVariables(palette: DiagramPalette): Record<string, string> {
  const { background: bg, foreground: fg } = palette;
  const surface = mixSrgb(fg, bg, 0.18);
  const surfaceAlt = mixSrgb(fg, bg, 0.28);
  const border = mixSrgb(fg, bg, 0.45);
  return {
    background: `#${bg}`,
    textColor: `#${fg}`,
    primaryTextColor: `#${fg}`,
    secondaryTextColor: `#${fg}`,
    tertiaryTextColor: `#${fg}`,
    primaryColor: `#${surface}`,
    secondaryColor: `#${surfaceAlt}`,
    tertiaryColor: `#${bg}`,
    mainBkg: `#${surface}`,
    clusterBkg: `#${surface}`,
    clusterBorder: `#${border}`,
    primaryBorderColor: `#${border}`,
    secondaryBorderColor: `#${border}`,
    tertiaryBorderColor: `#${border}`,
    lineColor: `#${fg}`,
    edgeLabelBackground: `#${bg}`,
    noteBkgColor: `#${surfaceAlt}`,
    noteTextColor: `#${fg}`,
    noteBorderColor: `#${border}`,
    actorBkg: `#${surface}`,
    actorBorder: `#${border}`,
    actorTextColor: `#${fg}`,
    actorLineColor: `#${border}`,
    signalColor: `#${fg}`,
    signalTextColor: `#${fg}`,
    labelBoxBkgColor: `#${surface}`,
    labelBoxBorderColor: `#${border}`,
    labelTextColor: `#${fg}`,
    loopTextColor: `#${fg}`,
    activationBkgColor: `#${surfaceAlt}`,
    sequenceNumberColor: `#${bg}`,
    sectionBkgColor: `#${surface}`,
    altSectionBkgColor: `#${bg}`,
    sectionBkgColor2: `#${surfaceAlt}`,
    taskBkgColor: `#${surfaceAlt}`,
    taskBorderColor: `#${border}`,
    taskTextColor: `#${fg}`,
    taskTextOutsideColor: `#${fg}`,
    activeTaskBkgColor: `#${mixSrgb(palette.accent, bg, 0.28)}`,
    activeTaskBorderColor: `#${palette.accent}`,
    doneTaskBkgColor: `#${bg}`,
    doneTaskBorderColor: `#${border}`,
    critBkgColor: `#${mixSrgb(fg, bg, 0.45)}`,
    critBorderColor: `#${fg}`,
    todayLineColor: `#${palette.accent}`,
    pie1: `#${surface}`,
    pie2: `#${surfaceAlt}`,
    pie3: `#${mixSrgb(palette.accent, bg, 0.18)}`,
    pieTitleTextColor: `#${fg}`,
    pieSectionTextColor: `#${fg}`,
    pieStrokeColor: `#${border}`,
  };
}

/** 扫描 Markdown，用占位图重写公式/Mermaid 并收集各自内容。 */
function scan(markdown: string): { content: string; items: RenderItem[] } {
  const items: RenderItem[] = [];
  let rewritten = markdown;
  let formulaIndex = 0;
  let diagramIndex = 0;

  // 1) Mermaid 代码块
  rewritten = rewritten.replace(/```mermaid[ \t]*\n([\s\S]*?)\n```/g, (_match, code: string) => {
    diagramIndex += 1;
    const name = `colamd-diagram-${diagramIndex}.png`;
    items.push({ kind: 'mermaid', tex: String(code), name });
    return `![示意图 ${diagramIndex}](${name})`;
  });

  // 2) 块级公式 $$...$$
  rewritten = rewritten.replace(/\$\$([\s\S]+?)\$\$/g, (_match, tex: string) => {
    formulaIndex += 1;
    const name = `colamd-formula-${formulaIndex}.png`;
    items.push({ kind: 'math-block', tex: String(tex), name });
    return `![公式 ${formulaIndex}](${name})`;
  });

  // 3) 行内公式 $...$（块级已替换完，仅剩单行非空、非货币）
  rewritten = rewritten.replace(/\$([^$\n]+?)\$/g, (_match, tex: string) => {
    const value = String(tex).trim();
    if (value === '' || isPlainNumber(value)) return _match;
    formulaIndex += 1;
    const name = `colamd-formula-${formulaIndex}.png`;
    items.push({ kind: 'math-inline', tex: value, name });
    return `![公式 ${formulaIndex}](${name})`;
  });

  return { content: rewritten, items };
}

/**
 * 公式/Mermaid 光栅化。`paletteTokens` 来自主题令牌（DocxStyle 的子集），
 * Mermaid 图配色跟随当前预览主题；不传或令牌不全时按浅色默认画。
 */
export async function renderMathAndMermaidToImages(
  markdown: string,
  paletteTokens?: { codeBlockBackground?: unknown; codeBlockText?: unknown; link?: unknown },
): Promise<RichImageResult> {
  const palette: DiagramPalette = paletteTokens
    ? {
        background: normalizeHex(paletteTokens.codeBlockBackground, DEFAULT_DIAGRAM_PALETTE.background),
        foreground: normalizeHex(paletteTokens.codeBlockText, DEFAULT_DIAGRAM_PALETTE.foreground),
        accent: normalizeHex(paletteTokens.link, DEFAULT_DIAGRAM_PALETTE.accent),
      }
    : DEFAULT_DIAGRAM_PALETTE;
  const { content, items } = scan(markdown);
  if (items.length === 0) {
    return { content, images: {}, imageSizes: {} };
  }

  const katexCssPath = assetPath('katex', path.join('dist', 'katex.min.css'));
  const katexCssRaw = readIfExists(katexCssPath);
  // 字体转 base64 内联：page.setContent 的页面解析不到相对字体路径
  const katexCss = katexCssRaw && katexCssPath ? inlineKatexFonts(katexCssRaw, katexCssPath) : null;
  const mermaidJs = readIfExists(assetPath('mermaid', path.join('dist', 'mermaid.min.js')));
  const useMathml = !katexCss;

  const cards = items.map((item, index) => {
    if (item.kind === 'mermaid') {
      if (!mermaidJs) {
        return `<div class="card" id="card-${index}"><pre>${escapeHtml(item.tex)}</pre></div>`;
      }
      return `<div class="card" id="card-${index}"><pre class="mermaid">${escapeHtml(item.tex)}</pre></div>`;
    }
    const displayMode = item.kind === 'math-block';
    const katexOut = katex.renderToString(item.tex, {
      displayMode,
      throwOnError: false,
      output: useMathml ? 'mathml' : 'html',
    });
    return `<div class="card" id="card-${index}">${katexOut}</div>`;
  }).join('\n');

  const html = `<!DOCTYPE html>
<html lang="zh"><head><meta charset="utf-8">
${katexCss ? `<style>${katexCss}</style>` : ''}
<style>
  body { margin: 16px; background: #ffffff; }
  .card { display: inline-block; margin: 8px; vertical-align: middle; }
  .card pre { margin: 0; font-family: monospace; }
</style>
</head><body>
${cards}
${mermaidJs ? `<script>${mermaidJs}</script>` : ''}
<script>
(function () {
  if (!window.mermaid) { document.documentElement.dataset.ready = '1'; return; }
  mermaid.initialize({ startOnLoad: false, theme: 'base', themeVariables: ${JSON.stringify(mermaidThemeVariables(palette))}, securityLevel: 'loose' });
  var els = Array.prototype.slice.call(document.querySelectorAll('pre.mermaid'));
  var remaining = els.length;
  if (remaining === 0) { document.documentElement.dataset.ready = '1'; return; }
  els.forEach(function (el, i) {
    mermaid.render('mmd-' + i, el.textContent || '').then(function (result) {
      var tmp = document.createElement('template');
      tmp.innerHTML = result.svg;
      el.parentNode.replaceChild(tmp.content, el);
    }).catch(function () {
      el.outerHTML = '<span style="color:#999">mermaid render error</span>';
    }).finally(function () {
      remaining -= 1;
      if (remaining <= 0) document.documentElement.dataset.ready = '1';
    });
  });
})();
</script>
</body></html>`;

  const chromePath = findChromePath();
  if (!chromePath) {
    // 无 Chrome/Edge：跳过图片渲染，公式/图回退为文本（占位图仅剩 alt 文本）。
    return { content, images: {}, imageSizes: {} };
  }

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const puppeteer = require('puppeteer-core');
  const browser = await puppeteer.launch({ headless: true, executablePath: chromePath });
  try {
    const page = await browser.newPage();
    // 测量用的窗口宽度。太窄的话稍宽的行内公式会在 KaTeX 内部折行，截出来的 PNG
    // 本身就是两行（导出 Word 后看到「公式换行」，镜像 colamd-extend MEASURE_WIDTH）。
    const MEASURE_WIDTH = 2000;
    await page.setViewport({ width: MEASURE_WIDTH, height: 900, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: 'load' });
    // 等待 mermaid 渲染完成（无 mermaid 时页面立即置 ready）
    await page.waitForFunction("document.documentElement.dataset.ready === '1'", { timeout: 15000 })
      .catch(() => { /* 超时也继续：至少能截到已渲染部分 */ });

    const images: Record<string, string> = {};
    const imageSizes: Record<string, { width: number; height: number }> = {};

    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      const handle = await page.$(`#card-${index}`);
      if (!handle) continue;
      const box = await handle.boundingBox();
      if (!box || box.width < 1 || box.height < 1) continue;
      // puppeteer v25 起截图返回 Uint8Array（TypedArray 的 toString 会输出
      // 「137,80,78,…」逗号十进制串而不是 base64），必须先转 Buffer，
      // 否则 Word 里的图片数据全是坏的 —— 表现为图表/公式没有被正确渲染。
      const raw = (await handle.screenshot({ type: 'png' })) as Buffer | Uint8Array;
      const shot = Buffer.isBuffer(raw) ? raw : Buffer.from(raw as Uint8Array);
      if (!shot || shot.length === 0) continue;

      images[item.name] = `data:image/png;base64,${shot.toString('base64')}`;
      if (item.kind === 'math-inline') {
        // 行内公式缩放到正文字高（约 22px）
        const targetHeight = 22;
        const scale = Math.min(1, targetHeight / box.height);
        imageSizes[item.name] = {
          width: Math.max(1, Math.round(box.width * scale)),
          height: Math.max(1, Math.round(box.height * scale)),
        };
      } else {
        imageSizes[item.name] = { width: Math.round(box.width), height: Math.round(box.height) };
      }
      await handle.dispose();
    }
    return { content, images, imageSizes };
  } finally {
    await browser.close();
  }
}