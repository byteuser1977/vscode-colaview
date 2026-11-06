// Word (docx) 导出器 — 参考 ColaMD-extend/src/main/docx-export.ts 移植
// 用 docx 库在扩展宿主内解析 Markdown（remark-parse + remark-gfm）并生成 OOXML。
// 与 colamd-extend 的差异：扩展宿主是纯 Node，无 Electron nativeImage，
// 图片解码/尺寸检测改用纯 JS 实现（sniffImage），截图类图片直接透传 PNG buffer。
import * as vscode from 'vscode';
import * as fs from 'fs';
import { basename, dirname, extname, isAbsolute, resolve } from 'path';
import { fileURLToPath } from 'url';
// 这三个必须在 package.json 里**直接声明**（而非仅作 colamd 的传递依赖）：
// 曾经靠 npm 依赖提升侥幸能 load，一旦上游依赖树变动，Word 导出就会在运行时
// 「模块找不到」。参照 colamd-extend 的注释。
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  Footer,
  FootnoteReferenceRun,
  HeadingLevel,
  ImageRun,
  LevelFormat,
  LineRuleType,
  Packer,
  PageNumber,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  UnderlineType,
  WidthType,
  type IParagraphOptions,
  type IRunStylePropertiesOptions,
  type ParagraphChild,
} from 'docx';
import { renderMathAndMermaidToImages } from './render-export-images';
import { buildDocxStyleFromThemeCss } from './theme-style';
import { ThemeManager } from '../themes/theme-manager';

interface MarkdownNode {
  type: string;
  value?: string;
  depth?: number;
  ordered?: boolean;
  start?: number;
  url?: string;
  alt?: string;
  align?: Array<'left' | 'center' | 'right' | null>;
  checked?: boolean | null;
  identifier?: string;
  label?: string;
  /** 列表编号实例，预扫描时写入；每个列表一个，保证编号各自重新开始。 */
  instance?: number;
  children?: MarkdownNode[];
}

/** 主题令牌。颜色一律不带 `#`；字体是 CSS 字体栈，落到 Word 前会挑一个具体字体名。 */
export interface DocxStyle {
  text: string;
  secondaryText: string;
  link: string;
  bodyFontStack: string;
  monoFontStack: string;
  bodySize: number;
  lineHeight: number;
  inlineCodeBackground: string;
  codeBlockBackground: string;
  codeBlockText: string;
  highlightBackground: string;
  blockquoteBorder: string;
  blockquoteBackground: string | null;
  border: string;
  tableHeaderBackground: string;
}

export interface DocxExportInput {
  content: string;
  sourcePath: string | null;
  /** 渲染端为本次导出生成的图片（公式/示意图），keyed by Markdown 里重写后的名字。 */
  images?: Record<string, string>;
  /** 图片在 Word 里的目标尺寸（CSS 像素）。 */
  imageSizes?: unknown;
  style?: unknown;
}

// 没有拿到渲染进程的令牌时，仍生成一份完整的浅色文档。
const DEFAULT_STYLE: DocxStyle = {
  text: '24292F',
  secondaryText: '656D76',
  link: '0969DA',
  bodyFontStack: 'Segoe UI, Helvetica, Arial, sans-serif',
  monoFontStack: 'Consolas, Menlo, monospace',
  bodySize: 16,
  lineHeight: 1.75,
  inlineCodeBackground: 'EFF1F3',
  codeBlockBackground: 'F6F8FA',
  codeBlockText: '24292F',
  highlightBackground: 'FFF3BF',
  blockquoteBorder: 'D0D7DE',
  blockquoteBackground: null,
  border: 'D0D7DE',
  tableHeaderBackground: 'F6F8FA',
};

// 与 colamd-extend themes/document.css 的字号比例一致：h1 1.9em … h5/h6 1em。
const HEADING_SCALE = [1.9, 1.55, 1.3, 1.12, 1, 1];

interface DocxContext {
  style: DocxStyle;
  bodyFont: string;
  monoFont: string;
  bodySizeHalf: number;
  paragraphLine: number;
  codeSizeHalf: number;
  footnoteIds: Map<string, number>;
  sourcePath: string | null;
  images?: Record<string, string>;
  imageSizes?: Record<string, { width: number; height: number }>;
}

/** 已解码的图片（原生类型 + 字节 + 尺寸）。替代 Electron 的 NativeImage。 */
interface LoadedImage {
  data: Buffer;
  type: 'png' | 'jpg' | 'gif' | 'bmp';
  width: number;
  height: number;
}

