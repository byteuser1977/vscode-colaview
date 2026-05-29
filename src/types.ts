// 公共类型定义
export interface PDFExportOptions {
    format: 'A4' | 'Letter';
    margin: {
        top: string;
        right: string;
        bottom: string;
        left: string;
    };
    printBackground: boolean;
}

export interface HTMLExportOptions {
    embedImages: boolean;
    includeCDN: boolean;
}

// 滚动同步消息类型
export interface ScrollSyncMessage {
    type: 'scrollSync';
    scrollTop: number;        // 当前滚动位置（像素）
    scrollHeight: number;     // 文档总高度（像素）
    clientHeight: number;     // 视口高度（像素）
}

export interface EditorScrollMessage {
    type: 'editorScroll';
    scrollPercent: number;    // 滚动百分比 0-1
}