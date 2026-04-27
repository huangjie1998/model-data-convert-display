import { isCjkText } from './cadTextNormalize.js';

export function wrapSingleLineToWidth(line, maxWidth, advanceFn) {
  const rawLine = String(line || '');
  if (!rawLine || maxWidth <= 1e-6) return [rawLine];
  if (advanceFn(rawLine) <= maxWidth) return [rawLine];

  const tokens = rawLine.split(/(\s+)/u).filter((item) => item.length > 0);
  const wrapped = [];
  let current = '';

  const appendCurrent = () => {
    if (current) {
      wrapped.push(current.trimEnd());
      current = '';
    }
  };

  const appendTokenByChar = (token) => {
    for (const char of token) {
      const candidate = current ? `${current}${char}` : char;
      if (current && advanceFn(candidate) > maxWidth) {
        appendCurrent();
        current = char;
      } else {
        current = candidate;
      }
    }
  };

  for (const token of tokens) {
    const isWhitespace = /^\s+$/u.test(token);
    const candidate = current ? `${current}${token}` : token.trimStart();
    if (advanceFn(candidate) <= maxWidth) {
      current = candidate;
      continue;
    }
    if (!isWhitespace && token.length > 1 && isCjkText(token)) {
      appendTokenByChar(token);
      continue;
    }
    appendCurrent();
    if (!isWhitespace) {
      if (isCjkText(token) && advanceFn(token) > maxWidth) {
        appendTokenByChar(token);
      } else {
        current = token;
      }
    }
  }

  appendCurrent();
  return wrapped.length ? wrapped : [rawLine];
}
