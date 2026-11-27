export function downloadLink(blob, name, label) {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = name;
  link.textContent = label;
  return link;
}

export function clearDownloads(container) {
  for (const link of container.querySelectorAll('a[download]')) URL.revokeObjectURL(link.href);
  container.replaceChildren();
}

export function zipButton(button, form, status, getEntries, archiveName) {
  button.addEventListener('click', async () => {
    const entries = getEntries();
    const size = entries.reduce((sum, [, blob]) => sum + blob.size, 0);
    if (size > 128 * 1024 * 1024) {
      status.textContent = '文件合计超过 128 MB，请下载单个文件或分批处理。';
      status.dataset.error = 'true';
      return;
    }
    button.disabled = form.inert = true;
    status.textContent = '正在打包…';
    status.dataset.error = 'false';
    try {
      const files = Object.create(null);
      for (const [name, blob] of entries) {
        files[name] = new Uint8Array(await blob.arrayBuffer());
      }
      // JPEG files are already compressed.
      const archive = fflate.zipSync(files, { level: 0 });
      const link = downloadLink(new Blob([archive], { type: 'application/zip' }), archiveName, '下载 ZIP');
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 30_000);
      status.textContent = 'ZIP 已生成。';
    } catch {
      status.textContent = '打包失败，请尝试下载单个文件。';
      status.dataset.error = 'true';
    } finally {
      button.disabled = form.inert = false;
    }
  });
}
