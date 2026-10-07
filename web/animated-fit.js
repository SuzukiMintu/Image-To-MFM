import { options, resizeDimensions, processPixels, reduceRows, encodeRows } from './core.js';
import { colorCounts, imageError, smallerSize, minimumLength } from './fit.js';
import { switchFrames, frameHeightEm } from './switch-mfm.js';

export function frameOptions(input) {
  // The shutter adds thirteen levels outside each frame's scale/color stack.
  // All color options remain available; keep color spans within one line.
  const requested = options(input);
  return { ...requested, depth: Math.min(requested.depth, 5), rowLocal: true,
    optimize: requested.targetLength ? true : requested.optimize };
}

export async function convertAnimationToBudget(sourceWidth, sourceHeight, count, input, timing, { getPixels, onProgress = () => {} }) {
  if (!Number.isSafeInteger(count) || count < 2) throw new Error('GIFの全コマ変換には2コマ以上が必要です。');
  const requested = options(input), o = frameOptions(requested);
  const initial = resizeDimensions(sourceWidth, sourceHeight, o);
  let size = initial, attempts = 0, skippedSizes = 0;
  const progress = async stage => { onProgress({ ...size, attempts, skippedSizes, stage }); await new Promise(resolve => setTimeout(resolve, 0)); };
  const finish = (result, usedOptions) => ({ ...result, usedOptions,
    fit: { targetLength: o.targetLength, met: !o.targetLength || result.length <= o.targetLength,
      requestedWidth: initial.width, requestedHeight: initial.height, resized: size.width !== initial.width || size.height !== initial.height,
      attempts, skippedSizes, requestedDepth: requested.depth } });
  while (true) {
    if (o.targetLength && o.allowResize && (size.width > 1 || size.height > 1)
      && count * minimumLength(size.width, size.height, o) > o.targetLength) {
      skippedSizes++; await progress('resize'); size = smallerSize(initial, size); continue;
    }
    await progress('prepare');
    const reference = [];
    for (let i = 0; i < count; i++) {
      reference.push(processPixels(await getPixels(i, size.width, size.height), size.width, size.height, { ...o, colors: 0, similar: 0 }));
    }
    let closest = null, closestOptions = o, best = null, bestOptions = o, bestError = Infinity;
    const tried = new Set();
    const attempt = async candidate => {
      const key = `${candidate.colors}:${candidate.palette}`; if (tried.has(key)) return null;
      tried.add(key); attempts++; await progress('palette');
      const frames = [];
      for (let i = 0; i < count; i++) {
        frames.push(encodeRows(reduceRows(reference[i], candidate), size.width, size.height, candidate));
        await progress(`frame:${i + 1}:${count}`);
      }
      const switched = switchFrames(frames.map(frame => `$[border.width=0 ${frame.text}]`), {
        ...timing, gateFirst: true, widthEm: size.width * (timing.cellWidthEm || 1), heightEm: frameHeightEm(size.height),
      });
      const result = { ...switched, frames, width: size.width, height: size.height,
        baselineLength: switchFrames(frames.map(frame => `$[border.width=0 ${frame.baselineText}]`), {
          ...timing, gateFirst: true, widthEm: size.width * (timing.cellWidthEm || 1), heightEm: frameHeightEm(size.height),
        }).length };
      if (!closest || result.length < closest.length) { closest = result; closestOptions = candidate; }
      if (result.length <= o.targetLength) {
        const error = frames.reduce((sum, frame, i) => sum + imageError(reference[i], frame.pixels), 0) / count;
        if (error < bestError || error === bestError && result.length < best.length) { best = result; bestOptions = candidate; bestError = error; }
      }
      return result;
    };
    const first = await attempt(o);
    if (!o.targetLength || first.length <= o.targetLength) return finish(first, o);
    const alternate = o.palette === 'row' ? 'global' : 'row';
    if (o.colors) await attempt({ ...o, palette: alternate });
    for (const colors of colorCounts(o.colors)) for (const palette of [o.palette, alternate]) await attempt({ ...o, colors, palette });
    if (best) return finish(best, bestOptions);
    if (!o.allowResize || size.width === 1 && size.height === 1) return finish(closest, closestOptions);
    await progress('resize'); size = smallerSize(initial, size);
  }
}
