import test from 'node:test';
import assert from 'node:assert/strict';
import { switchFrames, textFrames, mfmDepth, frameHeightEm } from '../web/switch-mfm.js';

test('multi-frame shutters expose exactly the intended frame at each time midpoint', () => {
  for (const times of [[1, 1, 1], [80, 80, 80, 80, 80], [1, 2, 1], Array(8).fill(1)]) {
    const period = 6, total = times.reduce((a, b) => a + b);
    const result = switchFrames(times.map((_, i) => `Ｆ${i}`), { period, durations: times });
    // Read actual emitted vectors, not the generator's internal phase variables.
    const vectors = [...result.text.matchAll(/position.x=([-\d.]+),y=([-\d.]+)/g)].map(m => [Number(m[1]), Number(m[2])]);
    const offsets = [...result.text.matchAll(/position.x=([-\d.]+) \$\[spin.speed/g)].map(m => Number(m[1]));
    let start = 0;
    times.forEach((duration, index) => {
      const theta = (start + duration / 2) / total * 2 * Math.PI;
      const visible = [];
      for (let i = 1; i < times.length; i++) {
        const [x, y] = vectors[(i - 1) * 2];
        const gateLeft = offsets[i - 1] - 312 + x * Math.cos(theta) - y * Math.sin(theta);
        if (gateLeft < 0) visible.push(i);
        const inverse = vectors[(i - 1) * 2 + 1];
        assert.ok(Math.abs(x + inverse[0]) < 1e-8 && Math.abs(y + inverse[1]) < 1e-8);
      }
      assert.deepEqual(visible, index ? [index] : []);
      start += duration;
    });
    assert.ok(!result.text.includes('delay='));
    assert.ok(Math.abs(result.durations.reduce((a, b) => a + b) - period) < 1e-10);
  }
});

test('vertical flow keeps six text frames and five 16-row frames at one origin in a 407px column', () => {
  // Independently walk the emitted MFM and simulate the measured official
  // line boxes. Horizontal flow would wrap these cases and fail this check.
  function parse(source) {
    let p = 0;
    function read() {
      const nodes = [];
      while (p < source.length && source[p] !== ']') {
        if (source.startsWith('$[', p)) {
          p += 2; const end = source.indexOf(' ', p), header = source.slice(p, end); p = end + 1;
          const children = read(); assert.equal(source[p++], ']'); nodes.push({ header, children });
        } else { let start = p; while (p < source.length && source[p] !== ']' && !source.startsWith('$[', p)) p++; nodes.push(source.slice(start, p)); }
      }
      return nodes;
    }
    return read()[0];
  }
  for (const [count, width, rows] of [[6, 5, 1], [5, 16, 16], [8, 24, 24]]) for (const scale of [0.7, 1]) {
    const frame = `$[border.width=0 $[scale.y=${scale} ${Array(rows).fill('　'.repeat(width)).join('\n')}]]`;
    const result = switchFrames(Array(count).fill(frame), { widthEm: width, heightEm: frameHeightEm(rows) });
    const root = parse(result.text);
    let flowX = 0, flowY = 0, placed = 0;
    for (const node of root.children) {
      if (typeof node === 'string' && node === '\n') { flowX = 0; flowY += rows * 21.59375; continue; }
      if (flowX + width * 16 > 407) { flowX = 0; flowY += rows * 21.59375; }
      const header = typeof node === 'string' ? '' : node.header;
      const dy = Number(header.match(/^position\.y=([-\d.]+)$/)?.[1] || 0) * 16;
      assert.equal(flowX, 0);
      assert.ok(Math.abs(flowY + dy) < 1e-8);
      // CSS scale changes painted height around the frame centre, not line
      // layout. Every scaled frame must still paint at the same top edge.
      const paintedTop = flowY + dy + rows * 21.59375 * (1 - scale) / 2;
      assert.ok(Math.abs(paintedTop - rows * 21.59375 * (1 - scale) / 2) < 1e-8);
      flowX += width * 16; placed++;
    }
    assert.equal(placed, count);
    assert.ok(result.depth <= 20);
  }
});

test('text frames pad equal widths, escape ASCII markup, and reject invalid inputs', () => {
  const prepared = textFrames(['AB', 'あ']);
  assert.equal(prepared.widthEm, 2);
  assert.ok(prepared.frames[0].includes('ＡＢ'));
  assert.ok(prepared.frames[1].includes('あ　'));
  assert.throws(() => textFrames(['🙂', 'あ']));
  assert.throws(() => switchFrames(['あ']));
  assert.throws(() => switchFrames(['あ', 'い'], { durations: [Infinity, 1] }));
  assert.throws(() => switchFrames(['あ', 'い'], { durations: [Number.MAX_VALUE, Number.MAX_VALUE] }));
  const deep = '$[bg.color=fff '.repeat(9) + '　' + ']'.repeat(9);
  assert.throws(() => switchFrames(['あ', deep]), /入れ子/);
  assert.throws(() => mfmDepth('$[bg.color=fff あ'));
});
