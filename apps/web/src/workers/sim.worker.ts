/** Simulation worker (SPEC §8): compile + Euler/RK4 off the main thread; results are transferred, not copied. */
import { runSimulation, transferables, type SimReply, type SimRequest } from './simRun.ts';

self.onmessage = (ev: MessageEvent<SimRequest>) => {
  const { id, model, spec, saveIds } = ev.data;
  const outcome = runSimulation(model, spec, saveIds);
  const reply: SimReply = { ...outcome, id };
  self.postMessage(reply, { transfer: outcome.status === 'ok' ? transferables(outcome.result) : [] });
};
