/** Browser file helpers: download a blob, read a picked file, and a safe file-name stem. */

export function download(filename: string, data: Blob | string, type = 'application/octet-stream'): void {
  const blob = typeof data === 'string' ? new Blob([data], { type }) : data;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadDataUrl(filename: string, dataUrl: string): void {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** A file-system-safe stem from a model name. */
export const fileStem = (name: string): string =>
  name
    .trim()
    .replace(/[^A-Za-z0-9 _-]+/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 60) || 'model';

export const readText = (file: File): Promise<string> => file.text();
