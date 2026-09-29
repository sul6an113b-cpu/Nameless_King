import { useMemo } from 'react';
import { renderMarkdown } from './sanitize.ts';

/** Copilot Markdown, rendered through `renderMarkdown` (sanitised) — the one HTML sink for copilot text. */
export function Markdown({ source }: { source: string }) {
  const html = useMemo(() => renderMarkdown(source), [source]);
  return <div className="cp-md" dangerouslySetInnerHTML={{ __html: html }} />;
}
