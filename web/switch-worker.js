import { convert } from './core.js';
import { switchFrames, frameHeightEm } from './switch-mfm.js';
import { decodeGif } from './gif.js';

self.onmessage = async ({ data }) => {
  const post = (payload, transfer = []) => self.postMessage({ ...payload, id: data.id }, transfer);
  try {
    const { width, height, colors, period, gifTiming, scale = 1 } = data.settings;
    const canvas = new OffscreenCanvas(width, height), original = new OffscreenCanvas(1, 1);
    const context = canvas.getContext('2d', { willReadFrequently: true }), originalContext = original.getContext('2d');
    if (!context || !originalContext) throw new Error('このブラウザーでは画像を処理できません。');
    const inputs = []; let gif = null;
    for (const source of data.frames) {
      if (source.bytes) {
        post({ progress: 'GIFのフレームを展開しています…' });
        const decoded = decodeGif(source.bytes);
        if (data.frames.length === 1) {
          gif = { width: decoded.width, height: decoded.height, count: decoded.frames.length, duration: decoded.duration, loops: decoded.loops };
          // Independently compare this small GIF to the browser's native decoder.
          if (typeof ImageDecoder !== 'undefined' && decoded.width * decoded.height * decoded.frames.length <= 1000000) {
            let native;
            try {
              native = new ImageDecoder({ data: source.bytes.slice(0), type: 'image/gif' });
              await native.tracks.ready; await native.completed;
              const checkCanvas = new OffscreenCanvas(decoded.width, decoded.height), checkContext = checkCanvas.getContext('2d');
              let differences = 0;
              for (let i = 0; i < decoded.frames.length; i++) {
                const { image } = await native.decode({ frameIndex: i, completeFramesOnly: true });
                try {
                  checkContext.clearRect(0, 0, decoded.width, decoded.height); checkContext.drawImage(image, 0, 0);
                  const actual = checkContext.getImageData(0, 0, decoded.width, decoded.height).data, expected = decoded.frames[i].pixels;
                  for (let p = 0; p < actual.length; p += 4) {
                    if (actual[p + 3] !== expected[p + 3] || actual[p + 3] && (actual[p] !== expected[p] || actual[p + 1] !== expected[p + 1] || actual[p + 2] !== expected[p + 2])) differences++;
                  }
                } finally { image.close(); }
              }
              gif.verification = `ブラウザーのGIFデコーダーと比較：${differences}画素の差異`;
              if (differences) throw new Error(`GIFの展開結果がブラウザーと異なります（${differences}画素）。`);
            } catch (error) {
              if (error.message.startsWith('GIFの展開結果')) throw error;
              gif.verification = 'ブラウザーのGIFデコーダーとの比較は利用できませんでした。';
            } finally { native?.close(); }
          } else gif.verification = 'ブラウザーのGIFデコーダーとの比較は利用できません。';
        }
        decoded.frames.forEach((frame, i) => inputs.push({ ...frame, width: decoded.width, height: decoded.height, name: `${source.name} #${i + 1}` }));
      } else inputs.push(source);
    }
    if (inputs.length < 2) throw new Error('再生するコマは2個以上にしてください。');
    const frames = [];
    for (let i = 0; i < inputs.length; i++) {
      const source = inputs[i]; let image = source.bitmap;
      if (source.pixels) { original.width = source.width; original.height = source.height;
        originalContext.putImageData(new ImageData(source.pixels, source.width, source.height), 0, 0); image = original; }
      context.clearRect(0, 0, width, height);
      const ratio = Math.min(width / image.width, height / image.height);
      const w = image.width * ratio, h = image.height * ratio;
      context.imageSmoothingEnabled = true; context.imageSmoothingQuality = 'high';
      context.drawImage(image, (width - w) / 2, (height - h) / 2, w, h);
      // Do not keep color spans open across line breaks: MkMfm makes them
      // inline-blocks, so multiline color reuse changes a frame's geometry.
      const result = convert(context.getImageData(0, 0, width, height).data, width, height, {
        colors, colorType: 'rgb3', background: '#ffffff', backgroundAlpha: 255,
        scale, cell: '　', depth: 4, palette: 'global', optimize: false,
      });
      frames.push({ ...result, name: source.name, delay: source.delay });
      post({ progress: `画像を変換しています… ${i + 1} / ${inputs.length}` });
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    const output = switchFrames(frames.map(frame => `$[border.width=0 ${frame.text}]`), {
      period: gif && gifTiming ? gif.duration / 1000 : period,
      durations: gif && gifTiming ? inputs.map(frame => frame.delay) : null,
      widthEm: width, heightEm: frameHeightEm(height),
    });
    post({ output, frames: frames.map(frame => ({
      text: frame.text, length: frame.length, pixels: frame.pixels, name: frame.name,
      width, height, delay: frame.delay,
    })), width, height, gif }, frames.map(frame => frame.pixels.buffer));
  } catch (error) { post({ error: error.message }); }
  finally { data.frames.forEach(frame => frame.bitmap?.close()); }
};