function hexColor(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const raw = value.trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(raw)) return raw.split('').map((digit) => digit + digit).join('').toUpperCase();
  if (/^[0-9a-f]{6}$/i.test(raw)) return raw.toUpperCase();
  if (/^[0-9a-f]{8}$/i.test(raw)) return raw.slice(0, 6).toUpperCase();
  return fallback;
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : fallback;
}

function numberValue(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

const FRONTMATTER_MAPPING = /^[ \t]*(?:[\p{L}\p{N}_][\p{L}\p{N}_.-]*|"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*')[ \t]*:([ \t]|$)/mu;

function frontmatterEnd(text: string): number {
  if (!text.startsWith('---')) return 0;
  const firstLineEnd = text.indexOf('\n');
  if (firstLineEnd === -1) return 0;
  if (text.slice(0, firstLineEnd).trim() !== '---') return 0;
  const rest = text.slice(firstLineEnd + 1);
  const close = /^(?:---|\.\.\.)[ \t]*$/m.exec(rest);
  if (!close) return 0;
  const body = rest.slice(0, close.index);
  if (!FRONTMATTER_MAPPING.test(body)) return 0;
  return firstLineEnd + 1 + close.index + close[0].length;
}

function normalizeImageSizes(raw: unknown): Record<string, { width: number; height: number }> | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const sizes: Record<string, { width: number; height: number }> = {};
  for (const [name, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== 'object') continue;
    const width = (value as { width?: unknown }).width;
    const height = (value as { height?: unknown }).height;
    if (
      typeof width === 'number' && Number.isFinite(width) && width > 0
      && typeof height === 'number' && Number.isFinite(height) && height > 0
    ) {
      sizes[name] = { width: Math.min(4000, width), height: Math.min(4000, height) };
    }
  }
  return Object.keys(sizes).length > 0 ? sizes : undefined;
}

function normalizeStyle(raw: unknown): DocxStyle {
  const source = typeof raw === 'object' && raw !== null ? raw as Record<string, unknown> : {};
  const blockquoteBackground = typeof source.blockquoteBackground === 'string'
    ? hexColor(source.blockquoteBackground, '')
    : '';
  return {
    text: hexColor(source.text, DEFAULT_STYLE.text),
    secondaryText: hexColor(source.secondaryText, DEFAULT_STYLE.secondaryText),
    link: hexColor(source.link, DEFAULT_STYLE.link),
    bodyFontStack: stringValue(source.bodyFontStack, DEFAULT_STYLE.bodyFontStack),
    monoFontStack: stringValue(source.monoFontStack, DEFAULT_STYLE.monoFontStack),
    bodySize: numberValue(source.bodySize, DEFAULT_STYLE.bodySize, 8, 40),
    lineHeight: numberValue(source.lineHeight, DEFAULT_STYLE.lineHeight, 1, 3),
    inlineCodeBackground: hexColor(source.inlineCodeBackground, DEFAULT_STYLE.inlineCodeBackground),
    codeBlockBackground: hexColor(source.codeBlockBackground, DEFAULT_STYLE.codeBlockBackground),
    codeBlockText: hexColor(source.codeBlockText, DEFAULT_STYLE.codeBlockText),
    highlightBackground: hexColor(source.highlightBackground, DEFAULT_STYLE.highlightBackground),
    blockquoteBorder: hexColor(source.blockquoteBorder, DEFAULT_STYLE.blockquoteBorder),
    blockquoteBackground: blockquoteBackground !== '' ? blockquoteBackground : null,
    border: hexColor(source.border, DEFAULT_STYLE.border),
    tableHeaderBackground: hexColor(source.tableHeaderBackground, DEFAULT_STYLE.tableHeaderBackground),
  };
}

/** 从 CSS 字体栈里挑一个 Word 认得的字体名。 */
function fontName(stack: string, mono: boolean): string {
  const generic = new Set([
    'serif', 'sans-serif', 'monospace', 'system-ui', 'ui-sans-serif', 'ui-monospace',
    'cursive', 'fantasy', '-apple-system', 'blinkmacsystemfont',
  ]);
  const families = stack
    .split(',')
    .map((family) => family.trim().replace(/^["']|["']$/g, ''))
    .filter((family) => family !== '' && !generic.has(family.toLowerCase()));

  const platform = process.platform;
  const preferred = mono
    ? platform === 'win32'
      ? ['consolas', 'cascadia code', 'fira code', 'menlo']
      : platform === 'darwin'
        ? ['sf mono', 'menlo', 'fira code', 'consolas']
        : ['dejavu sans mono', 'liberation mono', 'noto sans mono']
    : platform === 'win32'
      ? ['segoe ui', 'microsoft yahei', 'noto sans']
      : platform === 'darwin'
        ? ['helvetica neue', 'helvetica', 'noto sans']
        : ['noto sans', 'dejavu sans'];

  for (const name of preferred) {
    const hit = families.find((family) => family.toLowerCase() === name);
    if (hit) return hit;
  }
  if (families[0]) return families[0];
  if (mono) return platform === 'win32' ? 'Consolas' : platform === 'darwin' ? 'Menlo' : 'DejaVu Sans Mono';
  return platform === 'win32' ? 'Segoe UI' : platform === 'darwin' ? 'Helvetica Neue' : 'Noto Sans';
}

/** px → Word 的半磅值。 */
function halfPoints(px: number): number {
  return Math.max(2, Math.round(px * 1.5));
}

/** em 距离 → twips（1px = 15 twips）。 */
function emTwips(px: number, em: number): number {
  return Math.round(px * em * 15);
}

function headingForDepth(depth: number): (typeof HeadingLevel)[keyof typeof HeadingLevel] {
  const headings = [
    HeadingLevel.HEADING_1,
    HeadingLevel.HEADING_2,
    HeadingLevel.HEADING_3,
    HeadingLevel.HEADING_4,
    HeadingLevel.HEADING_5,
    HeadingLevel.HEADING_6,
  ];
  return headings[Math.max(0, Math.min(5, depth - 1))] as (typeof HeadingLevel)[keyof typeof HeadingLevel];
}

function textContent(node: MarkdownNode): string {
  if (node.type === 'text' || node.type === 'inlineCode' || node.type === 'code') return node.value ?? '';
  if (node.type === 'break') return '\n';
  return node.children?.map(textContent).join('') ?? '';
}

/**
 * 纯 JS 识别图片字节类型并读取宽高（替代 nativeImage.getSize()）。
 * 支持 PNG/JPEG/GIF/BMP；返回 null 表示无法识别（如 SVG）。
 */
function sniffImage(buf: Buffer): { type: LoadedImage['type']; width: number; height: number } | null {
  if (!buf || buf.length < 24) return null;
  // PNG
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return { type: 'png', width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  // JPEG
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) { i += 1; continue; }
      const marker = buf[i + 1];
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { type: 'jpg', width: buf.readUInt16BE(i + 7), height: buf.readUInt16BE(i + 5) };
      }
      const size = buf.readUInt16BE(i + 2);
      i += 2 + size;
    }
    return null;
  }
  // GIF
  const gifSig = buf.toString('ascii', 0, 6);
  if (gifSig === 'GIF87a' || gifSig === 'GIF89a') {
    return { type: 'gif', width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
  }
  // BMP
  if (buf.toString('ascii', 0, 2) === 'BM') {
    return { type: 'bmp', width: Math.abs(buf.readInt32LE(18)), height: Math.abs(buf.readInt32LE(22)) };
  }
  return null;
}

function dataUrlToImage(dataURL: string): LoadedImage | null {
  const m = /^data:image\/[a-z0-9.+-]+;base64,([A-Za-z0-9+/=]+)$/i.exec(dataURL);
  if (!m) return null;
  const buffer = Buffer.from(m[1], 'base64');
  const dims = sniffImage(buffer);
  if (!dims) return null;
  return { data: buffer, ...dims };
}

function fileToImage(path: string): LoadedImage | null {
  try {
    const data = fs.readFileSync(path);
    const dims = sniffImage(data);
    if (!dims) return null;
    return { data, ...dims };
  } catch {
    return null;
  }
}

/** `==高亮==` 的底纹 run 拆分。 */
function textRuns(text: string, context: DocxContext, style: IRunStylePropertiesOptions): ParagraphChild[] {
  if (!text.includes('==')) return [new TextRun({ text, ...style })];
  const runs: ParagraphChild[] = [];
  const pattern = /==([^=\n]+)==/g;
  let cursor = 0;
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > cursor) runs.push(new TextRun({ text: text.slice(cursor, index), ...style }));
    runs.push(new TextRun({
      text: match[1] ?? '',
      ...style,
      shading: { fill: context.style.highlightBackground },
    }));
    cursor = index + match[0].length;
  }
  if (cursor === 0) return [new TextRun({ text, ...style })];
  if (cursor < text.length) runs.push(new TextRun({ text: text.slice(cursor), ...style }));
  return runs;
}

