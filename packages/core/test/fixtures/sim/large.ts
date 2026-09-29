/**
 * A generated stock-and-flow model of exactly `2·stocks + … ` = 500 variables by default (100 stocks,
 * 200 flows, 150 auxiliaries, 50 constants), for the performance budget (SPEC §6.3: 500 variables,
 * 10,000 Euler steps < 1 s). Flows move material around a ring of stocks, so values stay bounded.
 */
import type { Model } from '../../../src/schema/model.ts';
import { buildModel, type VarSpec } from './build.ts';

export function largeSfd(opts: { stocks?: number; steps?: number; dt?: number } = {}): Model {
  const nS = opts.stocks ?? 100;
  const nF = 2 * nS;
  const nA = (3 * nS) / 2;
  const nC = nS / 2;
  const dt = opts.dt ?? 1;
  const vars: VarSpec[] = [];
  for (let i = 0; i < nS; i++) vars.push({ name: `S${i}`, kind: 'stock', eq: String(100 + i) });
  for (let j = 0; j < nC; j++) vars.push({ name: `c${j}`, kind: 'constant', eq: String(0.001 + j * 0.0001) });
  for (let k = 0; k < nA; k++) {
    const s = `S${k % nS}`;
    const s2 = `S${(k * 7 + 3) % nS}`;
    const c = `c${k % nC}`;
    const eq =
      k % 3 === 0
        ? `${s} * ${c} + MAX(0, ${s2} - 100) / (1 + ${c})`
        : k % 3 === 1
          ? `IF ${s} > ${s2} THEN ${s} - ${s2} ELSE MIN(${s2}, 150) * 0.5`
          : `a${k - 1} * 0.5 + SQRT(ABS(${s})) + STEP(1, 50)`;
    vars.push({ name: `a${k}`, eq });
  }
  for (let m = 0; m < nF; m++) {
    const from = m % nS;
    const to = (m + 1 + (m >= nS ? 7 : 0)) % nS;
    vars.push({
      name: `f${m}`,
      from: `S${from}`,
      to: `S${to}`,
      eq: `S${from} * c${m % nC} * (1 + 0.1 * SIN(a${m % nA} / 100))`,
    });
  }
  return buildModel(vars, { simSpec: { start: 0, stop: (opts.steps ?? 10_000) * dt, dt, method: 'euler' } });
}
