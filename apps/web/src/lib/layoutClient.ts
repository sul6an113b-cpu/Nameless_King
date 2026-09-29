/** Auto-layout client: dagre in a Web Worker; synchronous fallback where workers are unavailable (tests). */
import { computeLayout, type LayoutEdge, type LayoutNode, type LayoutOptions, type Positions } from './layout.ts';

type Reply = { id: number; ok: true; positions: Positions } | { id: number; ok: false; error: string };

let worker: Worker | null = null;
let seq = 0;
const waiting = new Map<number, { resolve: (p: Positions) => void; reject: (e: Error) => void }>();

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('../workers/layout.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (ev: MessageEvent<Reply>) => {
      const w = waiting.get(ev.data.id);
      if (!w) return;
      waiting.delete(ev.data.id);
      if (ev.data.ok) w.resolve(ev.data.positions);
      else w.reject(new Error(ev.data.error));
    };
  }
  return worker;
}

export function runLayout(nodes: LayoutNode[], edges: LayoutEdge[], opts?: LayoutOptions): Promise<Positions> {
  if (typeof Worker === 'undefined') return Promise.resolve(computeLayout(nodes, edges, opts));
  const id = ++seq;
  return new Promise((resolve, reject) => {
    waiting.set(id, { resolve, reject });
    getWorker().postMessage({ id, nodes, edges, opts });
  });
}
