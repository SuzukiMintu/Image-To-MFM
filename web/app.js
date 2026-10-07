import { options } from './core.js';
import { fetchEmoji, emojiExample } from './emoji.js';
import { renderSwitchMfm } from './switch-preview.js';
import { inspectGif, conversionWarnings } from './load-warning.js';

const $ = id => document.getElementById(id);
const form = $('settings');
let source = null, sourceName = 'image', result = null, worker = null, job = 0, downloadUrl = null;
let gifBytes = null, originalGifUrl = null, gifFramesUrl = null, gifOutput = null;
let gifInfo = null, sourceFileBytes = 0;
const isGifMode = () => $('conversion-mode').value === 'gif';
function updateMode() {
  const animated = isGifMode();
  $('gif-settings').hidden = !animated; $('gif-settings').disabled = !animated;
  $('gif-period').disabled = $('gif-timing').checked;
  $('processed-title').textContent = animated ? '変換後の色（先頭コマ）' : '変換後の色';
  $('original').hidden = !source || animated && !!originalGifUrl;
  $('original-gif').hidden = !source || !animated || !originalGifUrl;
}

function status(message, type = '') { $('status').textContent = message; $('status').className = `status ${type}`; }
function readOptions() {
  return options({ ...Object.fromEntries(new FormData(form)), optimize: form.elements.optimize.checked,
    allowResize: form.elements.allowResize.checked });
}
function clearResult() {
  job++;
  if (worker) { worker.terminate(); worker = null; }
  result = null;
  gifOutput = null; $('gif-frames').replaceChildren(); $('gif-frame-details').hidden = true;
  $('gif-summary').textContent = ''; $('gif-layout-warning').textContent = ''; $('gif-restart').hidden = true;
  $('gif-export').hidden = true; $('gif-export').removeAttribute('href');
  if (gifFramesUrl) URL.revokeObjectURL(gifFramesUrl); gifFramesUrl = null;
  $('mfm-preview').classList.remove('animated');
  $('output').value = ''; $('count').innerHTML = '0 <small>文字</small>';
  $('copy').disabled = true;
  $('download').removeAttribute('href'); $('download').setAttribute('aria-disabled', 'true'); $('download').tabIndex = -1;
  if (downloadUrl) { URL.revokeObjectURL(downloadUrl); downloadUrl = null; }
  $('processed').hidden = true; $('empty-processed').hidden = false;
  $('mfm-preview').replaceChildren(Object.assign(document.createElement('span'), { className: 'placeholder', textContent: '変換すると表示されます' }));
  $('dimensions').textContent = '未変換';
  $('savings').textContent = '変換結果をコピーして、Misskeyの投稿欄へ。';
  $('fit-summary').textContent = ''; $('cancel').hidden = true;
  $('convert').disabled = !source; $('convert').textContent = 'MFMに変換 →';
}

