/**
 * Copilot Markdown → sanitised HTML (marked + DOMPurify, SPEC §10). Copilot text can echo untrusted model content,
 * so scripts, event handlers, styles, forms, frames and images (remote fetches could leak data) are stripped.
 */
import { marked } from 'marked';
import DOMPurify from 'dompurify';

const FORBID_TAGS = [
  'img',
  'picture',
  'video',
  'audio',
  'source',
  'iframe',
  'object',
  'embed',
  'form',
  'input',
  'button',
  'style',
  'link',
  'meta',
];

export function renderMarkdown(source: string): string {
  const html = marked(source, { async: false, gfm: true, breaks: false });
  return DOMPurify.sanitize(html, { FORBID_TAGS, FORBID_ATTR: ['style'] });
}