function loadImage(node: MarkdownNode, context: DocxContext): { image: LoadedImage; target?: { width: number; height: number } } | null {
  const inlineData = node.url && /^data:image\//i.test(node.url) ? node.url : undefined;
  const dataURL = node.url ? (context.images?.[node.url] ?? inlineData) : undefined;
  const image = dataURL
    ? dataUrlToImage(dataURL)
    : (() => {
        const p = node.url ? imagePath(node.url, context.sourcePath) : null;
        return p ? fileToImage(p) : null;
      })();
  if (!image) return null;
  return { image, target: node.url ? context.imageSizes?.[node.url] : undefined };
}

function imageSize(
  image: LoadedImage,
  target?: { width: number; height: number },
  targetMax: { width: number; height: number } = { width: 600, height: 420 },
): { width: number; height: number } {
  if (target) {
    const scale = Math.min(1, targetMax.width / target.width, targetMax.height / target.height);
    return {
      width: Math.max(1, Math.round(target.width * scale)),
      height: Math.max(1, Math.round(target.height * scale)),
    };
  }
  const scale = Math.min(1, 560 / image.width, 420 / image.height);
  return {
    width: Math.max(1, Math.round(image.width * scale)),
    height: Math.max(1, Math.round(image.height * scale)),
  };
}

