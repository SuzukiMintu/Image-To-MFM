// Browser-independent image processing. Every conversion owns its state.
export const defaults = Object.freeze({
  width: 30, height: 0, smooth: 0, division: 1, colors: 5,
  similar: 0, colorType: 'rgba4', background: '#ffffff', backgroundAlpha: 0,
  scale: 0.7, cell: '　', depth: 19, mode: 'bg', palette: 'row', optimize: true,
  targetLength: 0, allowResize: true, rowLocal: false,
});

export function options(input = {}) {
  const o = { ...defaults, ...input };
  for (const [key, min, max, integer] of [
    ['width', 0, Number.MAX_SAFE_INTEGER, true], ['height', 0, Number.MAX_SAFE_INTEGER, true], ['smooth', 0, 5, true],
    ['targetLength', 0, Number.MAX_SAFE_INTEGER, true],
    ['division', 1, 255, false], ['colors', 0, Number.MAX_SAFE_INTEGER, true], ['similar', 0, 255, true],
    ['backgroundAlpha', 0, 255, true], ['scale', 0.01, 5, false], ['depth', 1, 19, true],
  ]) {
    const value = Number(o[key]);
    if (!Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) {
      throw new Error(`設定値が範囲外です: ${key}`);
    }
    o[key] = value;
  }
  if (!['rgb6', 'rgb3', 'rgba4'].includes(o.colorType) || !['bg', 'fg'].includes(o.mode)
    || !['row', 'global'].includes(o.palette) || !['　', ' ', '█', '月'].includes(o.cell)
    || !/^#[\da-f]{6}$/i.test(o.background) || typeof o.optimize !== 'boolean' || typeof o.allowResize !== 'boolean' || typeof o.rowLocal !== 'boolean') {
    throw new Error('設定が正しくありません。');
  }
  return o;
}

export function resizeDimensions(sourceWidth, sourceHeight, input) {
  const o = options(input);
  let width = o.width, height = o.height;
  if (!width && !height) [width, height] = [sourceWidth, sourceHeight];
  else if (!width) width = Math.max(1, Math.floor(sourceWidth / sourceHeight * height));
  else if (!height) height = Math.max(1, Math.floor(sourceHeight / sourceWidth * width));
  validateDimensions(width, height);
  return { width, height };
}

export function validateDimensions(width, height) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1
    || !Number.isSafeInteger(width * height * 4)) throw new Error('画像サイズには正しい整数を指定してください。');
}

function distance(a, b) {
  // RGB clustering with alpha weighting; keep the original alpha separately.
  return (a[0] - b[0]) ** 2 * 0.2126 + (a[1] - b[1]) ** 2 * 0.7152 + (a[2] - b[2]) ** 2 * 0.0722;
}

export function reducePalette(pixels, count) {
  if (!count) return pixels.map(p => [...p]);
  const visible = pixels.filter(p => p[3] > 0);
  const unique = [...new Map(visible.map(p => [p.slice(0, 3).join(','), p])).values()];
  if (unique.length <= count) return pixels.map(p => [...p]);
  // Deterministic farthest-point seeding, followed by weighted K-means.
  const centers = [unique[0].slice(0, 3)];
  const nearestDistances = unique.map(() => Infinity);
  while (centers.length < count) {
    let best = unique[0], bestDistance = -1;
    for (let i = 0; i < unique.length; i++) {
      const p = unique[i];
      nearestDistances[i] = Math.min(nearestDistances[i], distance(p, centers.at(-1)));
      const d = nearestDistances[i] * p[3] / 255;
      if (d > bestDistance) [best, bestDistance] = [p, d];
    }
    centers.push(best.slice(0, 3));
  }
  const nearest = p => {
    let index = 0, best = Infinity;
    centers.forEach((c, i) => { const d = distance(p, c); if (d < best) [index, best] = [i, d]; });
    return index;
  };
  for (let iteration = 0; iteration < 16; iteration++) {
    const sums = centers.map(() => [0, 0, 0, 0]);
    for (const p of visible) {
      const sum = sums[nearest(p)], weight = p[3] / 255;
      for (let c = 0; c < 3; c++) sum[c] += p[c] * weight;
      sum[3] += weight;
    }
    let moved = false;
    sums.forEach((sum, i) => {
      if (!sum[3]) return;
      const next = sum.slice(0, 3).map(c => Math.round(c / sum[3]));
      if (distance(next, centers[i]) > 0) moved = true;
      centers[i] = next;
    });
    if (!moved) break;
  }
  return pixels.map(p => p[3] ? [...centers[nearest(p)], p[3]] : [0, 0, 0, 0]);
}

