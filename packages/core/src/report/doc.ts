/**
 * The report as a list of blocks, rendered to Markdown and to print-ready HTML. All text is plain text (model text is
 * untrusted): the HTML renderer escapes it, the Markdown renderer backslash-escapes inline markup, raw `<`/`>` and line-start
 * block markers. Only the SVG strings from `svg.ts` (already escaped) are embedded as markup.
 */
import { escapeXml } from './svg.ts';

export type Cell = string | { code: string };

export type Block =
  | { t: 'h'; level: 1 | 2 | 3; text: string }
  | { t: 'p'; text: string }
  | { t: 'note'; text: string }
  | { t: 'ul'; items: string[] }
  | { t: 'table'; head: string[]; rows: Cell[][]; right?: number[] }
  | { t: 'fig'; svg: string; alt: string; caption: string };

// ── Markdown ───────────────────────────────────────────────────────────────

/** Plain text → Markdown that renders as that same text (no emphasis, links, HTML or headings from model text). */
export function mdText(s: string): string {
  return s
    .replace(/\r\n?/g, '\n')
    .replace(/[\\`*[\]]|(?<!\w)_|_(?!\w)/g, (c) => `\\${c}`) // inline markup (underscores inside words are literal)
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/^(\s*)(#{1,6}|[+-]|[-=]+|~{3,})(?=\s|$)/gm, '$1\\$2') // heading, list, rule, setext, fence at a line start
    .replace(/^(\s*)(\d+)([.)])(?=\s|$)/gm, '$1$2\\$3'); // ordered-list marker
}

const mdCell = (c: Cell): string =>
  typeof c === 'string'
    ? mdText(c).replace(/\n+/g, ' ').replace(/\|/g, '\\|')
    : `\`${c.code.replace(/\s+/g, ' ').replace(/`/g, "'").replace(/\|/g, '\\|')}\``;

/** SVG as a data-URI image: renders in any Markdown viewer that shows images, with nothing to host. */
export function svgDataUri(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg).replace(/\(/g, '%28').replace(/\)/g, '%29')}`;
}

export function renderMarkdown(blocks: Block[]): string {
  const out: string[] = [];
  for (const b of blocks) {
    switch (b.t) {
      case 'h':
        out.push(`${'#'.repeat(b.level)} ${mdText(b.text).replace(/\n+/g, ' ')}`);
        break;
      case 'p':
        out.push(b.text.split(/\n{2,}/).map(mdText).join('\n\n'));
        break;
      case 'note':
        out.push(`*${mdText(b.text).replace(/\n+/g, ' ')}*`);
        break;
      case 'ul':
        out.push(b.items.map((i) => `- ${mdText(i).replace(/\n+/g, ' ')}`).join('\n'));
        break;
      case 'table': {
        const right = new Set(b.right ?? []);
        out.push(
          [
            `| ${b.head.map(mdCell).join(' | ')} |`,
            `| ${b.head.map((_, i) => (right.has(i) ? '---:' : '---')).join(' | ')} |`,
            ...b.rows.map((r) => `| ${r.map(mdCell).join(' | ')} |`),
          ].join('\n'),
        );
        break;
      }
      case 'fig':
        out.push(`![${mdText(b.alt)}](${svgDataUri(b.svg)})\n\n*${mdText(b.caption)}*`);
        break;
    }
  }
  return `${out.join('\n\n')}\n`;
}

// ── HTML ───────────────────────────────────────────────────────────────────

const STYLE = `
:root{color-scheme:light}
*{box-sizing:border-box}
body{margin:0;background:#fff;color:#222;font:14px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
main{max-width:860px;margin:0 auto;padding:28px 24px 48px}
h1{font-size:26px;line-height:1.2;margin:0 0 4px}
h2{font-size:19px;margin:30px 0 8px;padding-bottom:4px;border-bottom:2px solid #0072B2;break-after:avoid}
h3{font-size:15px;margin:20px 0 6px;break-after:avoid}
p{margin:6px 0}
p.note,figcaption{color:#555;font-size:12.5px}
ul{margin:6px 0;padding-left:22px}
table{width:100%;border-collapse:collapse;margin:8px 0;font-size:12.5px;break-inside:avoid}
th,td{border-bottom:1px solid #ddd;padding:4px 8px;text-align:left;vertical-align:top}
th{background:#f3f6f9;font-weight:600}
td.num,th.num{text-align:right;font-variant-numeric:tabular-nums}
code{font:12px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;word-break:break-word}
figure{margin:12px 0;break-inside:avoid}
figure svg{max-width:100%;height:auto;display:block}
@page{size:A4;margin:16mm 14mm}
@media print{main{max-width:none;padding:0}a{color:inherit}}
`;

const para = (text: string): string =>
  text
    .replace(/\r\n?/g, '\n')
    .split(/\n{2,}/)
    .map((p) => `<p>${escapeXml(p).replace(/\n/g, '<br>')}</p>`)
    .join('\n');

const htmlCell = (c: Cell): string => (typeof c === 'string' ? escapeXml(c) : `<code>${escapeXml(c.code)}</code>`);

/** A complete, self-contained HTML document (inline CSS, inline SVG, no scripts): open it and print it to PDF. */
export function renderHtml(title: string, blocks: Block[]): string {
  const body: string[] = [];
  for (const b of blocks) {
    switch (b.t) {
      case 'h':
        body.push(`<h${b.level}>${escapeXml(b.text)}</h${b.level}>`);
        break;
      case 'p':
        body.push(para(b.text));
        break;
      case 'note':
        body.push(`<p class="note">${escapeXml(b.text)}</p>`);
        break;
      case 'ul':
        body.push(`<ul>${b.items.map((i) => `<li>${escapeXml(i)}</li>`).join('')}</ul>`);
        break;
      case 'table': {
        const right = new Set(b.right ?? []);
        const cls = (i: number) => (right.has(i) ? ' class="num"' : '');
        body.push(
          `<table><thead><tr>${b.head.map((h, i) => `<th scope="col"${cls(i)}>${escapeXml(h)}</th>`).join('')}</tr></thead>` +
            `<tbody>${b.rows.map((r) => `<tr>${r.map((c, i) => `<td${cls(i)}>${htmlCell(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`,
        );
        break;
      }
      case 'fig':
        body.push(`<figure>${b.svg}<figcaption>${escapeXml(b.caption)}</figcaption></figure>`);
        break;
    }
  }
  return (
    `<!doctype html>\n<html lang="en"><head><meta charset="utf-8">` +
    `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeXml(title)}</title>` +
    `<style>${STYLE}</style></head><body><main>\n${body.join('\n')}\n</main></body></html>\n`
  );
}
