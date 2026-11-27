import { filenameTime, repairJpeg } from './exif.js';
import { clearDownloads, downloadLink, zipButton } from '../downloads.js';

const form = document.querySelector('#form');
const input = document.querySelector('#photos');
const run = document.querySelector('#run');
const status = document.querySelector('#status');
const results = document.querySelector('#results');
const rows = document.querySelector('#rows');
const zip = document.querySelector('#zip');
const repaired = new Map();
zipButton(zip, form, status, () => [...repaired], '修复后的照片.zip');

form.addEventListener('submit', async event => {
  event.preventDefault();
  const files = [...input.files];
  input.disabled = run.disabled = zip.disabled = true;
  status.dataset.error = 'false';
  status.textContent = '正在修复照片…';
  clearDownloads(rows);
  repaired.clear();
  results.hidden = false;

  for (const file of files) {
    const row = document.createElement('li');
    const description = document.createElement('span');
    row.append(description);
    try {
      const time = filenameTime(file.name);
      const blob = await repairJpeg(file, time);
      const original = file.name.replace(/[/\\]/g, '_');
      let name = original;
      for (let index = 2; repaired.has(name); index++) name = `${index}-${original}`;
      repaired.set(name, blob);
      description.textContent = `${file.name} · ${time}`;
      row.append(downloadLink(blob, name, '下载照片'));
    } catch (error) {
      description.textContent = `${file.name} · ${error.message}`;
    }
    rows.append(row);
  }
  status.textContent = `已修复 ${repaired.size} 张，未处理 ${files.length - repaired.size} 张。`;
  status.dataset.error = String(!repaired.size);
  input.disabled = run.disabled = false;
  zip.disabled = !repaired.size;
});
