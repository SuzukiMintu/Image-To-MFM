import test from 'node:test';
import assert from 'node:assert/strict';
import { convert, options, resizeDimensions, reducePalette, decodeColor, colorCode } from '../web/core.js';

test('resize preserves aspect ratio without the former pixel or side limits', () => {
  assert.deepEqual(resizeDimensions(100, 50, { width: 30, height: 0 }), { width: 30, height: 15 });
  assert.deepEqual(resizeDimensions(4, 3, { width: 0, height: 0 }), { width: 4, height: 3 });
  assert.deepEqual(resizeDimensions(2000, 2000, { width: 0, height: 0 }), { width: 2000, height: 2000 });
  assert.deepEqual(resizeDimensions(1000, 500, { width: 600 }), { width: 600, height: 300 });
  assert.throws(() => options({ width: Infinity }));
  assert.throws(() => options({ width: 1.5 }));
  assert.throws(() => options({ depth: 20 }));
});
test('independent conversions do not leak old text', () => {
  const o = { colors: 0, colorType: 'rgb6', optimize: false };
  const a = convert(new Uint8ClampedArray([255, 0, 0, 255]), 1, 1, o);
  const b = convert(new Uint8ClampedArray([0, 0, 255, 255]), 1, 1, o);
  assert.equal(a.text, '$[scale.y=0.7 $[bg.color=ff0000 　]]');
  assert.equal(b.text, '$[scale.y=0.7 $[bg.color=0000ff 　]]');
});

// Independent renderer model: verify colors at every cell and actual nesting depth.
function decodeMfm(text) {
  const stack = [], rows = [[]]; let maxDepth = 0;
  const tokens = text.match(/\$\[(?:bg|fg)\.color=[\da-f]+ |\$\[scale\.y=[\d.]+ |\]|\n|[^\]\n$]+/g);
  for (const token of tokens) {
    const color = token.match(/^\$\[(?:bg|fg)\.color=([\da-f]+) $/);
    if (color || token.startsWith('$[scale.')) {
      stack.push(color ? decodeColor(color[1]) : null); maxDepth = Math.max(maxDepth, stack.length);
    } else if (token === ']') assert.ok(stack.pop() !== undefined, 'balanced closing bracket');
    else if (token === '\n') rows.push([]);
    else {
      const layers = stack.filter(Boolean);
      const visible = layers.at(-1) || [0, 0, 0, 0];
      if (visible[3] < 255) assert.ok(layers.length <= 1 && (!visible[3] || layers.length === 1), 'no alpha blending against outer color');
      for (const char of token) rows.at(-1).push(visible);
    }
  }
  assert.equal(stack.length, 0);
  return { rows, maxDepth };
}

// Check geometry-relevant AST boundaries independently of the encoder: only
// full-width opaque base spans may cross a newline, including nested spans.
function assertSafeLayout(text, width) {
  let row = 0, column = 0;
  const stack = [], bands = [];
  for (const token of text.match(/\$\[[^ ]+ |\]|\n|[^\]\n$]+/g)) {
    if (token.startsWith('$[')) stack.push({ color: /\.color=/.test(token), row, column });
    else if (token === ']') {
      const span = stack.pop();
      assert.ok(span);
      if (span.color && span.row !== row) {
        assert.equal(span.column, 0, 'cross-row color starts at row head');
        assert.equal(column, width, 'cross-row color ends at row end');
        bands.push(span);
      }
    } else if (token === '\n') {
      assert.equal(column, width); row++; column = 0;
    } else column += [...token].length;
  }
  assert.equal(column, width); assert.equal(stack.length, 0);
  return bands;
}
test('short RGB uses nearest representable value', () => {
  assert.equal(colorCode([31, 31, 31, 255], 'rgb3'), '222');
});
test('alpha values near nibble boundaries remain consistent with the MFM', () => {
  const data = new Uint8ClampedArray([0,1,7,8,9,127,247,248,254,255].flatMap(a => [20,60,90,a]));
  for (const optimize of [false, true]) {
    const result = convert(data, 10, 1, { colors: 0, optimize });
    assert.deepEqual(decodeMfm(result.text).rows.flat().flat(), [...result.pixels]);
  }
});
test('optimization shortens repeated rows without changing colors', () => {
  const data = new Uint8ClampedArray(Array.from({ length: 20 }, () => [255, 0, 0, 255]).flat());
  const result = convert(data, 5, 4, { colors: 0, colorType: 'rgb6' });
  assert.ok(result.length < result.baselineLength);
  assert.deepEqual(decodeMfm(result.text).rows.flat().flat(), [...result.pixels]);
});
test('random images preserve pixels, dimensions and depth through optimization', () => {
  let seed = 12345;
  const random = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; };
  const palette = [[255,0,0,255],[0,255,0,255],[0,0,255,255],[20,60,90,128],[0,0,0,0],[110,20,50,255]];
  for (const mode of ['bg', 'fg']) for (const colorType of ['rgb6', 'rgb3', 'rgba4']) for (const depth of [1,2,19]) {
    for (let trial = 0; trial < 12; trial++) {
      const data = new Uint8ClampedArray(Array.from({ length: 48 }, () => palette[Math.floor(random()*palette.length)]).flat());
      const result = convert(data, 8, 6, { colors: 0, mode, colorType, depth });
      const decoded = decodeMfm(result.text);
      assertSafeLayout(result.text, result.width);
      assert.ok(result.length <= result.baselineLength);
      assert.ok(decoded.maxDepth <= depth + 1);
      assert.equal(decoded.rows.length, 6);
      assert.ok(decoded.rows.every(row => row.length === 8));
      assert.deepEqual(decoded.rows.flat().flat(), [...result.pixels]);
    }
  }
});

