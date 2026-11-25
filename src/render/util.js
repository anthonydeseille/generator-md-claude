export const MANUAL_MARKER = '<!-- md-claude:manual';
export const MANUAL_LINE = `${MANUAL_MARKER}: everything below this line is kept when regenerating -->`;

/** Drops empty/falsy lines (false, undefined, null, 0, ''). */
export const compact = (lines) => lines.flat(Infinity).filter((l) => l !== false && l != null && l !== 0 && l !== '');

export const splitList = (value, sep = ',') =>
  (value ?? '')
    .split(sep)
    .map((s) => s.trim())
    .filter(Boolean);

/**
 * A document is { title, intro?, sections: [{ title, lines, subsections? }] }.
 * `level` is the main heading level (1 for a dedicated file, 2 when merged into another one).
 */
export function renderDoc(doc, level = 1) {
  const h = (n) => '#'.repeat(Math.min(n, 6));
  const out = [`${h(level)} ${doc.title}`, ''];
  if (doc.intro) out.push(doc.intro, '');
  for (const section of doc.sections) {
    const lines = compact(section.lines ?? []);
    const subs = (section.subsections ?? [])
      .map((s) => ({ ...s, lines: compact(s.lines) }))
      .filter((s) => s.lines.length);
    if (!lines.length && !subs.length) continue;
    out.push(`${h(level + 1)} ${section.title}`, '');
    if (lines.length) out.push(...lines, '');
    for (const sub of subs) out.push(`${h(level + 2)} ${sub.title}`, '', ...sub.lines, '');
  }
  return out;
}

export const where = (dir) => (dir === '.' ? '' : ` (from \`${dir}/\`)`);