async function decodeBlob(blob) {
  const bytes = await blob.arrayBuffer();
  const signature = String.fromCharCode(...new Uint8Array(bytes, 0, Math.min(6, bytes.byteLength)));
  const bitmap = await createImageBitmap(blob);
  const animated = ['GIF87a', 'GIF89a'].includes(signature);
  try { return { bitmap, bytes: animated ? bytes : null, info: animated ? inspectGif(bytes) : null }; }
  catch (error) { bitmap.close(); throw error; }
}
let loadId = 0, emojiController = null;
function clearSource() {
  if (source) source.close(); source = null;
  gifBytes = null;
  gifInfo = null; sourceFileBytes = 0;
  if (originalGifUrl) URL.revokeObjectURL(originalGifUrl); originalGifUrl = null;
  $('original-gif').removeAttribute('src'); $('original-gif').hidden = true;
  $('conversion-mode').value = 'static'; $('gif-mode-option').disabled = true; updateMode();
  clearResult();
  $('original').hidden = true; $('empty-original').hidden = false;
  $('source-name').textContent = '画像が選択されていません';
}
async function selectImage(blob, name) {
  emojiController?.abort();
  $('fetch-emoji').disabled = false;
  $('example-emoji').disabled = false;
  $('example-gif').disabled = false;
  $('emoji-status').textContent = '';
  const id = ++loadId;
  clearSource();
  status('画像を読み込んでいます…');
  try {
    const { bitmap, bytes, info } = await decodeBlob(blob);
    if (id !== loadId) { bitmap.close(); return false; }
    if (source) source.close();
    source = bitmap; sourceName = name.replace(/\.(?:png|jpe?g|webp|gif|avif|bmp|svg)$/i, '') || 'image';
    gifBytes = bytes;
    gifInfo = info; sourceFileBytes = blob.size;
    if (bytes) {
      originalGifUrl = URL.createObjectURL(blob); $('original-gif').src = originalGifUrl;
      $('gif-mode-option').disabled = false; $('conversion-mode').value = 'gif';
    }
    const canvas = $('original');
    const ratio = Math.min(1, 800 / Math.max(source.width, source.height));
    canvas.width = Math.max(1, Math.round(source.width * ratio)); canvas.height = Math.max(1, Math.round(source.height * ratio));
    canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height);
    canvas.hidden = false; $('empty-original').hidden = true;
    updateMode();
    $('source-name').textContent = `${name} · ${source.width} × ${source.height}`;
    $('convert').disabled = false;
    status('画像を読み込みました。設定を調整して変換できます。', 'success');
    return true;
  } catch (error) {
    if (id !== loadId) return false;
    clearSource();
    status(`画像を読み込めませんでした。${error.message}`, 'error');
    return false;
  }
}
$('file').addEventListener('change', e => { const file = e.target.files[0]; if (file) selectImage(file, file.name); });
$('example-emoji').addEventListener('click', () => {
  $('server-url').value = emojiExample.server;
  $('emoji-name').value = emojiExample.name;
  $('emoji-input').open = true;
  loadEmoji();
});
$('example-gif').addEventListener('click', () => {
  $('server-url').value = 'https://misskey.io'; $('emoji-name').value = 'petthex_meowsurprised';
  $('emoji-input').open = true; loadEmoji();
});
$('fetch-emoji').addEventListener('click', loadEmoji);
async function loadEmoji() {
  emojiController?.abort();
  const controller = new AbortController(); emojiController = controller;
  const id = ++loadId;
  clearSource();
  $('fetch-emoji').disabled = true;
  $('example-emoji').disabled = true;
  $('example-gif').disabled = true;
  $('emoji-status').className = '';
  $('emoji-status').textContent = '絵文字を取得しています…';
  status('Misskeyサーバーから絵文字を取得しています…');
  try {
    const emoji = await fetchEmoji($('server-url').value, $('emoji-name').value, { signal: controller.signal });
    if (id !== loadId) return;
    const loaded = await selectImage(emoji.blob, `${emoji.name}@${emoji.server}`);
    if (loaded) $('emoji-status').textContent = `:${emoji.name}: を読み込みました。`;
    else if (loadId === id + 1) {
      $('emoji-status').className = 'error'; $('emoji-status').textContent = '取得できませんでした。対応していない画像形式です。';
    }
  } catch (error) {
    if (id !== loadId) return;
    const detail = error.name === 'AbortError' ? '時間をおいて、もう一度お試しください。'
      : ['TypeError', 'SyntaxError'].includes(error.name) ? '通信または画像情報の読み込みに失敗しました。' : error.message;
    $('emoji-status').className = 'error';
    $('emoji-status').textContent = `取得できませんでした。${detail}`;
    status('取得できませんでした。URL・絵文字名、またはサーバーの接続状況をご確認ください。', 'error');
  } finally {
    if (emojiController === controller) {
      $('fetch-emoji').disabled = false; $('example-emoji').disabled = false; $('example-gif').disabled = false; emojiController = null;
    }
  }
}
for (const event of ['dragenter', 'dragover']) $('dropzone').addEventListener(event, e => { e.preventDefault(); $('dropzone').classList.add('dragging'); });
for (const event of ['dragleave', 'drop']) $('dropzone').addEventListener(event, e => { e.preventDefault(); $('dropzone').classList.remove('dragging'); });
$('dropzone').addEventListener('drop', e => { const file = e.dataTransfer.files[0]; if (file) selectImage(file, file.name); });
form.addEventListener('input', () => { clearResult(); if (source) status('設定が変更されました。もう一度変換してください。'); });
$('conversion-mode').addEventListener('change', () => { updateMode(); clearResult(); });
$('gif-timing').addEventListener('change', updateMode);
function confirmGeneration(reasons) {
  if (!reasons.length) return Promise.resolve(true);
  const dialog = $('load-warning'); dialog.returnValue = 'cancel';
  $('load-warning-reasons').textContent = reasons.join('\n\n');
  return new Promise(resolve => { dialog.addEventListener('close', () => resolve(dialog.returnValue === 'generate'), { once: true }); dialog.showModal(); });
}
form.addEventListener('submit', async e => {
  e.preventDefault();
  if (!source) return;
  clearResult();
  const id = ++job;
  try {
    const o = readOptions();
    const confirmed = await confirmGeneration(conversionWarnings(source, o, isGifMode() ? gifInfo : null, sourceFileBytes));
    if (id !== job) return;
    if (!confirmed) { status('生成を見送りました。設定を調整して再度変換できます。'); return; }
    if (isGifMode()) { await convertGif(id, o); return; }
    worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    $('convert').disabled = true; $('convert').textContent = '変換中…'; $('cancel').hidden = false;
    status('MFMに変換しています…');
    worker.onmessage = ({ data }) => {
      if (data.id !== job) return;
      if (data.progress) {
        const p = data.progress;
        const stage = p.stage === 'resize' ? 'サイズを小さくしています'
          : p.stage === 'prepare' ? '画像を準備しています'
          : `減色候補を比較しています（${p.colors === 0 ? '減色なし' : `${p.colors}色・${p.palette === 'row' ? '行ごと' : '画像全体'}`}）`;
        status(`${p.width} × ${p.height} px · ${stage} · ${p.attempts}候補`);
        return;
      }
      worker.terminate(); worker = null;
      $('convert').disabled = false; $('convert').textContent = 'MFMに変換 →'; $('cancel').hidden = true;
      if (data.error) { status(data.error, 'error'); return; }
      result = data.result;
      $('output').value = result.text;
      $('count').innerHTML = `${result.length.toLocaleString()} <small>文字</small>`;
      $('dimensions').textContent = `${result.width} × ${result.height} px`;
      const saved = result.baselineLength - result.length;
      $('savings').textContent = result.usedOptions.optimize
        ? `最適化前 ${result.baselineLength.toLocaleString()}文字 → ${result.length.toLocaleString()}文字（${saved.toLocaleString()}文字削減・${(saved / result.baselineLength * 100).toFixed(1)}%）`
        : '最適化はオフです。チェックを入れると同じ色配置のまま短縮します。';
      if (result.fit.targetLength) {
        const fit = result.fit;
        $('fit-summary').textContent = `${fit.met ? '上限以内に収まりました' : '上限以内に収まりませんでした'}：${result.length.toLocaleString()} / ${fit.targetLength.toLocaleString()}文字。`
          + `${fit.requestedWidth} × ${fit.requestedHeight} → ${result.width} × ${result.height} px。`
          + `採用した減色：${result.usedOptions.colors || 'なし'}${result.usedOptions.colors ? '色' : ''}・${result.usedOptions.palette === 'row' ? '行ごと' : '画像全体'}。`;
      }
      const preview = $('processed'); preview.width = result.previewWidth; preview.height = result.previewHeight;
      preview.getContext('2d').putImageData(new ImageData(result.pixels, result.previewWidth, result.previewHeight), 0, 0);
      preview.hidden = false; $('empty-processed').hidden = true;
      renderPreview(result.text);
      $('copy').disabled = false;
      downloadUrl = URL.createObjectURL(new Blob([result.text], { type: 'text/plain;charset=utf-8' }));
      $('download').href = downloadUrl; $('download').download = `${sourceName}.txt`;
      $('download').setAttribute('aria-disabled', 'false'); $('download').tabIndex = 0;
      status(result.fit.met ? '変換できました。MFMをコピーしてお使いください。'
        : result.usedOptions.allowResize ? '指定の文字数以内には収まりませんでした。文字数の上限を増やしてください。'
          : '指定の文字数以内には収まりませんでした。上限を増やすか、サイズの縮小を許可してください。', result.fit.met ? 'success' : 'error');
    };
    worker.onerror = () => {
      if (id !== job) return;
      clearResult(); status('変換できませんでした。ページを再読み込みしてお試しください。', 'error');
    };
    // Send a separate bitmap so the original remains available for later conversions.
    const bitmap = await createImageBitmap(source);
    if (id !== job) { bitmap.close(); return; }
    worker.postMessage({ id, bitmap, options: o }, [bitmap]);
  } catch (error) {
    if (id !== job) return;
    clearResult(); status(error.message, 'error');
  }
});
$('cancel').addEventListener('click', () => { clearResult(); status('処理を中止しました。設定を変更して再変換できます。'); });

