# 刘贺的小工具

[打开网页工具](https://liuhedev.github.io/web-tools/)

- 日志解码 — 还原 Nginx 十六进制转义、UTF-8 和多层 JSON。
- 照片时间修复 — 从文件名提取拍摄时间，批量更新 JPEG 的 EXIF 时间。时间戳按设备时区转换，只有日期时使用中午 12 点。
- 视频提取图片 — 用浏览器解码视频，按间隔截取 JPEG，可跳过相似画面。支持单张和 ZIP 下载。

输入和文件在浏览器内处理。视频格式取决于浏览器的解码能力。抽帧每次最多检查 300 个画面，最多保留 128 MB 的图片。

## 本地预览

需要 Node.js 和 Python 3（仅用于启动预览服务器）。

```sh
npm ci
npm run build
python3 -m http.server 8000 --directory dist
```

打开 <http://localhost:8000>。

## GitHub Pages

在仓库的 Settings → Pages 中，将发布源设为 GitHub Actions。推送到 `main` 后，工作流会构建并发布 `dist/`。页面和静态资源使用相对路径，可以部署在项目子路径。
