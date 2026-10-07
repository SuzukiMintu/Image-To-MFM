import { decodeGif } from './gif.js';
import { convertAnimationToBudget } from './animated-fit.js';

self.onmessage = async ({ data }) => {
  const post = payload => self.postMessage({ ...payload, id: data.id });
  try {
    post({ progress: 'GIFのフレームを展開しています…' });
    const decoded = decodeGif(data.bytes);
    const canvas = new OffscreenCanvas(1, 1), original = new OffscreenCanvas(decoded.width, decoded.height);
    const context = canvas.getContext('2d', { willReadFrequently: true }), originalContext = original.getContext('2d');
    if (!context || !originalContext) throw new Error('このブラウザーでは画像を処理できません。');
    const output = await convertAnimationToBudget(decoded.width, decoded.height, decoded.frames.length, data.options, {
      period: data.settings.gifTiming ? decoded.duration / 1000 : data.settings.period,
      durations: data.settings.gifTiming ? decoded.frames.map(frame => frame.delay) : null,
      cellWidthEm: data.settings.cellWidthEm,
    }, {
      getPixels(index, width, height) {
        try {
          originalContext.putImageData(new ImageData(decoded.frames[index].pixels, decoded.width, decoded.height), 0, 0);
          canvas.width = width; canvas.height = height;
          if (canvas.width !== width || canvas.height !== height) throw new Error('Canvas size');
          context.imageSmoothingEnabled = true; context.imageSmoothingQuality = 'high';
          context.drawImage(original, 0, 0, width, height);
          return context.getImageData(0, 0, width, height).data;
        } catch { throw new Error('この画像サイズはブラウザーで処理できません。サイズを小さくするか、文字数上限を指定してください。'); }
      },
      onProgress(p) { post({ progress: `${p.width} × ${p.height} px · ${p.stage.startsWith('frame:') ? `${p.stage.split(':')[1]} / ${decoded.frames.length}コマ` : p.stage === 'resize' ? '全コマを同じサイズに縮小しています' : p.stage === 'prepare' ? '画像を準備しています' : '全コマの減色候補を比較しています'} · ${p.attempts}候補` }); },
    });
    const frames = output.frames; delete output.frames;
    frames.forEach((frame, i) => {
      delete frame.baselineText;
      frame.name = `${data.name} #${i + 1}`;
      const ratio = Math.min(1, 512 / Math.max(frame.width, frame.height));
      frame.previewWidth = Math.max(1, Math.round(frame.width * ratio)); frame.previewHeight = Math.max(1, Math.round(frame.height * ratio));
      if (ratio < 1) {
        const pixels = new Uint8ClampedArray(frame.previewWidth * frame.previewHeight * 4);
        for (let y = 0; y < frame.previewHeight; y++) for (let x = 0; x < frame.previewWidth; x++) {
          const sx = Math.min(frame.width - 1, Math.floor((x + .5) * frame.width / frame.previewWidth));
          const sy = Math.min(frame.height - 1, Math.floor((y + .5) * frame.height / frame.previewHeight));
          pixels.set(frame.pixels.subarray((sy * frame.width + sx) * 4, (sy * frame.width + sx) * 4 + 4), (y * frame.previewWidth + x) * 4);
        }
        frame.pixels = pixels;
      }
    });
    self.postMessage({ id: data.id, output, frames, width: output.width, height: output.height,
      gif: { width: decoded.width, height: decoded.height, count: decoded.frames.length, duration: decoded.duration, loops: decoded.loops } }, frames.map(frame => frame.pixels.buffer));
  } catch (error) { post({ error: error instanceof RangeError ? '処理に必要な容量を確保できませんでした。サイズ・色数を減らしてお試しください。' : error.message }); }
};