async function convertGif(id, o) {
  if (!gifBytes) throw new Error('GIFを読み込んでから全コマ変換を選んでください。');
  const measure = document.createElement('div'); measure.className = 'gif-render';
  measure.style.cssText = 'position:absolute;visibility:hidden;width:max-content;max-width:none;white-space:pre';
  const cell = document.createElement('span'); cell.textContent = o.cell; measure.append(cell); document.body.append(measure);
  const cellWidthEm = Math.ceil(cell.getBoundingClientRect().width * 64) / 64 / 16; measure.remove();
  const settings = { period: Number($('gif-period').value), gifTiming: $('gif-timing').checked, cellWidthEm };
  worker = new Worker(new URL('./gif-worker.js', import.meta.url), { type: 'module' });
  $('convert').disabled = true; $('convert').textContent = '全コマを変換中…'; $('cancel').hidden = false;
  status('GIFの全フレームをMFMに変換しています…');
  worker.onmessage = ({ data }) => {
    if (id !== job || data.id !== id) return;
    if (data.progress) { status(data.progress); return; }
    worker.terminate(); worker = null;
    $('convert').disabled = false; $('convert').textContent = 'MFMに変換 →'; $('cancel').hidden = true;
    if (data.error) { status(data.error, 'error'); return; }
    try { showGif(data); }
    catch (error) { clearResult(); status(error.message, 'error'); }
  };
  worker.onerror = () => { if (id === job) { clearResult(); status('GIFを変換できませんでした。', 'error'); } };
  const bytes = gifBytes.slice(0);
  worker.postMessage({ id, settings, options: o, bytes, name: sourceName }, [bytes]);
}

