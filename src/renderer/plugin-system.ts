// 声明式渲染插件接口
import type MarkdownIt from 'markdown-it';

/** 渲染插件接口：统一管理 Markdown 解析、后处理、导出样式 */
export interface RenderPlugin {
    /** 插件唯一标识 */
    id: string;
    /** 显示名称 */
    name: string;
    /** 是否启用 */
    enabled: boolean;

    /** markdown-it 插件配置 */
    markdownItPlugin?: {
        plugin: MarkdownIt.PluginWithOptions<any>;
        options?: any;
    };

    /** 对渲染后的 HTML 进行后处理（如 Mermaid 的异步 SVG 渲染） */
    postRender?: (html: string) => Promise<string>;

    /** HTML 导出时注入的 CSS 样式 */
    exportStyles?: string;

    /** 等待异步渲染完成（导出前调用） */
    ensureRendered?: () => Promise<void>;

    /** 主题变更时的回调（如重新配置 Mermaid 主题） */
    onThemeChange?: (theme: string) => void;
}

/** 全局插件注册表 */
const plugins: RenderPlugin[] = [];

/**
 * 注册渲染插件
 * @param p 插件实例
 */
export function registerPlugin(p: RenderPlugin): void {
    plugins.push(p);
}

/** 获取所有已注册插件 */
export function getAllPlugins(): RenderPlugin[] {
    return plugins;
}

/** 获取所有启用的插件 */
export function getEnabledPlugins(): RenderPlugin[] {
    return plugins.filter(p => p.enabled);
}

/**
 * 切换插件启用状态
 * @param id 插件 ID
 * @param enabled 是否启用
 */
export function togglePlugin(id: string, enabled: boolean): void {
    const p = plugins.find(x => x.id === id);
    if (p) p.enabled = enabled;
}

/** 获取所有启用插件的导出样式，合并为单一 CSS 字符串 */
export function collectExportStyles(): string {
    return getEnabledPlugins()
        .map(p => p.exportStyles || '')
        .join('\n');
}

/** 等待所有启用插件的异步渲染完成 */
export async function ensureAllPluginsRendered(): Promise<void> {
    for (const p of getEnabledPlugins()) {
        if (p.ensureRendered) {
            await p.ensureRendered();
        }
    }
}