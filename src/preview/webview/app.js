// WebView 前端脚本 - 接收 VSCode 消息、更新预览内容
var vscode = acquireVsCodeApi();

window.addEventListener('message', function (event) {
    var data = event.data;
    switch (data.type) {
        case 'update':
            document.getElementById('preview-content').innerHTML = data.data.html;
            document.getElementById('theme-style').textContent = data.data.themeCSS;
            document.getElementById('base-tag').href = data.data.basePath;
            document.body.className = data.data.themeClass || '';
            if (data.data.scrollTop) document.body.scrollTop = data.data.scrollTop;
            break;
        case 'scroll':
            document.body.scrollTop = data.data.scrollTop;
            break;
    }
});

document.addEventListener('scroll', function () {
    vscode.postMessage({ type: 'scrollUpdate', scrollTop: document.body.scrollTop });
});