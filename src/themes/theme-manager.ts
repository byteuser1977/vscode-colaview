// 主题管理器 — 支持内置主题 + .themes 目录自定义主题
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

const BUILTIN_THEMES = ['light', 'dark', 'elegant', 'newsprint'] as const;
type ThemeName = typeof BUILTIN_THEMES[number];

const customThemeCache = new Map<string, string>();

const THEME_CLASS_MAP: Record<string, string> = {
    light: 'theme-light',
    dark: 'theme-dark',
    elegant: 'theme-elegant',
    newsprint: 'theme-newsprint',
};

/**
 * 获取资源文件目录 — 优先使用 out/ 目录（打包后），回退到 src/（开发模式）
 */
function getResDir(context: vscode.ExtensionContext, ...segments: string[]): string {
    const outDir = path.join(context.extensionPath, 'out', ...segments);
    if (fs.existsSync(outDir)) {
        return outDir;
    }
    return path.join(context.extensionPath, 'src', ...segments);
}

/**
 * 主题管理器 — 负责主题 CSS 加载、切换、自定义主题导入
 */
export class ThemeManager {
    private static context: vscode.ExtensionContext;

    /**
     * 初始化主题管理器
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

    /** 获取内置主题列表 */
    static getBuiltinThemes(): string[] {
        return [...BUILTIN_THEMES];
    }

    /**
     * 获取 .themes 目录路径（当前工作区根目录下）
     * 如果没有打开工作区，返回 null
     */
    static getThemesDir(): string | null {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) return null;
        return path.join(workspaceFolders[0].uri.fsPath, '.themes');
    }

    /**
     * 确保 .themes 目录存在
     */
    private static ensureThemesDir(): string | null {
        const dir = this.getThemesDir();
        if (!dir) return null;
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        return dir;
    }

    /**
     * 扫描 .themes 目录中的自定义主题
     * 返回 { name, path } 列表
     */
    static scanCustomThemes(): Array<{ name: string; filePath: string }> {
        const dir = this.getThemesDir();
        if (!dir || !fs.existsSync(dir)) return [];

        const results: Array<{ name: string; filePath: string }> = [];
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            if (entry.isFile() && entry.name.endsWith('.css')) {
                const name = path.basename(entry.name, '.css');
                results.push({ name, filePath: path.join(dir, entry.name) });
            }
        }
        return results;
    }

    /**
     * 获取完整主题列表（内置 + 自定义）
     */
    static getThemeList(): { builtins: string[]; customs: string[]; current: string } {
        const builtins = this.getBuiltinThemes();
        const customs = this.scanCustomThemes().map(t => t.name);
        const current = this.getCurrentTheme();
        return { builtins, customs, current };
    }

    /**
     * 加载主题 CSS 内容
     * 优先从 .themes/ 加载自定义主题，再加载内置主题
     */
    static loadThemeCSS(theme: string): string {
        // 先检查 .themes 目录
        const themesDir = this.getThemesDir();
        if (themesDir) {
            const customPath = path.join(themesDir, `${theme}.css`);
            if (fs.existsSync(customPath)) {
                return fs.readFileSync(customPath, 'utf-8');
            }
        }
        // 再检查内存缓存
        if (customThemeCache.has(theme)) {
            return customThemeCache.get(theme)!;
        }
        // 最后加载内置主题
        if (BUILTIN_THEMES.includes(theme as ThemeName)) {
            const cssPath = path.join(
                getResDir(this.context, 'themes', 'built-in'), `${theme}.css`
            );
            if (fs.existsSync(cssPath)) {
                return fs.readFileSync(cssPath, 'utf-8');
            }
        }
        return '';
    }

    /** 获取 foundation.css 基础变量层 */
    static loadFoundationCSS(): string {
        const cssPath = path.join(
            getResDir(this.context, 'themes'), 'foundation.css'
        );
        if (fs.existsSync(cssPath)) {
            return fs.readFileSync(cssPath, 'utf-8');
        }
        return '';
    }

    /**
     * 导入自定义主题 — 复制到 .themes 目录并缓存
     * @param uri 源 CSS 文件 URI
     */
    static async importCustomTheme(uri: vscode.Uri): Promise<{ name: string; css: string } | null> {
        const themesDir = this.ensureThemesDir();
        if (!themesDir) {
            vscode.window.showWarningMessage('No workspace folder open. Cannot import theme.');
            return null;
        }

        const css = Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf-8');
        const name = path.basename(uri.fsPath, '.css');
        const destPath = path.join(themesDir, `${name}.css`);

        // 复制文件到 .themes 目录
        fs.writeFileSync(destPath, css, 'utf-8');

        // 更新内存缓存
        customThemeCache.set(name, css);

        vscode.window.showInformationMessage(`Theme "${name}" imported to .themes/`);
        return { name, css };
    }

    /**
     * 切换主题并持久化到 VSCode 配置
     */
    static async switchTheme(theme: string): Promise<void> {
        await vscode.workspace.getConfiguration('colaview').update(
            'theme', theme, vscode.ConfigurationTarget.Global
        );
    }
}