function inlineRuns(
  nodes: MarkdownNode[] | undefined,
  context: DocxContext,
  style: IRunStylePropertiesOptions = {},
): ParagraphChild[] {
  if (!nodes) return [];
  const runs: ParagraphChild[] = [];
  for (const node of nodes) {
    if (node.type === 'text') {
      runs.push(...textRuns(node.value ?? '', context, style));
    } else if (node.type === 'break') {
      runs.push(new TextRun({ break: 1, ...style }));
    } else if (node.type === 'inlineCode') {
      runs.push(new TextRun({
        text: node.value ?? '',
        font: context.monoFont,
        size: context.codeSizeHalf,
        shading: { fill: context.style.inlineCodeBackground },
        ...style,
      }));
    } else if (node.type === 'strong') {
      runs.push(...inlineRuns(node.children, context, { ...style, bold: true }));
    } else if (node.type === 'emphasis') {
      runs.push(...inlineRuns(node.children, context, { ...style, italics: true }));
    } else if (node.type === 'delete') {
      runs.push(...inlineRuns(node.children, context, { ...style, strike: true }));
    } else if (node.type === 'link' && node.url) {
      runs.push(new ExternalHyperlink({
        link: node.url,
        children: inlineRuns(node.children, context, {
          ...style,
          color: context.style.link,
          underline: { type: UnderlineType.SINGLE },
        }),
      }));
    } else if (node.type === 'footnoteReference') {
      const id = node.identifier ? context.footnoteIds.get(node.identifier) : undefined;
      runs.push(id
        ? new FootnoteReferenceRun(id)
        : new TextRun({ text: node.label ?? '', superScript: true }));
    } else if (node.type === 'html') {
      const value = node.value ?? '';
      if (/^<br\b/i.test(value)) {
        runs.push(new TextRun({ break: 1, ...style }));
      } else {
        const img = /^<img\b[^>]*?\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(value);
        if (img) {
          const url = img[1] ?? img[2] ?? img[3] ?? '';
          const altMatch = /\balt\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(value);
          const alt = altMatch?.[1] ?? altMatch?.[2] ?? altMatch?.[3] ?? '';
          const loaded = loadImage({ type: 'image', url, alt }, context);
          if (loaded) {
            runs.push(new ImageRun({
              type: loaded.image.type,
              data: loaded.image.data,
              transformation: imageSize(loaded.image, loaded.target),
              altText: alt ? { name: alt } : undefined,
            }));
          }
        }
      }
    } else if (node.type === 'image') {
      const loaded = loadImage(node, context);
      if (loaded) {
        runs.push(new ImageRun({
          type: loaded.image.type,
          data: loaded.image.data,
          transformation: imageSize(loaded.image, loaded.target),
          altText: node.alt ? { name: node.alt } : undefined,
        }));
      } else {
        runs.push(new TextRun({
          text: node.alt ? `[${node.alt}]` : '[image]',
          italics: true,
          color: context.style.secondaryText,
          ...style,
        }));
      }
    } else {
      runs.push(...inlineRuns(node.children, context, style));
    }
  }
  return runs;
}

