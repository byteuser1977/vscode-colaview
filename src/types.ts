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