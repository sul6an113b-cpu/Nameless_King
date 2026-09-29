/**
 * Parse a two-column time,value CSV into reference-mode points (Frame stage).
 * Accepts comma, semicolon or tab separators, an optional header row, and blank lines. Imported files are
 * untrusted data: values are parsed as numbers only, and time must be strictly ascending.
 */
export const MAX_POINTS = 100_000;

export type CsvParse =
  { ok: true; points: [number, number][]; header: [string, string] | null } | { ok: false; error: string };

const num = (s: string): number => (s.trim() === '' ? NaN : Number(s.trim()));

export function parseReferenceCsv(text: string): CsvParse {
  const lines = text
    .split(/\r?\n/)
    .map((l, i) => ({ l: l.trim(), row: i + 1 }))
    .filter((x) => x.l !== '');
  if (lines.length === 0) return { ok: false, error: 'The file is empty.' };
  const first = lines[0]?.l ?? '';
  const sep = first.includes('\t') ? '\t' : first.includes(';') ? ';' : ',';
  const split = (l: string) => l.split(sep).map((c) => c.trim().replace(/^"(.*)"$/, '$1'));

  let header: [string, string] | null = null;
  let body = lines;
  const cells0 = split(first);
  if (cells0.length >= 2 && (Number.isNaN(num(cells0[0] ?? '')) || Number.isNaN(num(cells0[1] ?? '')))) {
    header = [cells0[0] ?? '', cells0[1] ?? ''];
    body = lines.slice(1);
  }
  if (body.length === 0) return { ok: false, error: 'No data rows found.' };
  if (body.length > MAX_POINTS)
    return { ok: false, error: `Too many rows (${body.length}); the limit is ${MAX_POINTS}.` };

  const points: [number, number][] = [];
  for (const { l, row } of body) {
    const cells = split(l);
    if (cells.length < 2) return { ok: false, error: `Row ${row}: expected two columns (time, value).` };
    const t = num(cells[0] ?? '');
    const v = num(cells[1] ?? '');
    if (!Number.isFinite(t) || !Number.isFinite(v))
      return { ok: false, error: `Row ${row}: "${l.slice(0, 40)}" is not two numbers.` };
    const prev = points[points.length - 1];
    if (prev && !(t > prev[0])) return { ok: false, error: `Row ${row}: time must be strictly ascending.` };
    points.push([t, v]);
  }
  return { ok: true, points, header };
}