function imagePath(url: string, sourcePath: string | null): string | null {
  if (/^(https?:|data:|blob:)/i.test(url)) return null;
  try {
    if (url.startsWith('file:')) return fileURLToPath(url);
  } catch {
    return null;
  }
  if (!sourcePath) return null;
  return isAbsolute(url) ? url : resolve(dirname(sourcePath), decodeURIComponent(url));
}

const REMOTE_TIMEOUT_MS = 15000;
const REMOTE_MAX_BYTES = 20 * 1024 * 1024;

/** 远程图片：下载后保留原始字节，失败返回 null。 */
async function downloadImage(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(REMOTE_TIMEOUT_MS),
      headers: { 'User-Agent': 'ColaView', Accept: 'image/*' },
    });
    if (!response.ok) return null;
    const declared = Number(response.headers.get('content-length') ?? 0);
    if (declared > REMOTE_MAX_BYTES) return null;
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length === 0 || buffer.length > REMOTE_MAX_BYTES) return null;
    if (!sniffImage(buffer)) return null;
    const contentType = (response.headers.get('content-type') ?? 'image/png').split(';')[0].trim();
    return `data:${contentType};base64,${buffer.toString('base64')}`;
  } catch {
    return null;
  }
}

function collectRemoteImageUrls(nodes: MarkdownNode[] | undefined, urls: Set<string>): void {
  for (const node of nodes ?? []) {
    if (node.type === 'image' && node.url && /^https?:/i.test(node.url)) urls.add(node.url);
    if (node.type === 'html' && node.value) {
      const img = /<img\b[^>]*\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(node.value);
      const src = img?.[1] ?? img?.[2] ?? img?.[3];
      if (src && /^https?:/i.test(src)) urls.add(src);
    }
    collectRemoteImageUrls(node.children, urls);
  }
}

async function remoteImagesFor(tree: MarkdownNode): Promise<Record<string, string>> {
  const urls = new Set<string>();
  collectRemoteImageUrls(tree.children, urls);
  if (urls.size === 0) return {};
  const entries = await Promise.all([...urls].map(async (url) => [url, await downloadImage(url)] as const));
  return Object.fromEntries(entries.filter((entry): entry is readonly [string, string] => entry[1] !== null));
}

function imageParagraph(node: MarkdownNode, context: DocxContext): Paragraph {
  const loaded = loadImage(node, context);
  if (!loaded) {
    return new Paragraph({
      children: [new TextRun({ text: node.alt ? `[${node.alt}]` : '[image]', italics: true })],
    });
  }
  const url = node.url ?? '';
  const size = imageSize(
    loaded.image,
    loaded.target,
    /colamd-html-/.test(url) ? { width: 600, height: 800 } : undefined,
  );
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: emTwips(context.style.bodySize, 1.2), after: emTwips(context.style.bodySize, 1.2) },
    children: [new ImageRun({
      type: loaded.image.type,
      data: loaded.image.data,
      transformation: size,
      altText: node.alt ? { name: node.alt } : undefined,
    })],
  });
}

function alignmentFor(align: string | null | undefined): (typeof AlignmentType)[keyof typeof AlignmentType] {
  if (align === 'center') return AlignmentType.CENTER;
  if (align === 'right') return AlignmentType.RIGHT;
  return AlignmentType.LEFT;
}

function tableForNode(node: MarkdownNode, context: DocxContext): Table {
  const border = { style: BorderStyle.SINGLE, size: 6, color: context.style.border };
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: border,
      bottom: border,
      left: border,
      right: border,
      insideHorizontal: border,
      insideVertical: border,
    },
    rows: (node.children ?? []).map((row, rowIndex) => new TableRow({
      tableHeader: rowIndex === 0,
      children: (row.children ?? []).map((cell, cellIndex) => new TableCell({
        shading: rowIndex === 0 ? { fill: context.style.tableHeaderBackground } : undefined,
        margins: { top: 120, bottom: 120, left: 180, right: 180 },
        children: [new Paragraph({
          alignment: alignmentFor(node.align?.[cellIndex]),
          spacing: { before: 0, after: 0, line: 240, lineRule: LineRuleType.AUTO },
          children: inlineRuns(cell.children, context, rowIndex === 0 ? { bold: true } : {}),
        })],
      })),
    })),
  });
}

