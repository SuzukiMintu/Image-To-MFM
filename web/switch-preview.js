export function renderSwitchMfm(text) {
  let cursor = 0;
  function children(nested = false) {
    const fragment = document.createDocumentFragment();
    while (cursor < text.length) {
      if (nested && text[cursor] === ']') { cursor++; return fragment; }
      if (text.startsWith('$[', cursor)) {
        cursor += 2; const end = text.indexOf(' ', cursor);
        if (end < 0) throw new Error('構文が不完全です。');
        const header = text.slice(cursor, end); cursor = end + 1;
        const dot = header.indexOf('.'), fn = dot < 0 ? header : header.slice(0, dot);
        const args = Object.fromEntries((dot < 0 ? '' : header.slice(dot + 1)).split(',').filter(Boolean)
          .map(arg => { const p = arg.indexOf('='); return p < 0 ? [arg, true] : [arg.slice(0, p), arg.slice(p + 1)]; }));
        const span = document.createElement('span');
        if (fn === 'position') span.style.transform = `translateX(${Number(args.x ?? 0)}em) translateY(${Number(args.y ?? 0)}em)`;
        else if (fn === 'scale') span.style.transform = `scale(${Math.min(Number(args.x ?? 1), 5)},${Math.min(Number(args.y ?? 1), 5)})`;
        else if (fn === 'spin') {
          span.style.animation = `mfm-spin ${args.speed} linear infinite`; span.style.animationDirection = args.left ? 'reverse' : 'normal'; span.style.animationDelay = args.delay || '0s';
        } else if (fn === 'border') { span.style.border = '0px solid transparent'; span.style.overflow = 'clip'; }
        else if (fn === 'bg') { span.style.backgroundColor = `#${args.color}`; span.style.overflowWrap = 'anywhere'; }
        else if (fn === 'fg') { span.style.color = `#${args.color}`; span.style.overflowWrap = 'anywhere'; }
        else throw new Error('試作プレビューでは対応していない構文です。');
        span.append(children(true)); fragment.append(span);
      } else if (text[cursor] === '\n') { cursor++; fragment.append(document.createElement('br')); }
      else {
        const start = cursor;
        while (cursor < text.length && text[cursor] !== '\n' && !text.startsWith('$[', cursor) && !(nested && text[cursor] === ']')) cursor++;
        fragment.append(document.createTextNode(text.slice(start, cursor)));
      }
    }
    if (nested) throw new Error('括弧が閉じられていません。');
    return fragment;
  }
  return children();
}