export function processPixels(data, width, height, input) {
  const o = options(input);
  validateDimensions(width, height);
  if (data.length !== width * height * 4) {
    throw new Error('画像のサイズが正しくありません。');
  }
  const bg = o.background.slice(1).match(/../g).map(c => parseInt(c, 16));
  // Match Python's RGB modes by compositing onto an opaque background.
  const ba = o.colorType === 'rgba4' ? o.backgroundAlpha / 255 : 1;
  let rows = Array.from({ length: height }, (_, y) => Array.from({ length: width }, (_, x) => {
    const p = Array.from(data.slice((y * width + x) * 4, (y * width + x + 1) * 4));
    const a = p[3] / 255, outA = a + ba * (1 - a);
    return outA ? [...bg.map((c, i) => Math.round((p[i] * a + c * ba * (1 - a)) / outA)), Math.round(outA * 255)] : [0, 0, 0, 0];
  }));
  for (let repeat = 0; repeat < o.smooth; repeat++) {
    rows = rows.map(row => row.map((p, x) => {
      if (!p[3]) return [...p];
      const neighbors = row.slice(Math.max(0, x - 1), x + 2).filter(q => q[3]);
      return p.map((_, c) => Math.floor(neighbors.reduce((sum, q) => sum + q[c], 0) / neighbors.length));
    }));
  }
  if (o.division > 1) rows = rows.map(row => row.map(p => p[3] ? [
    ...p.slice(0, 3).map(c => Math.min(255, Math.floor(Math.floor(c / o.division) * o.division) + Math.floor(o.division / 2))), p[3],
  ] : p));
  return reduceRows(rows, o);
}

// Separate preprocessing from palette search so each trial starts from the same image.
export function reduceRows(inputRows, input) {
  const o = options(input);
  let rows = inputRows;
  const width = rows[0].length;
  if (o.colors) {
    if (o.palette === 'global') {
      const reduced = reducePalette(rows.flat(), o.colors);
      rows = rows.map((_, y) => reduced.slice(y * width, (y + 1) * width));
    } else rows = rows.map(row => reducePalette(row, o.colors));
  }
  if (o.similar) rows = rows.map(row => {
    const groups = [];
    row.forEach((p, x) => {
      if (!p[3]) return;
      let group = groups.find(g => p.every((c, i) => Math.abs(c - g.first[i]) <= o.similar));
      if (!group) { group = { first: p, entries: [] }; groups.push(group); }
      group.entries.push(x);
    });
    const result = row.map(p => [...p]);
    for (const g of groups) {
      const mean = g.first.map((_, c) => Math.floor(g.entries.reduce((s, x) => s + row[x][c], 0) / g.entries.length));
      g.entries.forEach(x => { result[x] = [...mean]; });
    }
    return result;
  });
  return rows;
}

export function colorCode(pixel, type, nearest = true) {
  if (type === 'rgb6') return pixel.slice(0, 3).map(c => c.toString(16).padStart(2, '0')).join('');
  const nibbles = pixel.slice(0, type === 'rgba4' ? 4 : 3)
    .map(c => (nearest ? Math.round(c / 17) : Math.floor(c / 16)).toString(16));
  if (nibbles.length === 4 && nibbles[3] === 'f') nibbles.pop();
  return nibbles.join('');
}

export function decodeColor(code) {
  const expanded = code.length <= 4 ? [...code].map(c => c + c).join('') : code;
  const color = expanded.match(/../g).map(c => parseInt(c, 16));
  return color.length === 3 ? [...color, 255] : color;
}

export function prepareColors(rows, input) {
  const o = options(input);
  return rows.map(row => row.map(pixel => {
    const code = colorCode(pixel, o.colorType);
    const rgba = decodeColor(code);
    // Very low alpha can round to zero in RGBA4; invisible RGB has no color tag.
    return rgba[3] ? { code, rgba } : { code: '0000', rgba: [0, 0, 0, 0] };
  }));
}

// A row-local stack encoder, matching the original opaque-color reuse strategy.
export function generateBaseline(colors, input) {
  const o = options(input);
  const lines = colors.map(row => {
    let stack = [], text = '';
    for (const { code, rgba } of row) {
      if (rgba[3] < 255) {
        text += ']'.repeat(stack.length); stack = [];
        text += rgba[3] || o.mode === 'fg' ? `$[${o.mode}.color=${code} ${o.cell}]` : o.cell;
        continue;
      }
      const at = stack.indexOf(code);
      if (at >= 0) { text += ']'.repeat(stack.length - at - 1); stack = stack.slice(0, at + 1); }
      else {
        if (stack.length >= o.depth) { text += ']'.repeat(stack.length); stack = []; }
        text += `$[${o.mode}.color=${code} `; stack.push(code);
      }
      text += o.cell;
    }
    return text + ']'.repeat(stack.length);
  });
  return `$[scale.y=${o.scale} ${lines.join('\n')}]`;
}

export function convert(data, width, height, input) {
  const o = options(input), rows = processPixels(data, width, height, o);
  return encodeRows(rows, width, height, o);
}