function codeParagraph(node: MarkdownNode, context: DocxContext, extra: IParagraphOptions = {}): Paragraph {
  const lines = (node.value ?? '').replace(/\n+$/, '').split('\n');
  const children: ParagraphChild[] = lines.map((line, index) => (
    line === ''
      ? new TextRun({ text: '', break: 1 })
      : new TextRun({
          text: line,
          break: index > 0 ? 1 : undefined,
          font: context.monoFont,
          size: context.codeSizeHalf,
          color: context.style.codeBlockText,
        })
  ));
  const codeLine = Math.round(context.style.bodySize * 0.875 * 1.6 * 15);
  const codePad = emTwips(context.style.bodySize, 1.0);
  return new Paragraph({
    ...extra,
    shading: { fill: context.style.codeBlockBackground },
    spacing: { before: codePad, after: codePad, line: codeLine, lineRule: LineRuleType.AT_LEAST },
    children,
  });
}

function blockquoteNodes(
  node: MarkdownNode,
  context: DocxContext,
): Array<Paragraph | Table> {
  const quote: IParagraphOptions = {
    border: {
      left: { color: context.style.blockquoteBorder, space: 12, style: BorderStyle.SINGLE, size: 24 },
    },
    indent: { left: 240 },
    shading: context.style.blockquoteBackground ? { fill: context.style.blockquoteBackground } : undefined,
    spacing: { after: emTwips(context.style.bodySize, 0.5) },
  };
  const childStyle: IRunStylePropertiesOptions = { color: context.style.secondaryText };
  const output: Array<Paragraph | Table> = [];

  for (const child of node.children ?? []) {
    if (child.type === 'paragraph' || child.type === 'heading') {
      output.push(new Paragraph({ ...quote, children: inlineRuns(child.children, context, childStyle) }));
    } else if (child.type === 'list') {
      const start = child.start ?? 1;
      for (const [index, item] of (child.children ?? []).entries()) {
        const first = item.children?.find((entry) => entry.type === 'paragraph');
        const prefix = child.ordered ? `${start + index}. ` : '• ';
        output.push(new Paragraph({
          ...quote,
          indent: { left: 600, hanging: 240 },
          children: [
            new TextRun({ text: prefix, ...childStyle }),
            ...inlineRuns(first?.children, context, childStyle),
          ],
        }));
      }
    } else if (child.type === 'code') {
      output.push(codeParagraph(child, context, quote));
    } else if (child.type === 'thematicBreak') {
      output.push(new Paragraph({
        ...quote,
        border: { bottom: { color: context.style.border, space: 1, style: BorderStyle.SINGLE, size: 6 } },
      }));
    } else {
      output.push(new Paragraph({
        ...quote,
        children: [new TextRun({ text: textContent(child), ...childStyle })],
      }));
    }
  }
  return output;
}

function prepareLists(nodes: MarkdownNode[] | undefined, state: { next: number; starts: Set<number> }): void {
  for (const node of nodes ?? []) {
    if (node.type === 'list') {
      node.instance = state.next;
      state.next += 1;
      if (node.ordered) state.starts.add(node.start ?? 1);
    }
    prepareLists(node.children, state);
  }
}

function bulletLevels() {
  const marks = ['•', '○', '■'];
  return Array.from({ length: 9 }, (_, level) => ({
    level,
    format: LevelFormat.BULLET,
    text: marks[level % marks.length],
    alignment: AlignmentType.LEFT,
    style: { paragraph: { indent: { left: 360 + level * 360, hanging: 240 } } },
  }));
}

function decimalLevels(start: number) {
  return Array.from({ length: 9 }, (_, level) => ({
    level,
    format: LevelFormat.DECIMAL,
    text: `%${level + 1}.`,
    alignment: AlignmentType.LEFT,
    ...(level === 0 ? { start } : {}),
    style: { paragraph: { indent: { left: 360 + level * 360, hanging: 240 } } },
  }));
}

function numberingConfig(starts: Set<number>) {
  return {
    config: [
      { reference: 'bullet', levels: bulletLevels() },
      ...[...starts].sort((left, right) => left - right).map((start) => ({
        reference: `ordered-${start}`,
        levels: decimalLevels(start),
      })),
    ],
  };
}

