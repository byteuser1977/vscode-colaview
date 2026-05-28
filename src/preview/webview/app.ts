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

// ── Message handler ──
window.addEventListener('message', async (event: MessageEvent) => {
    const data = event.data;
    switch (data.type) {
        case 'init': {
            try {
                currentTheme = data.theme || 'light';
                handle = await createColaMDEditor({
                    rootId: 'editor',
                    theme: currentTheme,
                    editable: false,
                    onChange: (md: string) => { currentMarkdown = md; },
                });
                // 自定义主题需要 custom: 前缀 + CSS
                if (data.customCSS && data.theme) {
                    handle.applyTheme('custom:' + data.theme, data.customCSS);
                }
                if (data.markdown) {
                    handle.setMarkdown(data.markdown);
                    currentMarkdown = data.markdown;
                }
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
            // If context menu is open, refresh theme submenu
            refreshThemeSubmenu();
            break;
        }
    }
});

// ── Context Menu ──

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
        // Request theme list from extension host
        vscode.postMessage({ type: 'requestThemeList' });
        const loading = document.createElement('div');
        loading.className = 'ctx-menu-item ctx-menu-disabled';
        loading.textContent = 'Loading...';
        submenu.appendChild(loading);
        return submenu;
    }

    // Built-in themes section
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

    // Custom themes section
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

    // Export HTML
    menu.appendChild(createMenuItem('Export HTML', () => {
        vscode.postMessage({ type: 'requestExportHTML' });
    }));

    // Export PDF
    menu.appendChild(createMenuItem('Export PDF', () => {
        vscode.postMessage({ type: 'requestExportPDF' });
    }));

    menu.appendChild(createMenuSeparator());

    // Theme submenu
    const themeItem = document.createElement('div');
    themeItem.className = 'ctx-menu-item ctx-menu-has-submenu';
    themeItem.textContent = 'Theme';
    themeItem.appendChild(buildThemeSubmenu());
    menu.appendChild(themeItem);

    menu.appendChild(createMenuSeparator());

    // Import Theme
    menu.appendChild(createMenuItem('Import Theme...', () => {
        vscode.postMessage({ type: 'requestImportTheme' });
    }));

    document.body.appendChild(menu);

    // Adjust position if menu goes off-screen
    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
        menu.style.left = (x - rect.width) + 'px';
    }
    if (rect.bottom > window.innerHeight) {
        menu.style.top = (y - rect.height) + 'px';
    }

    // Close on click outside (deferred to avoid immediate close)
    setTimeout(() => {
        document.addEventListener('click', closeMenu);
        document.addEventListener('contextmenu', closeMenu);
    }, 0);
}

// Prevent default context menu and show custom one
document.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    showMenu(e.clientX, e.clientY);
});

// Signal that the WebView script has loaded
vscode.postMessage({ type: 'ready' });