export function encodeRows(rows, width, height, input) {
  const o = options(input);
  const colors = prepareColors(rows, o);
  const baseline = generateBaseline(colors, o);
  const candidate = o.optimize ? generateOptimized(colors, o) : baseline;
  const text = candidate.length <= baseline.length ? candidate : baseline;
  const pixels = new Uint8ClampedArray(width * height * 4);
  let index = 0;
  for (const row of colors) for (const color of row) { pixels.set(color.rgba, index); index += 4; }
  // Every supported cell is one BMP character; syntax is ASCII.
  return { text, baselineLength: baseline.length, length: text.length,
    width, height, pixels, ...(o.rowLocal ? { baselineText: baseline } : {}) };
}

function shortestCode(color) {
  if (color.code.length === 6 && color.rgba.slice(0, 3).every(c => c % 17 === 0)) {
    return color.rgba.slice(0, 3).map(c => (c / 17).toString(16)).join('');
  }
  return color.code;
}

// A row encoder never leaves an overlay open across a newline. An optional
// opaque base belongs to a full-width band, and cannot be popped mid-row.
function encodeLine(runs, o, base = null) {
  const limit = o.depth - (base === null ? 0 : 1);
  let states = [{ stack: [], cost: 0, text: '' }];
  const append = (state, chunk, stack = state.stack) => ({
    stack, cost: state.cost + chunk.length, text: state.text + chunk,
  });
  const retain = candidates => {
    const unique = new Map();
    for (const candidate of candidates) {
      const key = candidate.stack.join(',');
      if (!unique.has(key) || unique.get(key).cost > candidate.cost) unique.set(key, candidate);
    }
    return [...unique.values()].sort((a, b) => (a.cost + a.stack.length) - (b.cost + b.stack.length)).slice(0, 16);
  };
  for (const run of runs) {
    const cells = o.cell.repeat(run.count), candidates = [];
    for (const state of states) {
      if (run.alpha < 255) {
        // A base would show through a transparent background or blend alpha.
        if (base !== null) return null;
        const chunk = ']'.repeat(state.stack.length)
          + (run.alpha || o.mode === 'fg' ? `$[${o.mode}.color=${run.code} ${cells}]` : cells);
        candidates.push(append(state, chunk, []));
        continue;
      }
      if (run.code === base) {
        candidates.push(append(state, ']'.repeat(state.stack.length) + cells, []));
        continue;
      }
      const at = state.stack.indexOf(run.code);
      if (at >= 0) {
        candidates.push(append(state, ']'.repeat(state.stack.length - at - 1) + cells, state.stack.slice(0, at + 1)));
      }
      for (let keep = 0; keep <= Math.min(state.stack.length, limit - 1); keep++) {
        if (state.stack.slice(0, keep).includes(run.code)) continue;
        const chunk = ']'.repeat(state.stack.length - keep) + `$[${o.mode}.color=${run.code} ` + cells;
        candidates.push(append(state, chunk, [...state.stack.slice(0, keep), run.code]));
      }
    }
    states = retain(candidates);
    if (!states.length) return null;
  }
  const best = states.sort((a, b) => (a.cost + a.stack.length) - (b.cost + b.stack.length))[0];
  return best.text + ']'.repeat(best.stack.length);
}

// Compare actual encoded lengths. At most eight frequently occurring run colors
// are band candidates; this bounds work for images with unrestricted palettes.
// Every band starts at column zero and closes at a row end. Its overlays are
// row-local, and rows with any transparency cannot belong to an opaque band.
export function generateOptimized(colors, input) {
  const o = options(input), frequencies = new Map();
  const rows = colors.map(row => {
    const runs = [];
    for (const color of row) {
      const code = shortestCode(color), last = runs.at(-1);
      if (last && last.code === code) last.count++;
      else {
        runs.push({ code, alpha: color.rgba[3], count: 1 });
        if (color.rgba[3] === 255) frequencies.set(code, (frequencies.get(code) || 0) + 1);
      }
    }
    return runs;
  });
  const bases = o.rowLocal ? [] : [...frequencies].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([code]) => code);
  let states = [{ base: null, cost: 0, node: null }];
  rows.forEach((runs, y) => {
    const candidates = [null, ...(runs.every(run => run.alpha === 255) ? bases : [])];
    const next = [];
    for (const base of candidates) {
      const line = encodeLine(runs, o, base);
      if (line === null) continue;
      let best = null;
      for (const previous of states) {
        // Close a previous band BEFORE the newline, and open the next AFTER it.
        const changed = previous.base !== base;
        const chunk = (changed && previous.base !== null ? ']' : '')
          + (y ? '\n' : '')
          + (changed && base !== null ? `$[${o.mode}.color=${base} ` : '') + line;
        const cost = previous.cost + chunk.length;
        if (!best || cost < best.cost) best = { base, cost, node: { previous: previous.node, chunk } };
      }
      next.push(best);
    }
    states = next;
  });
  const best = states.sort((a, b) => (a.cost + (a.base !== null ? 1 : 0)) - (b.cost + (b.base !== null ? 1 : 0)))[0];
  const chunks = [best.base !== null ? ']' : ''];
  for (let node = best.node; node; node = node.previous) chunks.push(node.chunk);
  return `$[scale.y=${o.scale} ${chunks.reverse().join('')}]`;
}
