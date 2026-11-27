import { clearDownloads, downloadLink, zipButton } from '../downloads.js';

const form = document.querySelector('#form');
const input = document.querySelector('#video');
const interval = document.querySelector('#interval');
const deduplicate = document.querySelector('#deduplicate');
const run = document.querySelector('#run');
const cancel = document.querySelector('#cancel');
const status = document.querySelector('#status');
const progress = document.querySelector('#progress');
const results = document.querySelector('#results');
const frames = document.querySelector('#frames');
const zip = document.querySelector('#zip');
const images = new Map();
zipButton(zip, form, status, () => [...images], '视频截图.zip');

const maxFrames = 300;
const maxBytes = 128 * 1024 * 1024;

async function waitFor(video, event, signal, start = () => {}) {
  signal.throwIfAborted();
  const listeners = new AbortController();
  const failure = '无法读取视频画面，请尝试 H.264 编码的 MP4。';
  let timer;
  try {
    await new Promise((resolve, reject) => {
      const options = { once: true, signal: listeners.signal };
      video.addEventListener(event, resolve, options);
      video.addEventListener('error', () => reject(new Error(failure)), options);
      signal.addEventListener('abort', () => reject(signal.reason), options);
      timer = setTimeout(() => reject(new Error(failure)), 12_000);
      start();
    });
  } finally {
    clearTimeout(timer);
    listeners.abort();
  }
}

function isSimilar(first, second) {
  let difference = 0;
  for (let index = 0; index < first.length; index += 4) {
    difference += Math.abs(first[index] - second[index])
      + Math.abs(first[index + 1] - second[index + 1])
      + Math.abs(first[index + 2] - second[index + 2]);
  }
  return difference / (first.length / 4 * 3) < 5;
}

function addFrame(blob, time) {
  const name = `frame-${String(images.size + 1).padStart(3, '0')}-${time.toFixed(3)}s.jpg`;
  images.set(name, blob);
  const row = document.createElement('li');
  const link = downloadLink(blob, name, `下载 ${Number(time.toFixed(3))} 秒画面`);
  link.className = 'download';
  const preview = document.createElement('img');
  preview.src = link.href;
  preview.alt = `${Number(time.toFixed(3))} 秒画面`;
  preview.loading = 'lazy';
  row.append(preview, link);
  frames.append(row);
  results.hidden = false;
}

async function extract(video, step, skipSimilar, signal) {
  if (!Number.isFinite(video.duration) || video.duration <= 0 || !video.videoWidth) {
    throw new Error('无法识别这段视频的时长或尺寸。');
  }
  const count = Math.ceil(video.duration / step);
  if (count > maxFrames) {
    const minimum = Math.ceil(video.duration / maxFrames * 10) / 10;
    throw new Error(`每次最多检查 ${maxFrames} 个画面，请把间隔设为 ${minimum} 秒或更长。`);
  }

  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const context = canvas.getContext('2d');
  const sample = document.createElement('canvas');
  sample.width = 96;
  sample.height = 54;
  const sampleContext = sample.getContext('2d', { willReadFrequently: true });
  let previous;
  let bytes = 0;
  progress.max = count;
  progress.value = 0;
  progress.hidden = false;

  for (let index = 0; index < count; index++) {
    signal.throwIfAborted();
    const time = index * step;
    if (index > 0) await waitFor(video, 'seeked', signal, () => { video.currentTime = time; });
    progress.value = index + 1;

    let pixels;
    if (skipSimilar) {
      sampleContext.drawImage(video, 0, 0, sample.width, sample.height);
      pixels = sampleContext.getImageData(0, 0, sample.width, sample.height).data;
      if (previous && isSimilar(previous, pixels)) continue;
    }

    context.drawImage(video, 0, 0);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.92));
    signal.throwIfAborted();
    if (!blob) throw new Error('无法生成图片，请尝试分辨率更低的视频。');
    if (bytes + blob.size > maxBytes) return '输出达到 128 MB，已保留本次生成的图片。';
    addFrame(blob, time);
    previous = pixels;
    bytes += blob.size;
  }
  return `已提取 ${images.size} 张图片。`;
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  const file = input.files[0];
  if (!file) return;

  const controller = new AbortController();
  cancel.onclick = () => controller.abort();
  input.disabled = interval.disabled = deduplicate.disabled = run.disabled = zip.disabled = true;
  cancel.hidden = false;
  results.hidden = true;
  progress.hidden = true;
  clearDownloads(frames);
  images.clear();
  status.dataset.error = 'false';
  status.textContent = '正在读取视频…';

  const video = document.createElement('video');
  video.preload = 'auto';
  const url = URL.createObjectURL(file);
  try {
    await waitFor(video, 'loadeddata', controller.signal, () => { video.src = url; });
    status.textContent = '正在提取图片…';
    status.textContent = await extract(video, interval.valueAsNumber, deduplicate.checked, controller.signal);
  } catch (error) {
    if (controller.signal.aborted) status.textContent = `已停止，保留 ${images.size} 张图片。`;
    else {
      status.textContent = error.message;
      status.dataset.error = 'true';
    }
  } finally {
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(url);
    input.disabled = interval.disabled = deduplicate.disabled = run.disabled = false;
    zip.disabled = !images.size;
    progress.hidden = cancel.hidden = true;
    cancel.onclick = null;
  }
});