function replayGif() {
  if (!gifOutput) return;
  const root = $('mfm-preview'); root.classList.add('animated');
  if (gifOutput.text.length > 50000) {
    root.replaceChildren(Object.assign(document.createElement('span'), { className: 'placeholder', textContent: '大きいMFMの再生プレビューは省略しています。各コマの色と出力を確認できます。' }));
    $('gif-restart').hidden = true; return;
  }
  const view = document.createElement('div'); view.className = 'gif-render';
  view.style.width = `${gifOutput.widthEm * 16}px`; view.style.maxWidth = 'none';
  view.style.height = `${gifOutput.heightEm * 16 + 1}px`; view.append(renderSwitchMfm(gifOutput.text));
  root.replaceChildren(view);
  const box = view.firstElementChild?.firstElementChild?.getBoundingClientRect();
  $('gif-layout-warning').textContent = box && (Math.abs(box.width - gifOutput.widthEm * 16) > 1 || Math.abs(box.height - gifOutput.heightEm * 16) > 1)
    ? 'この表示環境ではコマの幅や高さが想定と異なります。サイズを小さくするか、公式のお試しコーナーで確認してください。' : '';
}

function showGif(data) {
  result = data.output; gifOutput = data.output;
  $('output').value = result.text;
  $('count').innerHTML = `${result.length.toLocaleString()} <small>文字</small>`;
  $('dimensions').textContent = `${data.width} × ${data.height} px · ${result.count}コマ`;
  $('savings').textContent = `全${result.count}コマを変換しました。入れ子${result.depth}段。`;
  if (result.usedOptions) {
    const fit = result.fit;
    $('savings').textContent += ` 最適化前 ${result.baselineLength.toLocaleString()}文字 → ${result.length.toLocaleString()}文字。`;
    $('fit-summary').textContent = `${fit.targetLength ? `${fit.met ? '上限以内に収まりました' : '上限以内に収まりませんでした'}：${result.length.toLocaleString()} / ${fit.targetLength.toLocaleString()}文字。` : ''}`
      + `${fit.requestedWidth} × ${fit.requestedHeight} → ${data.width} × ${data.height} px。採用した減色：${result.usedOptions.colors || 'なし'}${result.usedOptions.colors ? '色' : ''}・${result.usedOptions.palette === 'row' ? '行ごと' : '画像全体'}。色指定の入れ子上限：${result.usedOptions.depth}段（切り替え部分を除く）。`;
  }
  $('gif-summary').textContent = `${result.count}コマ・1周${Number(result.period.toFixed(6))}秒。切り替え時には短いワイプがあります。投稿上では下にコマ数分の余白が残ります。フォントや行高によって位置がずれる場合があります。`;
  const first = data.frames[0], preview = $('processed'); preview.width = first.previewWidth || first.width; preview.height = first.previewHeight || first.height;
  preview.getContext('2d').putImageData(new ImageData(first.pixels, preview.width, preview.height), 0, 0);
  preview.hidden = false; $('empty-processed').hidden = true;
  $('gif-frame-details').hidden = false; $('gif-frames').replaceChildren();
  data.frames.forEach((frame, index) => {
    const item = document.createElement('figure'), image = document.createElement('canvas'), caption = document.createElement('figcaption');
    image.width = frame.previewWidth || frame.width; image.height = frame.previewHeight || frame.height;
    image.getContext('2d').putImageData(new ImageData(frame.pixels, image.width, image.height), 0, 0);
    caption.textContent = `${index + 1}コマ目 · ${Number((result.durations[index] * 1000).toFixed(3))}ms · ${frame.length.toLocaleString()}文字`;
    const details = document.createElement('details'), summary = document.createElement('summary'), text = document.createElement('textarea');
    summary.textContent = 'このコマのMFM'; text.value = frame.text; text.readOnly = true; text.setAttribute('aria-label', `${index + 1}コマ目のMFM`);
    details.append(summary, text); item.append(image, caption, details); $('gif-frames').append(item);
  });
  const metadata = { gif: data.gif, period: result.period, layout: result.layout, combinedMfm: result.text, depth: result.depth, fit: result.fit, options: result.usedOptions,
    frames: data.frames.map((frame, index) => ({ name: frame.name, width: frame.width, height: frame.height,
      delayMs: result.durations[index] * 1000, text: frame.text, length: frame.length })) };
  gifFramesUrl = URL.createObjectURL(new Blob([JSON.stringify(metadata, null, 2)], { type: 'application/json' }));
  $('gif-export').href = gifFramesUrl; $('gif-export').download = `${sourceName}-frames.json`; $('gif-export').hidden = false;
  $('gif-restart').hidden = false; replayGif();
  $('copy').disabled = false;
  downloadUrl = URL.createObjectURL(new Blob([result.text], { type: 'text/plain;charset=utf-8' }));
  $('download').href = downloadUrl; $('download').download = `${sourceName}-animated.txt`;
  $('download').setAttribute('aria-disabled', 'false'); $('download').tabIndex = 0;
  status(result.fit && !result.fit.met ? '指定の文字数以内には収まりませんでした。上限を増やすか、サイズの縮小を許可してください。'
    : `GIFの全${result.count}コマを変換できました。MFMをコピーしてお使いください。`, result.fit && !result.fit.met ? 'error' : 'success');
}
$('gif-restart').addEventListener('click', replayGif);
window.addEventListener('resize', replayGif);
window.addEventListener('pagehide', () => { loadId++; emojiController?.abort(); clearSource(); });

