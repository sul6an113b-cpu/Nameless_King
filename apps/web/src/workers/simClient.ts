/** Promise API over the simulation worker. One worker, requests answered in order; cancel = terminate. */
import type { Id, Model, SimSpec } from '@looplab/core';
import { runSimulation, type SimOutcome, type SimReply } from './simRun.ts';

let worker: Worker | null = null;
let seq = 0;
const waiting = new Map<number, (o: SimOutcome) => void>();

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./sim.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (ev: MessageEvent<SimReply>) => {
      const done = waiting.get(ev.data.id);
      waiting.delete(ev.data.id);
      done?.(ev.data);
    };
    worker.onerror = (ev) => {
      ev.preventDefault();
      failAll(ev.message || 'The simulation worker failed');
    };
  }
  return worker;
}

function failAll(message: string): void {
  for (const done of waiting.values()) done({ status: 'error', message });
  waiting.clear();
  worker?.terminate();
  worker = null;
}

export function simulateInWorker(model: Model, spec?: Partial<SimSpec>, saveIds?: Id[]): Promise<SimOutcome> {
  if (typeof Worker === 'undefined') return Promise.resolve(runSimulation(model, spec, saveIds));
  const id = ++seq;
  return new Promise((resolve) => {
    waiting.set(id, resolve);
    getWorker().postMessage({ id, model, spec, saveIds });
  });
}

/** Stop any running simulation; pending promises resolve with an error outcome. */
export function cancelSimulation(): void {
  failAll('Cancelled');
}