function prepareFootnotes(nodes: MarkdownNode[] | undefined, ids: Map<string, number>): void {
  for (const node of nodes ?? []) {
    if (node.type === 'footnoteDefinition') continue;
    if (node.type === 'footnoteReference' && node.identifier && !ids.has(node.identifier)) {
      ids.set(node.identifier, ids.size + 1);
    }
    prepareFootnotes(node.children, ids);
  }
}

function blockNodes(
  nodes: MarkdownNode[] | undefined,
  context: DocxContext,
  listDepth = 0,
): Array<Paragraph | Table> {
  if (!nodes) return [];
  const output: Array<Paragraph | Table> = [];
  for (const node of nodes) {
    if (node.type === 'heading') {
      output.push(new Paragraph({ heading: headingForDepth(node.depth ?? 1), children: inlineRuns(node.children, context) }));
    } else if (node.type === 'paragraph') {
      const image = node.children?.length === 1 && node.children[0]?.type === 'image' ? node.children[0] : null;
      output.push(image
        ? imageParagraph(image, context)
        : new Paragraph({ children: inlineRuns(node.children, context) }));
    } else if (node.type === 'image') {
      output.push(imageParagraph(node, context));
    } else if (node.type === 'blockquote') {
      output.push(...blockquoteNodes(node, context));
    } else if (node.type === 'code') {
      output.push(codeParagraph(node, context));
    } else if (node.type === 'list') {
      const start = node.start ?? 1;
      for (const item of (node.children ?? [])) {
        const first = item.children?.find((child) => child.type === 'paragraph');
        const itemSpacing = {
          before: 0,
          after: emTwips(context.style.bodySize, 0.3),
          line: context.paragraphLine,
          lineRule: LineRuleType.AT_LEAST,
        };
        if (typeof item.checked === 'boolean') {
          output.push(new Paragraph({
            children: [
              new TextRun({
                text: item.checked ? '☑ ' : '☐ ',
                color: item.checked ? context.style.link : context.style.secondaryText,
              }),
              ...inlineRuns(first?.children, context),
            ],
            indent: { left: 360 + listDepth * 360, hanging: 240 },
            spacing: itemSpacing,
          }));
        } else {
          output.push(new Paragraph({
            children: inlineRuns(first?.children, context),
            numbering: node.ordered
              ? { reference: `ordered-${start}`, level: listDepth, instance: node.instance ?? 0 }
              : { reference: 'bullet', level: listDepth, instance: 0 },
            spacing: itemSpacing,
          }));
        }
        output.push(...blockNodes(item.children?.filter((child) => child !== first), context, listDepth + 1));
      }
    } else if (node.type === 'table') {
      output.push(tableForNode(node, context));
    } else if (node.type === 'thematicBreak') {
      output.push(new Paragraph({ border: { bottom: { color: context.style.border, space: 1, style: BorderStyle.SINGLE, size: 6 } } }));
    } else if (node.type === 'html') {
      output.push(new Paragraph({
        children: [new TextRun({ text: node.value ?? '', font: context.monoFont, size: context.codeSizeHalf, color: context.style.secondaryText })],
      }));
    } else if (node.type === 'footnoteDefinition') {
      continue;
    } else {
      output.push(...blockNodes(node.children, context, listDepth));
    }
  }
  return output;
}

function buildFootnotes(
  tree: MarkdownNode,
  context: DocxContext,
): Record<string, { children: Paragraph[] }> | undefined {
  const definitions = (tree.children ?? []).filter((node) => (
    node.type === 'footnoteDefinition' && node.identifier && context.footnoteIds.has(node.identifier)
  ));
  if (definitions.length === 0) return undefined;

  const footnotes: Record<string, { children: Paragraph[] }> = {};
  for (const definition of definitions) {
    const id = context.footnoteIds.get(definition.identifier ?? '');
    if (!id) continue;
    const children = blockNodes(definition.children, context)
      .filter((child): child is Paragraph => child instanceof Paragraph);
    footnotes[String(id)] = { children: children.length > 0 ? children : [new Paragraph({ children: [] })] };
  }
  return footnotes;
}