// Only render syntax produced by this converter, using DOM nodes (never HTML).
function renderPreview(text) {
  const root = $('mfm-preview'), stack = [document.createDocumentFragment()];
  if (text.length > 50000) {
    root.replaceChildren(Object.assign(document.createElement('span'), { className: 'placeholder',
      textContent: '大きいMFMの表示イメージは省略しています。変換後の色は上の画像で確認できます。' }));
    return;
  }
  const tokens = text.split(/(\$\[(?:bg|fg)\.color=[0-9a-f]{3,6} |\$\[scale\.y=[\d.]+ |\])/g);
  for (const token of tokens) {
    const match = token.match(/^\$\[(bg|fg)\.color=([0-9a-f]{3,6}) $/);
    const scale = token.match(/^\$\[scale\.y=([\d.]+) $/);
    if (match || scale) {
      const span = document.createElement('span');
      if (match) span.style[match[1] === 'bg' ? 'backgroundColor' : 'color'] = `#${match[2]}`;
      else { span.className = 'scale'; span.style.transform = `scaleY(${scale[1]})`; }
      stack.at(-1).append(span); stack.push(span);
    } else if (token === ']') { if (stack.length > 1) stack.pop(); }
    else stack.at(-1).append(document.createTextNode(token));
  }
  root.replaceChildren(stack[0]);
}
$('copy').addEventListener('click', async () => {
  if (!result) return;
  try { await navigator.clipboard.writeText(result.text); status('MFMをコピーしました。', 'success'); }
  catch { $('output').focus(); $('output').select(); status('コピーできませんでした。選択された文字列を手動でコピーしてください。', 'error'); }
});
$('download').addEventListener('click', e => {
  if (!result) { e.preventDefault(); return; }
  status('テキストファイルの保存を開始しました。', 'success');
});
