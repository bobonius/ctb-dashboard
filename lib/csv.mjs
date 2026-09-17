// Minimal CSV/TSV reader. No dependencies.

export function parseDelimited(text) {
  const clean = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  // Blank lines and # comment lines are skipped, so a data file can carry
  // notes to whoever edits it next without becoming a phantom row.
  const lines = clean.split('\n').filter((l) => l.trim() !== '' && !l.trimStart().startsWith('#'));
  if (!lines.length) return [];
  const delim = lines[0].includes('\t') ? '\t' : ',';
  const head = splitLine(lines[0], delim).map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cells = splitLine(line, delim);
    const row = {};
    head.forEach((key, i) => {
      row[key] = (cells[i] ?? '').trim();
    });
    return row;
  });
}

function splitLine(line, delim) {
  if (delim === '\t') return line.split('\t');
  const out = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else { quoted = false; }
      } else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

export const int = (v) => (v === '' || v == null || Number.isNaN(Number(v)) ? null : parseInt(v, 10));
