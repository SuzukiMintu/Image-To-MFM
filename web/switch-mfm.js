// Two-frame geometric shutter prototype. This does not decode GIFs.
// Each frame must occupy the same box; widthEm is its untransformed width.
export function switchingMfm(frameA, frameB, { period = 4, widthEm = 1 } = {}) {
  if (!Number.isFinite(period) || period < 0.1 || !Number.isFinite(widthEm) || widthEm <= 0) {
    throw new Error('周期と幅には正の数を指定してください。');
  }
  const wrap = (fn, content) => `$[${fn} ${content}]`;
  const speed = `${period}s`;
  const offset = 312 * widthEm; // (5^4 - 1) * width / 2
  const radius = 100 * widthEm;
  // R(t) T(r) R(-t) translates on a circle without rotating the content.
  const orbit = (r, content) => wrap(`spin.speed=${speed}`,
    wrap(`position.x=${r}`, wrap(`spin.left,speed=${speed}`, content)));
  let movingFrame = orbit(-radius, wrap(`position.x=${-offset}`, frameB));
  movingFrame = wrap('scale.x=0.0016,y=0.0016', movingFrame);
  movingFrame = wrap('border.width=0', movingFrame);
  for (let i = 0; i < 4; i++) movingFrame = wrap('scale.x=5,y=5', movingFrame);
  movingFrame = orbit(radius, movingFrame);
  movingFrame = wrap(`position.x=${offset}`, movingFrame);
  movingFrame = wrap(`position.x=${-widthEm}`, movingFrame);
  return wrap('border.width=0', frameA + movingFrame);
}

export const frameA = '$[bg.color=26a $[fg.color=fff Ａ]]';
export const frameB = '$[bg.color=e63 $[fg.color=fff Ｂ]]';

export function mfmDepth(text) {
  let depth = 0, maximum = 0;
  for (let i = 0; i < text.length; i++) {
    if (text.startsWith('$[', i)) { maximum = Math.max(maximum, ++depth); i++; }
    else if (text[i] === ']') { if (--depth < 0) throw new Error('MFMの括弧が不正です。'); }
  }
  if (depth) throw new Error('MFMの括弧が閉じられていません。');
  return maximum;
}

const number = value => String(Number(value.toFixed(12)));

// Measured line-box height in the official 16px / 1.35 preview. Blink rounds
// each line to 1/64px; using 1.35 directly accumulates 0.1px per 16-row frame.
export const frameHeightEm = rows => rows * (21.59375 / 16);

// Equal-sized opaque frames on separate lines: reserve one frame's width.
// MkMfm clamps positive scales to 5 but currently accepts negative scales.
export function switchFrames(frames, { period = 6, widthEm = 1, heightEm = frameHeightEm(1), durations = null, gateFirst = false } = {}) {
  if (!Array.isArray(frames) || frames.length < 2
    || frames.some(frame => typeof frame !== 'string' || !frame)) {
    throw new Error('同じ大きさのコマを2個以上指定してください。');
  }
  if (![period, widthEm, heightEm].every(Number.isFinite) || period < 0.02 || widthEm <= 0 || heightEm <= 0) {
    throw new Error('周期は0.02秒以上、幅と高さは正の数で指定してください。');
  }
  if (durations && (durations.length !== frames.length || durations.some(time => !Number.isFinite(time) || time <= 0))) throw new Error('各コマの時間が不正です。');
  const times = durations || frames.map(() => period / frames.length);
  const total = times.reduce((sum, time) => sum + time, 0);
  if (!Number.isFinite(total)) throw new Error('各コマの合計時間が不正です。');
  const wrap = (fn, content) => `$[${fn} ${content}]`;
  const sy = 625 * Math.max(1, widthEm / heightEm);
  let start = gateFirst ? 0 : times[0];
  const layers = frames.map((frame, i) => {
    if (!i && !gateFirst) return frame;
    const angle = Math.PI * times[i] / total;
    const radius = 100 * widthEm / Math.sin(angle);
    const offset = 312 * widthEm + radius * Math.cos(angle);
    let delay = (start + times[i] / 2) / total * period - period / 2;
    start += times[i];
    if (delay > 0) delay -= period;
    // Spin delay is not implemented by the official renderer. Rotate the
    // translation vector instead: R(t) T(r cos(phi), r sin(phi)) R(-t).
    const phase = -delay / period * 2 * Math.PI;
    const orbit = (r, content) => wrap(`spin.speed=${number(period)}s`,
      wrap(`position.x=${number(r * Math.cos(phase))},y=${number(r * Math.sin(phase))}`,
        wrap(`spin.left,speed=${number(period)}s`, content)));
    let layer = orbit(-radius, wrap(`position.x=${number(-offset)}`, frame));
    layer = wrap(`scale.x=-0.0016,y=${number(-1 / sy)}`, layer);
    layer = wrap('border.width=0', layer);
    layer = wrap(`scale.x=-625,y=${number(-sy)}`, layer);
    layer = orbit(radius, layer);
    layer = wrap(`position.x=${number(offset)}`, layer);
    return wrap(`position.y=${number(-i * heightEm)}`, layer);
  });
  const text = wrap('border.width=0', layers.join('\n'));
  const depth = mfmDepth(text);
  if (depth > 20) throw new Error(`MFMの入れ子が${depth}段あります。各コマの入れ子を浅くしてください。`);
  return { text, length: text.length, depth, count: frames.length, period, widthEm, heightEm, layout: 'vertical', durations: times.map(time => time / total * period) };
}

const textColors = ['26a', 'e63', '287', '925', 'a72', '557', '279', 'b44'];
export function textFrames(lines) {
  if (lines.length < 2 || lines.length > 8) throw new Error('文字は1行1コマとして2〜8行入力してください。');
  const normalized = lines.map(line => line.normalize('NFC').replace(/[\x20-\x7e]/g,
    char => char === ' ' ? '　' : String.fromCharCode(char.charCodeAt(0) + 0xfee0)));
  if (normalized.some(line => !line || !/^[\u3000-\u30ff\u3400-\u9fff\uff01-\uff60]+$/u.test(line))) {
    throw new Error('文字の試作には英数字・ひらがな・カタカナ・漢字を使ってください。絵文字や複雑な記号は画像として読み込めます。');
  }
  const width = Math.max(...normalized.map(line => [...line].length));
  if (width > 24) throw new Error('文字は1コマ24文字以内にしてください。');
  return {
    widthEm: width, heightEm: frameHeightEm(1),
    frames: normalized.map((line, i) => `$[bg.color=${textColors[i]} $[fg.color=fff ${line + '　'.repeat(width - [...line].length)}]]`),
  };
}
