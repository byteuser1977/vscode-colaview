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

export interface EditorScrollMessage {
    type: 'editorScroll';
    scrollPercent: number;
}