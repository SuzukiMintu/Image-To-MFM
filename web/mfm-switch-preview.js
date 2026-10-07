import { renderSwitchMfm } from './switch-preview.js';
import { switchFrames, textFrames } from './switch-mfm.js';
import { fetchEmoji } from './emoji.js';
import { inspectGif, conversionWarnings } from './load-warning.js';
import { options } from './core.js';
const $ = id => document.getElementById(id);
let sources = [], worker = null, generation = 0, controller = null, output = null, downloadUrl = null, framesUrl = null, originalUrl = null;

function status(text) { $('status').textContent = text; }
function cancel() {
  generation++; controller?.abort(); controller = null; worker?.terminate(); worker = null;
  $('cancel').hidden = true; $('generate').disabled = false; $('example').disabled = false; $('fetch').disabled = false;
}
function clearOutput() {
  output = null; $('output').value = ''; $('length').textContent = ''; $('timing').textContent = '';
  $('layout-warning').textContent = '';
  $('render').replaceChildren(); $('frames').replaceChildren(); $('restart').disabled = true; $('copy').disabled = true;
  $('download').removeAttribute('href'); if (downloadUrl) URL.revokeObjectURL(downloadUrl); downloadUrl = null;
  $('export-frames').removeAttribute('href'); if (framesUrl) URL.revokeObjectURL(framesUrl); framesUrl = null;
}
function clearSources() {
  new Set(sources.map(source => source.bitmap).filter(Boolean)).forEach(bitmap => bitmap.close()); sources = [];
  if (originalUrl) URL.revokeObjectURL(originalUrl); originalUrl = null; $('gif-original').removeAttribute('src'); $('original-wrap').hidden = true;
}
function closePending(list) { new Set(list.map(source => source.bitmap).filter(Boolean)).forEach(bitmap => bitmap.close()); }
function sourceNames() {
  $('sources').textContent = sources.length ? sources.map((source, i) => `${i + 1}. ${source.name}`).join(' / ') : '画像が選択されていません。';
  if (sources.length === 1 && sources[0].bytes) {
    if (originalUrl) URL.revokeObjectURL(originalUrl);
    originalUrl = URL.createObjectURL(new Blob([sources[0].bytes], { type: 'image/gif' })); $('gif-original').src = originalUrl; $('original-wrap').hidden = false;
  }
}
async function decode(blob, name) {
  const bytes = await blob.arrayBuffer();
  if (String.fromCharCode(...new Uint8Array(bytes, 0, Math.min(6, bytes.byteLength))).startsWith('GIF8')) return { bytes, name };
  return { bitmap: await createImageBitmap(blob), name };
}
function show(result, frames = [], gif = null) {
  output = result; $('output').value = result.text;
  $('length').textContent = `${result.length.toLocaleString()}文字・入れ子${result.depth}段`;
  $('timing').textContent = `${result.count}コマ・1周${result.period}秒${gif ? `・元のGIF ${gif.width}×${gif.height}、${gif.count}フレーム、${gif.duration}ms` : `・1コマ約${Number((result.period / result.count).toFixed(3))}秒`}`;
  $('frames').replaceChildren();
  frames.forEach((frame, i) => {
    const figure = document.createElement('figure'); figure.className = 'frame';
    const caption = document.createElement('figcaption'); caption.textContent = `${i + 1}. ${frame.name} · ${frame.length}文字${frame.delay ? ` · ${frame.delay}ms` : ''}`;
    if (frame.pixels) { const canvas = document.createElement('canvas'); canvas.width = frame.width; canvas.height = frame.height;
      canvas.getContext('2d').putImageData(new ImageData(frame.pixels, frame.width, frame.height), 0, 0); figure.append(canvas); }
    figure.append(caption);
    const details = document.createElement('details'), summary = document.createElement('summary'), source = document.createElement('textarea');
    summary.textContent = 'このコマのMFM'; source.value = frame.text || ''; source.readOnly = true; source.setAttribute('aria-label', `コマ${i + 1}のMFM`);
    details.append(summary, source); figure.append(details); $('frames').append(figure);
  });
  $('restart').disabled = false; $('copy').disabled = false;
  if (downloadUrl) URL.revokeObjectURL(downloadUrl);
  downloadUrl = URL.createObjectURL(new Blob([result.text], { type: 'text/plain;charset=utf-8' })); $('download').href = downloadUrl;
  if (framesUrl) URL.revokeObjectURL(framesUrl);
  const frameData = { gif, period: result.period, combinedMfm: result.text, depth: result.depth, frames: frames.map((frame, i) => ({
    name: frame.name, width: frame.width, height: frame.height, delayMs: result.durations[i] * 1000, text: frame.text || '', length: frame.length,
  })) };
  framesUrl = URL.createObjectURL(new Blob([JSON.stringify(frameData, null, 2)], { type: 'application/json' })); $('export-frames').href = framesUrl;
  replay(); status(`MFMを生成しました。${gif?.verification || '公式のお試しコーナーにも貼り付けて確認できます。'}`);
}
function replay() {
  if (!output) return;
  $('render').style.fontSize = '16px';
  $('render').replaceChildren(renderSwitchMfm(output.text));
  const first = $('render').firstElementChild?.firstElementChild;
  const bounds = first?.getBoundingClientRect();
  // Show the visible frame area, rather than the empty vertical layout space.
  $('render').style.height = `${output.heightEm * 16 + 1}px`;
  $('render').style.overflow = 'clip';
  const font = parseFloat(getComputedStyle($('render')).fontSize);
  $('layout-warning').textContent = bounds && (Math.abs(bounds.width - output.widthEm * font) > 1 || Math.abs(bounds.height - output.heightEm * font) > 1)
    ? 'この表示環境ではコマの実寸が想定と異なります。フォントや表示欄の幅によって、公式でも位置がずれる場合があります。' : '';
}
async function generate() {
  cancel(); clearOutput(); const id = generation;
  try {
    if (!$('period').reportValidity()) return;
    const period = Number($('period').value);
    if ($('mode').value === 'text') {
      const lines = $('text-frames').value.replace(/\r/g, '').split('\n').filter(line => line.trim());
      const prepared = textFrames(lines);
      show(switchFrames(prepared.frames, { period, widthEm: prepared.widthEm, heightEm: prepared.heightEm }), lines.map((line, i) => ({ name: line, text: prepared.frames[i], length: prepared.frames[i].length })));
      return;
    }
    if (!sources.length || sources.length > 8 || sources.length === 1 && !sources[0].bytes) throw new Error('画像を2〜8枚、またはGIFを1枚読み込んでください。');
    for (const name of ['width', 'height', 'colors']) if (!$(name).reportValidity()) return;
    const settings = { period, width: Number($('width').value), height: Number($('height').value), colors: Number($('colors').value), gifTiming: $('gif-timing').checked };
    const info = sources[0].bytes ? inspectGif(sources[0].bytes) : sources[0].bitmap;
    const reasons = conversionWarnings(info, options({ width: settings.width, height: settings.height, colors: settings.colors }), sources[0].bytes ? info : null, sources[0].bytes?.byteLength || 0);
    if (reasons.length && !window.confirm(reasons.join('\n\n'))) { status('生成を見送りました。'); return; }
    $('generate').disabled = true; $('cancel').hidden = false; status('画像を変換しています…');
    const copies = [];
    try {
      for (const source of sources) {
        const copy = source.bytes ? { ...source, bytes: source.bytes.slice(0) } : { ...source, bitmap: await createImageBitmap(source.bitmap) };
        if (id !== generation) { copy.bitmap?.close(); return; } copies.push(copy);
      }
      worker = new Worker('./switch-worker.js', { type: 'module' });
      worker.onmessage = ({ data }) => {
        if (id !== generation) return;
        if (data.progress) { status(data.progress); return; }
        cancel();
        if (data.error) { clearOutput(); status(data.error); return; }
        try { show(data.output, data.frames, data.gif); } catch (error) { clearOutput(); status(error.message); }
      };
      worker.onerror = () => { if (id === generation) { cancel(); clearOutput(); status('画像を変換できませんでした。'); } };
      worker.postMessage({ settings, frames: copies }, copies.map(frame => frame.bytes || frame.bitmap)); copies.length = 0;
    } finally { closePending(copies); }
  } catch (error) { if (id === generation) { cancel(); clearOutput(); status(error.message); } }
}
async function loadFiles(files) {
  cancel(); clearOutput(); clearSources(); sourceNames(); const id = generation, pending = [];
  try {
    if (!files.length || files.length > 8) throw new Error('画像を2〜8枚、またはGIFを1枚選択してください。');
    for (const file of files) { const source = await decode(file, file.name); if (id !== generation) { source.bitmap?.close(); return; } pending.push(source); }
    sources = pending.splice(0); sourceNames(); await generate();
  } catch (error) { if (id === generation) status(error.message); }
  finally { closePending(pending); }
}
async function loadEmojis(example = false) {
  cancel(); clearOutput(); clearSources(); sourceNames(); const id = generation, pending = [];
  controller = new AbortController(); const signal = controller.signal;
  $('example').disabled = true; $('fetch').disabled = true; $('cancel').hidden = false;
  try {
    const names = example ? ['petthex_meowsurprised'] : $('emoji-names').value.split(/\r?\n/).map(name => name.trim()).filter(Boolean);
    if (!names.length || names.length > 8) throw new Error('絵文字名を1〜8行入力してください。');
    for (let i = 0; i < names.length; i++) {
      status(`絵文字を取得しています… ${i + 1} / ${names.length}`);
      const emoji = await fetchEmoji(example ? 'https://misskey.io' : $('server').value, names[i], { signal });
      const source = await decode(emoji.blob, `${emoji.name}@${emoji.server}`);
      if (id !== generation) { source.bitmap?.close(); return; } pending.push(source);
    }
    sources = pending.splice(0); sourceNames(); await generate();
  } catch (error) { if (id === generation) { cancel(); status(`取得できませんでした。${error.message}`); } }
  finally { closePending(pending); }
}
$('mode').addEventListener('change', () => { cancel(); clearOutput(); $('text-controls').hidden = $('mode').value !== 'text'; $('image-controls').hidden = $('mode').value !== 'image'; $('original-wrap').hidden = $('mode').value !== 'image' || !originalUrl; status(''); if ($('mode').value === 'text') generate(); });
$('files').addEventListener('change', event => loadFiles([...event.target.files]));
$('example').addEventListener('click', () => loadEmojis(true)); $('fetch').addEventListener('click', () => loadEmojis(false));
$('generate').addEventListener('click', generate); $('restart').addEventListener('click', replay);
$('cancel').addEventListener('click', () => { cancel(); clearOutput(); status('中止しました。'); });
for (const name of ['text-frames', 'period', 'width', 'height', 'colors', 'gif-timing']) $(name).addEventListener('input', () => { cancel(); clearOutput(); status('設定を変更しました。「MFMを生成して再生」を押してください。'); });
$('copy').addEventListener('click', async () => { try { await navigator.clipboard.writeText($('output').value); status('コピーしました。'); } catch { $('output').select(); status('テキストを選択しました。手動でコピーしてください。'); } });
window.addEventListener('resize', replay);
window.addEventListener('pagehide', () => { cancel(); clearSources(); if (downloadUrl) URL.revokeObjectURL(downloadUrl); if (framesUrl) URL.revokeObjectURL(framesUrl); });
generate();
