import test from 'node:test';
import assert from 'node:assert/strict';
import { convertToBudget, minimumLength } from '../web/fit.js';
import { convert } from '../web/core.js';

function provider(pixel) {
  return (width, height) => new Uint8ClampedArray(Array.from({ length: width * height }, (_, i) => pixel(i, width, height)).flat());
}
const red = provider(() => [255, 0, 0, 255]);

test('unlimited mode converts beyond both former limits', async () => {
  const result = await convertToBudget(300, 80, { width: 0, height: 0, colors: 0 }, { getPixels: red });
  assert.equal(result.width, 300); assert.equal(result.height, 80);
  assert.equal(result.fit.resized, false); assert.equal(result.fit.attempts, 1);
  assert.deepEqual(result.text, convert(red(300, 80), 300, 80, { colors: 0 }).text);
});
test('already fitting settings and pixels are retained', async () => {
  const result = await convertToBudget(10, 5, { width: 10, height: 5, targetLength: 1000 }, { getPixels: red });
  assert.equal(result.fit.met, true); assert.equal(result.fit.resized, false);
  assert.equal(result.fit.attempts, 1); assert.equal(result.usedOptions.colors, 5);
});
test('palette search fits without resizing and keeps color format', async () => {
  const striped = provider(i => i % 2 ? [255,0,0,255] : [0,0,255,255]);
  const result = await convertToBudget(8, 4, { width: 8, height: 4, colors: 5, colorType: 'rgb6', targetLength: 90 }, { getPixels: striped });
  assert.equal(result.fit.met, true); assert.equal(result.fit.resized, false);
  assert.ok(result.length <= 90); assert.ok(result.usedOptions.colors < 5);
  assert.equal(result.usedOptions.colorType, 'rgb6');
});
test('impossible dimensions skip allocation and shrink while preserving ratio', async () => {
  const calls = [], progress = [];
  const result = await convertToBudget(4000, 2000, { width: 0, height: 0, targetLength: 150 }, {
    getPixels(w,h) { calls.push([w,h]); return red(w,h); }, onProgress: p => progress.push(p),
  });
  assert.equal(result.fit.met, true); assert.equal(result.fit.resized, true);
  assert.ok(result.length <= 150); assert.ok(result.fit.skippedSizes > 0);
  assert.ok(calls.every(([w,h]) => minimumLength(w,h,{}) <= 150));
  assert.ok(Math.abs(result.width / result.height - 2) <= 0.2);
  assert.ok(progress.some(p => p.stage === 'resize'));
});
test('resolution lock reports exceeding target without silently shrinking', async () => {
  const result = await convertToBudget(8, 4, { width: 8, height: 4, colors: 2, targetLength: 20, allowResize: false }, { getPixels: red });
  assert.equal(result.fit.met, false); assert.equal(result.fit.resized, false);
  assert.equal(result.width, 8); assert.equal(result.height, 4);
});
test('unreachable tiny budget terminates at one pixel with explicit failure', async () => {
  const result = await convertToBudget(4, 4, { width: 4, height: 4, colors: 2, targetLength: 1 }, { getPixels: red });
  assert.equal(result.width, 1); assert.equal(result.height, 1);
  assert.equal(result.fit.met, false); assert.ok(result.length > 1);
});
test('resampling requests original data at every new size', async () => {
  const calls = [];
  const translucent = provider(i => [80,160,40, i % 2 ? 100 : 200]);
  const result = await convertToBudget(10, 10, { width: 10, height: 10, colors: 2, targetLength: 130 }, {
    getPixels(w,h) { calls.push([w,h]); return translucent(w,h); },
  });
  assert.equal(result.fit.met, true);
  assert.ok(calls.length > 1);
  assert.deepEqual(result.pixels, convert(translucent(result.width,result.height), result.width,result.height,result.usedOptions).pixels);
});
