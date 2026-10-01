/** CSV export of one simulation run (SPEC §6.8). */
import type { SimResult } from '../contracts.ts';
import type { Id } from '../schema/model.ts';

/**
 * One CSV field. Quoted when it holds a separator, quote or line break; a leading `=`, `+`, `-`, `@`, tab or CR gets a
 * `'` prefix so a spreadsheet never reads a variable name as a formula (names are untrusted model text).
 */
export function csvField(text: string): string {
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

const cell = (v: number | undefined): string => (v === undefined || Number.isNaN(v) ? '' : String(v));

/** `time` then one column per saved variable (header = its name, else its id), one row per saved step. Numbers round-trip exactly. */
export function toCsv(result: SimResult, names: Record<Id, string>): string {
  const ids = Object.keys(result.series);
  const lines = [['time', ...ids.map((id) => names[id] ?? id)].map(csvField).join(',')];
  for (let k = 0; k < result.time.length; k++)
    lines.push([cell(result.time[k]), ...ids.map((id) => cell(result.series[id]?.[k]))].join(','));
  return `${lines.join('\n')}\n`;
}