function documentStyles(context: DocxContext) {
  const font = {
    ascii: context.bodyFont,
    hAnsi: context.bodyFont,
    eastAsia: context.bodyFont,
    cs: context.bodyFont,
  };
  const footnoteLine = Math.round(context.style.bodySize * 0.875 * 1.6 * 15);
  const bodyPadAfter = emTwips(context.style.bodySize, 0.75);
  const bodyPadBefore = Math.round(bodyPadAfter * 0.33);
  const heading = (level: number) => {
    const px = context.style.bodySize * HEADING_SCALE[level - 1];
    return {
      run: { bold: true, color: context.style.text, size: halfPoints(px) },
      paragraph: {
        outlineLevel: level - 1,
        keepNext: true,
        keepLines: true,
        spacing: {
          before: emTwips(px, 1.4),
          after: emTwips(px, 0.6),
          line: emTwips(px, 1.35),
          lineRule: LineRuleType.AT_LEAST,
        },
      },
    };
  };

  return {
    default: {
      document: {
        run: { font, size: context.bodySizeHalf, color: context.style.text },
        paragraph: {
          spacing: {
            line: context.paragraphLine,
            lineRule: LineRuleType.AT_LEAST,
            before: bodyPadBefore,
            after: bodyPadAfter,
          },
        },
      },
      heading1: heading(1),
      heading2: heading(2),
      heading3: heading(3),
      heading4: heading(4),
      heading5: heading(5),
      heading6: heading(6),
      footnoteText: {
        run: { size: context.codeSizeHalf, color: context.style.secondaryText },
        paragraph: {
          spacing: { after: 60, line: footnoteLine, lineRule: LineRuleType.AT_LEAST },
        },
      },
    },
  };
}

export async function markdownToDocx(input: DocxExportInput): Promise<Buffer> {
  const style = normalizeStyle(input.style);
  const source = input.content;
  const frontmatter = frontmatterEnd(source);
  const body = frontmatter > 0 ? source.slice(frontmatter) : source;
  const tree = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .parse(body) as unknown as MarkdownNode;

  const footnoteIds = new Map<string, number>();
  prepareFootnotes(tree.children, footnoteIds);
  const listState = { next: 0, starts: new Set<number>() };
  prepareLists(tree.children, listState);
  const remoteImages = await remoteImagesFor(tree);

  const context: DocxContext = {
    style,
    bodyFont: fontName(style.bodyFontStack, false),
    monoFont: fontName(style.monoFontStack, true),
    bodySizeHalf: halfPoints(style.bodySize),
    paragraphLine: Math.round(style.lineHeight * style.bodySize * 15),
    codeSizeHalf: halfPoints(style.bodySize * 0.875),
    footnoteIds,
    sourcePath: input.sourcePath,
    images: { ...remoteImages, ...input.images },
    imageSizes: normalizeImageSizes(input.imageSizes),
  };

  const footnotes = buildFootnotes(tree, context);
  const pageNumber = new TextRun({
    children: [PageNumber.CURRENT, ' / ', PageNumber.TOTAL_PAGES],
    size: context.codeSizeHalf,
    color: style.secondaryText,
  });

  const document = new Document({
    creator: 'ColaView',
    title: input.sourcePath ? basename(input.sourcePath, extname(input.sourcePath)) : 'Untitled',
    styles: documentStyles(context),
    numbering: numberingConfig(listState.starts),
    ...(footnotes ? { footnotes } : {}),
    sections: [{
      footers: {
        default: new Footer({
          children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [pageNumber] })],
        }),
      },
      children: blockNodes(tree.children, context),
    }],
  });
  return Packer.toBuffer(document);
}

/**
 * 导出当前 Markdown 文档为 Word (.docx)。
 * 纯宿主转换：先渲染公式/Mermaid 为 PNG 并重写 Markdown，再生成 docx。
 */
export async function exportWord(document: vscode.TextDocument): Promise<void> {
  const markdown = document.getText();
  const sourcePath = document.fileName;

  const { content, images, imageSizes } = await renderMathAndMermaidToImages(markdown);
  const themeCss = ThemeManager.loadThemeCSS(ThemeManager.getCurrentTheme());
  const style = buildDocxStyleFromThemeCss(themeCss);
  const buffer = await markdownToDocx({ content, sourcePath, images, imageSizes, style });

  const defaultName = document.fileName.replace(/\.md$/i, '.docx');
  const uri = await vscode.window.showSaveDialog({
    defaultUri: vscode.Uri.file(defaultName),
    filters: { 'Word Document': ['docx'] },
  });
  if (!uri) return;

  await vscode.workspace.fs.writeFile(uri, buffer);
  vscode.window.showInformationMessage(`Exported to ${uri.fsPath}`);
}