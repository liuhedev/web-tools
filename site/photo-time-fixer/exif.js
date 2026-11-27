export function filenameTime(filename) {
  const name = filename.replace(/\.[^.]+$/, '');
  const exported = /^mmexport_?(\d{13})(?!\d)/i.exec(name);
  const full = /(?<!\d)(\d{4})(\d{2})(\d{2})[_-]?(\d{2})(\d{2})(\d{2})(?!\d)/.exec(name)
    || /(?<!\d)(\d{4})-(\d{2})-(\d{2})[-_](\d{2})(\d{2})(\d{2})(?!\d)/.exec(name);
  const short = /^video_(\d{2})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})(?!\d)/.exec(name);
  const minute = /(?<!\d)(20\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(?!\d)/.exec(name);
  const day = /(?<!\d)(20\d{2})[-_](\d{2})[-_](\d{2})(?!\d)/.exec(name);
  let parts;
  if (full) parts = full.slice(1);
  else if (short) parts = ['20' + short[1], ...short.slice(2)];
  else if (minute) parts = [...minute.slice(1), '00'];
  else if (day) parts = [...day.slice(1), '12', '00', '00'];

  if (exported || !parts) {
    const candidates = [...name.matchAll(/(?<!\d)(\d{13}|\d{10})(?!\d)/g)].map(match => match[1]);
    const timestamp = exported?.[1] || candidates.reverse().find(value => {
      const seconds = Number(value) / (value.length === 13 ? 1000 : 1);
      return seconds > 1_000_000_000 && seconds < 2_000_000_000;
    });
    if (!timestamp) throw new Error('文件名里没有识别到拍摄时间');
    const date = new Date(Number(timestamp) * (timestamp.length === 10 ? 1000 : 1));
    parts = [date.getFullYear(), date.getMonth() + 1, date.getDate(), date.getHours(), date.getMinutes(), date.getSeconds()]
      .map(value => String(value).padStart(2, '0'));
  }

  const [year, month, dayOfMonth, hour, minuteOfHour, second] = parts.map(Number);
  const date = new Date(Date.UTC(year, month - 1, dayOfMonth, hour, minuteOfHour, second));
  if (year < 1000 || date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month
    || date.getUTCDate() !== dayOfMonth || hour > 23 || minuteOfHour > 59 || second > 59) {
    throw new Error('文件名中的日期或时间无效');
  }
  return parts.slice(0, 3).join(':') + ' ' + parts.slice(3).join(':');
}

const exifSignature = Uint8Array.of(0x45, 0x78, 0x69, 0x66, 0, 0);

function exifSegment(jpeg) {
  if (jpeg[0] !== 255 || jpeg[1] !== 216) throw new Error('请选择 JPEG 照片');
  let offset = 2;
  // Keep a JFIF APP0 segment first when inserting EXIF.
  let insertion = offset;
  while (offset + 1 < jpeg.length && jpeg[offset] === 255) {
    const start = offset;
    while (jpeg[offset] === 255) offset++;
    const marker = jpeg[offset++];
    if (marker === 218) return { start: insertion, end: insertion };
    const length = (jpeg[offset] << 8) | jpeg[offset + 1];
    const end = offset + length;
    if (length < 2 || end > jpeg.length) break;
    const payload = offset + 2;
    if (marker === 225 && end - payload >= 6
      && exifSignature.every((value, index) => jpeg[payload + index] === value)) {
      return { start, end, tiff: jpeg.subarray(payload + 6, end) };
    }
    if (start === 2 && marker === 224) insertion = end;
    offset = end;
  }
  throw new Error('JPEG 文件结构不完整');
}

function updatedTiff(original, time) {
  const source = new DataView(original.buffer, original.byteOffset, original.byteLength);
  const order = source.byteLength >= 8 && source.getUint16(0);
  const little = order === 0x4949;
  if ((!little && order !== 0x4d4d) || source.getUint16(2, little) !== 42) {
    throw new Error('无法读取照片原有的 EXIF');
  }
  function readDirectory(offset) {
    if (offset < 8 || offset + 2 > source.byteLength) throw new Error('照片的 EXIF 目录无效');
    const count = source.getUint16(offset, little);
    const end = offset + 2 + count * 12;
    if (end + 4 > source.byteLength) throw new Error('照片的 EXIF 目录不完整');
    const entries = new Map();
    for (let position = offset + 2; position < end; position += 12) {
      entries.set(source.getUint16(position, little), original.subarray(position, position + 12));
    }
    return { entries, next: source.getUint32(end, little) };
  }
  const root = readDirectory(source.getUint32(4, little));
  const pointer = root.entries.get(0x8769);
  const exif = pointer
    ? readDirectory(new DataView(pointer.buffer, pointer.byteOffset, 12).getUint32(8, little))
    : { entries: new Map(), next: 0 };

  // Preserve old value offsets, thumbnails, and proprietary metadata by appending
  // replacement directories instead of rebuilding the original TIFF payload.
  const dateOffset = original.length + original.length % 2;
  const rootOffset = dateOffset + 20;
  const entry = (tag, type, count, value) => {
    const bytes = new Uint8Array(12);
    const view = new DataView(bytes.buffer);
    view.setUint16(0, tag, little);
    view.setUint16(2, type, little);
    view.setUint32(4, count, little);
    view.setUint32(8, value, little);
    return bytes;
  };
  root.entries.set(0x0132, entry(0x0132, 2, 20, dateOffset));
  root.entries.set(0x8769, null);
  const exifOffset = rootOffset + 6 + root.entries.size * 12;
  root.entries.set(0x8769, entry(0x8769, 4, 1, exifOffset));
  for (const tag of [0x9010, 0x9011, 0x9012, 0x9290, 0x9291, 0x9292]) exif.entries.delete(tag);
  for (const tag of [0x9003, 0x9004]) exif.entries.set(tag, entry(tag, 2, 20, dateOffset));
  const size = exifOffset + 6 + exif.entries.size * 12;
  if (size + 8 > 65535) throw new Error('照片的 EXIF 空间不足');
  const output = new Uint8Array(size);
  output.set(original);
  output.set(new TextEncoder().encode(time), dateOffset);
  const view = new DataView(output.buffer);
  view.setUint32(4, rootOffset, little);

  function writeDirectory(offset, { entries, next }) {
    view.setUint16(offset, entries.size, little);
    let position = offset + 2;
    for (const [, bytes] of [...entries].sort(([a], [b]) => a - b)) {
      output.set(bytes, position);
      position += 12;
    }
    view.setUint32(position, next, little);
  }
  writeDirectory(rootOffset, root);
  writeDirectory(exifOffset, exif);
  return output;
}

export async function repairJpeg(file, time) {
  const jpeg = new Uint8Array(await file.arrayBuffer());
  const { start, end, tiff } = exifSegment(jpeg);
  const emptyTiff = Uint8Array.of(73, 73, 42, 0, 8, 0, 0, 0, 0, 0, 0, 0, 0, 0);
  const updated = updatedTiff(tiff ?? emptyTiff, time);
  const length = updated.length + 8;
  const marker = Uint8Array.of(255, 225, length >> 8, length & 255);
  return new Blob([file.slice(0, start), marker, exifSignature, updated, file.slice(end)], { type: 'image/jpeg' });
}
