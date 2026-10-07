import { options, resizeDimensions, processPixels, reduceRows, encodeRows } from './core.js';

export function minimumLength(width, height, input) {
  const o = options(input);
  return width * height * o.cell.length + height - 1 + `$[scale.y=${o.scale} ]`.length;
}

function colorCounts(start) {
  const values = [];
  let count = start || 64;
  while (count > 1) {
    count = count > 16 ? Math.max(16, Math.floor(count * 0.75)) : count - 1;
    values.push(count);
  }
  return values;
}

// Premultiplied color error: invisible RGB must not dominate quality selection.
function imageError(reference, pixels) {
  let sum = 0, index = 0;
  for (const row of reference) for (const p of row) {
    const a = p[3] / 255, b = pixels[index + 3] / 255;
    sum += (p[0] * a - pixels[index] * b) ** 2 * 0.2126
      + (p[1] * a - pixels[index + 1] * b) ** 2 * 0.7152
      + (p[2] * a - pixels[index + 2] * b) ** 2 * 0.0722
      + (p[3] - pixels[index + 3]) ** 2;
    index += 4;
  }
  return sum / (index / 4);
}

function smallerSize(initial, current) {
  // Always derive the ratio from the requested size, never from the prior image.
  const scale = Math.min(current.width / initial.width, current.height / initial.height) * 0.9;
  let width = Math.max(1, Math.round(initial.width * scale));
  let height = Math.max(1, Math.round(initial.height * scale));
  if (width === current.width && height === current.height) {
    if (width >= height && width > 1) {
      width--; height = Math.max(1, Math.round(initial.height * width / initial.width));
    } else if (height > 1) {
      height--; width = Math.max(1, Math.round(initial.width * height / initial.height));
    }
  }
  return { width, height };
}

/** getPixels must resample the original source at each requested size. */
export async function convertToBudget(sourceWidth, sourceHeight, input, { getPixels, onProgress = () => {} }) {
  const requested = options(input), initial = resizeDimensions(sourceWidth, sourceHeight, requested);
  const o = { ...requested, optimize: requested.targetLength ? true : requested.optimize };
  let size = initial, attempts = 0, skippedSizes = 0;
  const progress = async details => {
    onProgress({ ...size, attempts, skippedSizes, targetLength: o.targetLength, ...details });
    // Let progress messages reach the UI; cancellation terminates the worker.
    await new Promise(resolve => setTimeout(resolve, 0));
  };
  const finish = (result, usedOptions) => ({ ...result, usedOptions,
    fit: { targetLength: o.targetLength, met: !o.targetLength || result.length <= o.targetLength,
      requestedWidth: initial.width, requestedHeight: initial.height,
      resized: size.width !== initial.width || size.height !== initial.height, attempts, skippedSizes } });
  while (true) {
    // Even a completely transparent grid needs one character per pixel.
    // No need to allocate a huge canvas when this bound already proves failure.
    if (o.targetLength && o.allowResize && (size.width > 1 || size.height > 1)
      && minimumLength(size.width, size.height, o) > o.targetLength) {
      skippedSizes++;
      await progress({ stage: 'resize' });
      size = smallerSize(initial, size);
      continue;
    }
    await progress({ stage: 'prepare' });
    const data = await getPixels(size.width, size.height);
    const reference = processPixels(data, size.width, size.height, { ...o, colors: 0, similar: 0 });
    let closest = null, closestOptions = o, best = null, bestOptions = null, bestError = Infinity;
    const tried = new Set();
    const attempt = async candidateOptions => {
      const key = `${candidateOptions.colors}:${candidateOptions.palette}`;
      if (tried.has(key)) return null;
      tried.add(key); attempts++;
      await progress({ stage: 'palette', colors: candidateOptions.colors, palette: candidateOptions.palette });
      const rows = reduceRows(reference, candidateOptions);
      const result = encodeRows(rows, size.width, size.height, candidateOptions);
      if (!closest || result.length < closest.length) { closest = result; closestOptions = candidateOptions; }
      if (result.length <= o.targetLength) {
        const error = imageError(reference, result.pixels);
        if (error < bestError || (error === bestError && result.length < best.length)) {
          best = result; bestOptions = candidateOptions; bestError = error;
        }
      }
      return result;
    };
    const first = await attempt(o);
    // Respect an already-fitting user configuration; do not alter it gratuitously.
    if (!o.targetLength || first.length <= o.targetLength) return finish(first, o);
    const alternate = o.palette === 'row' ? 'global' : 'row';
    if (o.colors) await attempt({ ...o, palette: alternate });
    for (const colors of colorCounts(o.colors)) {
      for (const palette of [o.palette, alternate]) await attempt({ ...o, colors, palette });
    }
    if (best) return finish(best, bestOptions);
    if (!o.allowResize || (size.width === 1 && size.height === 1)) return finish(closest, closestOptions);
    await progress({ stage: 'resize' });
    size = smallerSize(initial, size);
  }
}
