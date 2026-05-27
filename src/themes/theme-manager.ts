// 主题管理器
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

const THEME_NAMES = ['light', 'dark', 'elegant', 'newsprint'] as const;
type ThemeName = typeof THEME_NAMES[number];

/** 自定义主题缓存 */
const customThemeCache = new Map<string, string>();

/** 主题对应的 CSS class */
const THEME_CLASS_MAP: Record<string, string> = {
    light: 'theme-light',
    dark: 'theme-dark',
    elegant: 'theme-elegant',
    newsprint: 'theme-newsprint',
};

/**
 * 主题管理器 — 负责主题 CSS 加载、切换、自定义主题导入
 */
export class ThemeManager {
    private static context: vscode.ExtensionContext;

    /**
     * 初始化主题管理器
     * @param context VSCode 扩展上下文
     */
    static init(context: vscode.ExtensionContext): void {
        this.context = context;
    }

    /** 获取当前激活的主题名称 */
    static getCurrentTheme(): string {
        return vscode.workspace.getConfiguration('colaview').get('theme', 'light');
    }

    /** 获取主题对应的 CSS class */
    static getThemeClass(theme: string): string {
        return THEME_CLASS_MAP[theme] || `theme-${theme}`;
    }

    /**
     * 加载主题 CSS 内容
     * @param theme 主题名称
     */
    static loadThemeCSS(theme: string): string {
        if (THEME_NAMES.includes(theme as ThemeName)) {
            const cssPath = path.join(
                this.context.extensionPath, 'src', 'themes', 'built-in', `${theme}.css`
            );
            if (fs.existsSync(cssPath)) {
                return fs.readFileSync(cssPath, 'utf-8');
            }
        }
        return customThemeCache.get(theme) || '';
    }

    /** 获取 foundation.css 基础变量层 */
    static loadFoundationCSS(): string {
        const cssPath = path.join(
            this.context.extensionPath, 'src', 'themes', 'foundation.css'
        );
        if (fs.existsSync(cssPath)) {
            return fs.readFileSync(cssPath, 'utf-8');
        }
        return '';
    }

    /**
     * 构建完整主题 CSS（foundation + 主题覆盖 + 插件导出样式）
     * @param theme 主题名称
     * @param pluginExportStyles 插件导出样式列表
     */
    static buildFullThemeCSS(theme: string, pluginExportStyles: string[]): string {
        return [
            this.loadFoundationCSS(),
            this.loadThemeCSS(theme),
            ...pluginExportStyles,
        ].join('\n');
    }

    /**
     * 导入自定义主题 CSS 文件
     * @param uri CSS 文件 URI
     */
    static async importCustomTheme(uri: vscode.Uri): Promise<void> {
        const css = Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf-8');
        const name = path.basename(uri.fsPath, '.css');
        customThemeCache.set(name, css);
        vscode.window.showInformationMessage(`Theme "${name}" imported successfully`);
    }

    /**
     * 切换主题并持久化到 VSCode 配置
     * @param theme 目标主题名称
     */
    static async switchTheme(theme: string): Promise<void> {
        await vscode.workspace.getConfiguration('colaview').update(
            'theme', theme, vscode.ConfigurationTarget.Global
        );
    }
}