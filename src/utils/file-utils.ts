// URI / 路径工具函数
import * as path from 'path';

/**
 * 获取 Markdown 文件对应的默认导出文件名
 * @param markdownPath .md 文件路径
 * @param ext 目标扩展名（如 .html / .pdf）
 */
export function getDefaultExportPath(markdownPath: string, ext: string): string {
    return markdownPath.replace(/\.md$/, ext);
}

/**
 * 获取文档所在目录的 file:// URI 前缀
 */
export function getDocumentDirUri(markdownPath: string): string {
    return `file://${path.dirname(markdownPath)}/`;
}