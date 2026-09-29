/**
 * The mounted canvas registers its PNG/SVG exporter here so the top-bar file menu (outside the React Flow
 * provider) can call it. Only one canvas is mounted at a time (one per stage).
 */
import { useSyncExternalStore } from 'react';

export type ImageFormat = 'png' | 'svg';
type Exporter = (format: ImageFormat) => Promise<void>;

let current: Exporter | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

export function registerExporter(fn: Exporter): () => void {
  current = fn;
  notify();
  return () => {
    if (current === fn) {
      current = null;
      notify();
    }
  };
}

export const exportDiagram = (format: ImageFormat): Promise<void> => (current ? current(format) : Promise.resolve());

export function useCanExportDiagram(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current !== null,
  );
}
