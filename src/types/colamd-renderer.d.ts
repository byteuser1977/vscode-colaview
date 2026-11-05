// ColaMD 2.7.9 渲染库类型声明 + 模块声明
// 基于 @bytechain.cn/colamd@2.7.9 的 src/lib/index.ts 接口定义
// 2.7.9 包未发布 .d.ts 文件，此文件提供类型补全

declare module '@bytechain.cn/colamd/renderer' {
    export interface ColaMDEditorOptions {
        /** 编辑器容器 id。默认 `editor`，容器不存在时直接报错。 */
        rootId?: string;
        /** 初始 markdown。默认空文档。 */
        markdown?: string;
        /** 是否可编辑。导出场景默认 false。 */
        editable?: boolean;
    }

    export interface ColaMDRendererHandle {
        /** 应用主题：内置主题名，或 `custom:` + `:root` 契约 CSS。 */
        applyTheme(name: string, customCSS?: string): void;
        /** 替换整篇文档（会清空撤销栈）。 */
        setMarkdown(markdown: string): void;
        /** 当前缓冲区内容。 */
        getMarkdown(): string;
        /** 摊平整篇、等 mermaid/图片/字体就绪。 */
        ensureAllPluginsRendered(): Promise<void>;
        /** 产出一份可以离线打开的完整 HTML。 */
        buildExportHTML(options?: { title?: string }): Promise<string>;
        /** 销毁编辑器。 */
        destroy(): void;
    }

    export interface ThemeContract {
        contractVersion: string;
        liveVariables: string[];
        deadVariables: string[];
        deadSelectors: string[];
        editorHooks: string[];
        peleVariables: string[];
        constraints: {
            rootOnly: boolean;
            ptUnitsForbidden: boolean;
            verticalPaddingForbiddenOn: string[];
        };
    }

    export function createColaMDEditor(options?: ColaMDEditorOptions): Promise<ColaMDRendererHandle>;
    export const THEME_CONTRACT: ThemeContract;
    export const CONTRACT_VERSION: string;
}