test('opaque bands shorten repeated full rows with row-local overlays', () => {
  const data = new Uint8ClampedArray(Array.from({ length: 64 }, (_, i) =>
    i % 8 === 3 ? [0,0,255,255] : [255,0,0,255]).flat());
  for (const mode of ['bg', 'fg']) for (const cell of ['　', ' ', '█', '月']) {
    const input = { colors: 0, colorType: 'rgb6', mode, cell };
    const result = convert(data, 8, 8, input);
    const local = convert(data, 8, 8, { ...input, rowLocal: true });
    assert.ok(result.length < local.length);
    assert.ok(assertSafeLayout(result.text, 8).length > 0);
    assert.equal(assertSafeLayout(local.text, 8).length, 0);
    assert.deepEqual(decodeMfm(result.text).rows.flat().flat(), [...result.pixels]);
  }
});

test('band selection adapts to row groups and excludes transparent rows', () => {
  const data = new Uint8ClampedArray(Array.from({ length: 48 }, (_, i) => {
    const y = Math.floor(i / 8);
    return y === 3 ? [80,60,40,i % 2 ? 128 : 0]
      : y < 3 ? [255,0,0,255] : [0,255,0,255];
  }).flat());
  for (const depth of [1, 2, 19]) for (const mode of ['bg', 'fg']) {
    const result = convert(data, 8, 6, { colors: 0, depth, mode });
    const bands = assertSafeLayout(result.text, 8);
    assert.equal(bands.length, 2);
    const decoded = decodeMfm(result.text);
    assert.deepEqual(decoded.rows.flat().flat(), [...result.pixels]);
    assert.ok(decoded.maxDepth <= depth + 1);
  }
});
test('palette reduction preserves transparent pixels and alpha', () => {
  const input = [[255, 0, 0, 255], [0, 255, 0, 128], [4, 6, 8, 0]];
  const result = reducePalette(input, 1);
  assert.deepEqual(result.map(p => p[3]), [255, 128, 0]);
  assert.deepEqual(result[2], [0, 0, 0, 0]);
  assert.deepEqual(result, reducePalette(input, 1));
});
test('RGB composites onto background; RGBA retains transparency', () => {
  const data = new Uint8ClampedArray([255, 0, 0, 0]);
  assert.deepEqual([...convert(data, 1, 1, { colors: 0, colorType: 'rgb6' }).pixels], [255, 255, 255, 255]);
  assert.deepEqual([...convert(data, 1, 1, { colors: 0 }).pixels], [0, 0, 0, 0]);
});
