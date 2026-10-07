import { convertToBudget } from './fit.js';
self.onmessage = async ({ data }) => {
  try {
    const canvas = new OffscreenCanvas(1, 1);
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('このブラウザーでは画像を処理できません。');
    const result = await convertToBudget(data.bitmap.width, data.bitmap.height, data.options, {
      getPixels(width, height) {
        try {
          canvas.width = width; canvas.height = height;
          if (canvas.width !== width || canvas.height !== height) throw new Error('Canvas size');
          context.imageSmoothingEnabled = true; context.imageSmoothingQuality = 'high';
          context.drawImage(data.bitmap, 0, 0, width, height);
          return context.getImageData(0, 0, width, height).data;
        } catch {
          throw new Error('この画像サイズはブラウザーで処理できません。サイズを小さくするか、文字数上限を指定してください。');
        }
      },
      onProgress(progress) { self.postMessage({ id: data.id, progress }); },
    });
    // Bound only the displayed preview, never the actual output dimensions.
    const ratio = Math.min(1, 512 / Math.max(result.width, result.height));
    const previewWidth = Math.max(1, Math.round(result.width * ratio));
    const previewHeight = Math.max(1, Math.round(result.height * ratio));
    if (ratio < 1) {
      const pixels = new Uint8ClampedArray(previewWidth * previewHeight * 4);
      for (let y = 0; y < previewHeight; y++) for (let x = 0; x < previewWidth; x++) {
        const sx = Math.min(result.width - 1, Math.floor((x + 0.5) * result.width / previewWidth));
        const sy = Math.min(result.height - 1, Math.floor((y + 0.5) * result.height / previewHeight));
        const sourceIndex = (sy * result.width + sx) * 4, destIndex = (y * previewWidth + x) * 4;
        for (let c = 0; c < 4; c++) pixels[destIndex + c] = result.pixels[sourceIndex + c];
      }
      result.pixels = pixels;
    }
    result.previewWidth = previewWidth; result.previewHeight = previewHeight;
    self.postMessage({ id: data.id, result }, [result.pixels.buffer]);
  } catch (error) {
    self.postMessage({ id: data.id, error: error.message });
  } finally {
    data.bitmap.close();
  }
};
