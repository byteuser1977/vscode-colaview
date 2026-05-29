/**
 * ColaView MD — WebView runtime
 * Milkdown editor in read-only mode + right-click context menu.
 */
import { createColaMDEditor } from '@bytechain.cn/colamd/renderer';
import type { ColaMDEditorHandle } from '@bytechain.cn/colamd/renderer';

// @ts-ignore — VSCode WebView API
const vscode = acquireVsCodeApi();

let handle: ColaMDEditorHandle | null = null;
let currentMarkdown = '';
let currentTheme = 'light';
let themeListData: { builtins: string[]; customs: string[]; current: string } | null = null;
let scrollDebounceTimer: number | null = null;
let receivedScrollFromEditor = false;

function setupScrollSync(): void {
    const editorEl = document.getElementById('editor');
    if (!editorEl) return;

    editorEl.addEventListener('scroll', (e) => {
        const target = e.target as HTMLElement;
        if (scrollDebounceTimer) clearTimeout(scrollDebounceTimer);
        
        scrollDebounceTimer = window.setTimeout(() => {
            if (receivedScrollFromEditor) {
                receivedScrollFromEditor = false;
                return;
            }

            const scrollPercent = target.scrollTop / (target.scrollHeight - target.clientHeight);
            vscode.postMessage({
                type: 'scrollSync',
                scrollPercent: Math.max(0, Math.min(1, scrollPercent)),
            });
        }, 50);
    });
}

function scrollToPercent(percent: number): void {
    const editorEl = document.getElementById('editor');
    if (!editorEl || !handle) return;

    receivedScrollFromEditor = true;
    
    const maxScroll = editorEl.scrollHeight - editorEl.clientHeight;
    const targetScrollTop = Math.max(0, Math.min(percent * maxScroll, maxScroll));
    
    editorEl.scrollTo({
        top: targetScrollTop,
        behavior: 'smooth'
    });
}

function scrollToLine(line: number, totalLines: number, topRatio: number = 0.3): void {
    const editorEl = document.getElementById('editor');
    if (!editorEl || !handle) return;

    receivedScrollFromEditor = true;

    const contentEl = editorEl.querySelector('.editor-content, .milkdown, .prosemirror') || editorEl.firstElementChild;
    if (!contentEl) {
        const scrollPercent = totalLines > 1 ? line / (totalLines - 1) : 0;
        scrollToPercent(scrollPercent);
        return;
    }

    const lineElements = contentEl.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, tr, code, pre, div');
    if (lineElements.length === 0) {
        const scrollPercent = totalLines > 1 ? line / (totalLines - 1) : 0;
        scrollToPercent(scrollPercent);
        return;
    }

    const scrollPercent = totalLines > 1 ? line / (totalLines - 1) : 0;
    let targetIndex = Math.min(Math.floor(scrollPercent * lineElements.length), lineElements.length - 1);

    const targetElement = lineElements[targetIndex] as HTMLElement;
    if (targetElement) {
        const editorRect = editorEl.getBoundingClientRect();
        const elementRect = targetElement.getBoundingClientRect();
        const elementOffsetTop = targetElement.offsetTop;

        const currentScrollTop = editorEl.scrollTop;
        const scrollOffset = elementOffsetTop - (editorRect.height * topRatio);
        
        const maxScroll = editorEl.scrollHeight - editorRect.height;
        const finalScrollTop = Math.max(0, Math.min(scrollOffset, maxScroll));

        editorEl.scrollTo({
            top: finalScrollTop,
            behavior: 'smooth'
        });
    } else {
        scrollToPercent(scrollPercent);
    }
}

function injectThemeCSS(css: string | undefined): void {
    if (!css) return;
    let el = document.getElementById('colaview-theme-css');
    if (!el) {
        el = document.createElement('style');
        el.id = 'colaview-theme-css';
        document.head.appendChild(el);
    }
    el.textContent = css;
}

window.addEventListener('message', async (event: MessageEvent) => {
    const data = event.data;
    switch (data.type) {
        case 'init': {
            try {
                currentTheme = data.theme || 'light';
                injectThemeCSS(data.themeCSS);
                handle = await createColaMDEditor({
                    rootId: 'editor',
                    theme: currentTheme,
                    editable: false,
                    onChange: (md: string) => { currentMarkdown = md; },
                });
                if (data.customCSS && data.theme) {
                    handle.applyTheme('custom:' + data.theme, data.customCSS);
                }
                if (data.markdown) {
                    handle.setMarkdown(data.markdown);
                    currentMarkdown = data.markdown;
                }
                setupScrollSync();
            } catch (e) {
                console.error('[ColaView] init failed:', e);
                vscode.postMessage({ type: 'error', message: String(e) });
            }
            break;
        }
        case 'update': {
            if (!handle) return;
            if (data.markdown !== undefined && data.markdown !== currentMarkdown) {
                handle.setMarkdown(data.markdown);
                currentMarkdown = data.markdown;
            }
            if (data.theme) {
                injectThemeCSS(data.themeCSS);
                if (data.customCSS) {
                    handle.applyTheme('custom:' + data.theme, data.customCSS);
                } else {
                    handle.applyTheme(data.theme);
                }
                currentTheme = data.theme;
            }
            break;
        }
        case 'exportHTML': {
            if (!handle) {
                vscode.postMessage({ type: 'exportHTMLResult', html: '' });
                return;
            }
            await handle.ensureAllPluginsRendered();
            const html = handle.buildExportHTML();
            vscode.postMessage({ type: 'exportHTMLResult', html });
            break;
        }
        case 'updateTheme': {
            if (!handle || !data.theme) return;
            injectThemeCSS(data.themeCSS);
            if (data.customCSS) {
                handle.applyTheme('custom:' + data.theme, data.customCSS);
            } else {
                handle.applyTheme(data.theme);
            }
            currentTheme = data.theme;
            break;
        }
        case 'applyCustomTheme': {
            if (!data.css || !handle) return;
            const themeName = data.name || currentTheme;
            handle.applyTheme('custom:' + themeName, data.css);
            break;
        }
        case 'togglePlugin': {
            if (!handle) return;
            handle.togglePlugin(data.id, data.enabled);
            break;
        }
        case 'themeList': {
            themeListData = {
                builtins: data.builtins || [],
                customs: data.customs || [],
                current: data.current || currentTheme,
            };
            refreshThemeSubmenu();
            break;
        }
        case 'editorScroll': {
            if (data.scrollPercent !== undefined) {
                scrollToPercent(data.scrollPercent);
            } else if (data.line !== undefined) {
                scrollToLine(data.line, data.totalLines || 100, data.topRatio || 0.3);
            }
            break;
        }
    }
});

let menuEl: HTMLElement | null = null;
let themeSubmenuEl: HTMLElement | null = null;

function closeMenu(): void {
    if (menuEl) {
        menuEl.remove();
        menuEl = null;
        themeSubmenuEl = null;
    }
    document.removeEventListener('click', closeMenu);
    document.removeEventListener('contextmenu', closeMenu);
}

function createMenuItem(label: string, onClick: () => void): HTMLElement {
    const item = document.createElement('div');
    item.className = 'ctx-menu-item';
    item.textContent = label;
    item.addEventListener('click', (e) => {
        e.stopPropagation();
        closeMenu();
        onClick();
    });
    return item;
}

function createMenuSeparator(): HTMLElement {
    const sep = document.createElement('div');
    sep.className = 'ctx-menu-separator';
    return sep;
}

function buildThemeSubmenu(): HTMLElement {
    const submenu = document.createElement('div');
    submenu.className = 'ctx-menu-submenu';
    themeSubmenuEl = submenu;

    if (!themeListData) {
        vscode.postMessage({ type: 'requestThemeList' });
        const loading = document.createElement('div');
        loading.className = 'ctx-menu-item ctx-menu-disabled';
        loading.textContent = 'Loading...';
        submenu.appendChild(loading);
        return submenu;
    }

    for (const name of themeListData.builtins) {
        const item = document.createElement('div');
        item.className = 'ctx-menu-item' + (name === themeListData.current ? ' ctx-menu-active' : '');
        item.textContent = name.charAt(0).toUpperCase() + name.slice(1);
        item.addEventListener('click', (e) => {
            e.stopPropagation();
            if (themeListData) themeListData.current = name;
            closeMenu();
            vscode.postMessage({ type: 'switchTheme', name });
        });
        submenu.appendChild(item);
    }

    if (themeListData.customs.length > 0) {
        const sep = document.createElement('div');
        sep.className = 'ctx-menu-separator';
        submenu.appendChild(sep);

        for (const name of themeListData.customs) {
            const item = document.createElement('div');
            item.className = 'ctx-menu-item' + (name === themeListData.current ? ' ctx-menu-active' : '');
            item.textContent = name;
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                if (themeListData) themeListData.current = name;
                closeMenu();
                vscode.postMessage({ type: 'switchTheme', name });
            });
            submenu.appendChild(item);
        }
    }

    return submenu;
}

function refreshThemeSubmenu(): void {
    if (!menuEl || !themeSubmenuEl) return;
    const parent = themeSubmenuEl.parentElement;
    if (!parent) return;
    const newSubmenu = buildThemeSubmenu();
    parent.replaceChild(newSubmenu, themeSubmenuEl);
}

function showMenu(x: number, y: number): void {
    closeMenu();

    const menu = document.createElement('div');
    menu.className = 'ctx-menu';
    menu.style.left = x + 'px';
    menu.style.top = y + 'px';
    menuEl = menu;

    menu.appendChild(createMenuItem('Export HTML', () => {
        vscode.postMessage({ type: 'requestExportHTML' });
    }));

    menu.appendChild(createMenuItem('Export PDF', () => {
        vscode.postMessage({ type: 'requestExportPDF' });
    }));

    menu.appendChild(createMenuSeparator());

    const themeItem = document.createElement('div');
    themeItem.className = 'ctx-menu-item ctx-menu-has-submenu';
    themeItem.textContent = 'Theme';
    themeItem.appendChild(buildThemeSubmenu());
    menu.appendChild(themeItem);

    menu.appendChild(createMenuSeparator());

    menu.appendChild(createMenuItem('Import Theme...', () => {
        vscode.postMessage({ type: 'requestImportTheme' });
    }));

    document.body.appendChild(menu);

    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
        menu.style.left = (x - rect.width) + 'px';
    }
    if (rect.bottom > window.innerHeight) {
        menu.style.top = (y - rect.height) + 'px';
    }

    setTimeout(() => {
        document.addEventListener('click', closeMenu);
        document.addEventListener('contextmenu', closeMenu);
    }, 0);
}

document.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    showMenu(e.clientX, e.clientY);
});

vscode.postMessage({ type: 'ready' });