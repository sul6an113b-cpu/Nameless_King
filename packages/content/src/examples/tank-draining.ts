/**
 * Tank draining through a bottom orifice (Torricelli's law) — a physical system with an analytic solution, used to
 * check integration accuracy (Euler vs RK4) against the exact answer.
 *
 *   dh/dt = −Cd·a·√(2·g·h) / A = −k·√h,   k = Cd·a·√(2g) / A
 *   ⇒ √h(t) = √h0 − k·t/2   ⇒   h(t) = (√h0 − k·t/2)²  for t ≤ T_empty = 2·√h0 / k, and 0 afterwards.
 *
 * Torricelli's law and the √h-linear-in-time solution: see sources.ts ('torricelli-law'). The discharge coefficient
 * (~0.6 for a sharp-edged orifice) and all dimensions are illustrative. The default horizon (600 s) ends before the
 * tank empties (T_empty ≈ 753 s), where √h is smooth; the stock is non-negative so a longer horizon stays physical.
 */
import { buildModel } from '../build.ts';
import { cite } from '../sources.ts';
import type { ExampleModel } from '../types.ts';

const model = buildModel({
  id: 'm_example_tank_draining',
  name: 'Tank draining (Torricelli)',
  simSpec: { start: 0, stop: 600, dt: 0.5, method: 'euler', timeUnit: 'second' },
  units: ['meter'],
  variables: [
    { id: 'v_height', name: 'Water height', kind: 'stock', eq: 'Initial_height', units: 'meter', nonNegative: true },
    { id: 'v_fall', name: 'Level fall rate', kind: 'flow', eq: 'Outflow / Tank_area', units: 'meter/second', from: 'v_height' },
    { id: 'v_velocity', name: 'Outflow velocity', kind: 'aux', eq: 'SQRT(2 * Gravity * Water_height)', units: 'meter/second', doc: 'Torricelli: v = √(2gh).' },
    { id: 'v_outflow', name: 'Outflow', kind: 'aux', eq: 'Discharge_coefficient * Orifice_area * Outflow_velocity', units: 'meter^3/second' },
    { id: 'v_h0', name: 'Initial height', kind: 'constant', eq: '1', units: 'meter', range: [0.9, 1.1] },
    { id: 'v_tank_area', name: 'Tank area', kind: 'constant', eq: '0.5', units: 'meter^2', range: [0.45, 0.55], doc: 'Constant cross-section (≈ 0.8 m diameter).' },
    { id: 'v_orifice_area', name: 'Orifice area', kind: 'constant', eq: '0.0005', units: 'meter^2', range: [0.00045, 0.00055], doc: '≈ 25 mm diameter outlet.' },
    { id: 'v_cd', name: 'Discharge coefficient', kind: 'constant', eq: '0.6', units: 'dmnl', range: [0.55, 0.65], doc: 'Illustrative value for a sharp-edged orifice.' },
    { id: 'v_g', name: 'Gravity', kind: 'constant', eq: '9.81', units: 'meter/second^2', range: [9.78, 9.83], doc: 'Standard gravity varies by about this much with latitude.' },
  ],
  links: [
    ['v_h0', 'v_height', '+', { note: 'Initial level.' }],
    ['v_outflow', 'v_fall', '+'],
    ['v_tank_area', 'v_fall', '-'],
    ['v_g', 'v_velocity', '+'],
    ['v_height', 'v_velocity', '+'],
    ['v_cd', 'v_outflow', '+'],
    ['v_orifice_area', 'v_outflow', '+'],
    ['v_velocity', 'v_outflow', '+'],
  ],
  frame: {
    problem: 'How long does the tank take to drain, and how accurate is the simulation compared with the exact solution?',
    purpose: 'Verify the integrator on a nonlinear physical system with a known answer; compare Euler and RK4 and the effect of DT.',
    kpis: [{ id: 'k_height', name: 'Water height', varId: 'v_height', goal: 'minimize' }],
    referenceModes: [
      {
        id: 'r_analytic',
        name: 'Analytic solution',
        varId: 'v_height',
        source: 'sketch',
        label: 'expected',
        units: 'meter',
        note: 'Points of the exact solution h(t) = (√h0 − k·t/2)², rounded to 4 decimals.',
        points: [[0, 1], [100, 0.7519], [200, 0.5391], [300, 0.3616], [400, 0.2195], [500, 0.1126], [600, 0.0411]],
      },
    ],
    excluded: [{ id: 'b_inflow', name: 'Inflow to the tank', reason: 'Draining only.' }],
  },
  assertions: [{ id: 'a_height', expr: 'Water_height >= 0' }],
  scenarios: [
    { id: 's_rk4', name: 'RK4 integration', note: 'Same model, fourth-order Runge–Kutta.', simSpec: { method: 'rk4' } },
    { id: 's_bigger_orifice', name: 'Larger outlet', overrides: [{ varId: 'v_orifice_area', equation: '0.001' }] },
  ],
});

const value = (id: string): number => Number(model.variables.find((v) => v.id === id)?.equation);

/** Exact water height h(t) in meters for the model's own constants (the scenario-free base case). */
export function tankHeight(t: number): number {
  const k = (value('v_cd') * value('v_orifice_area') * Math.sqrt(2 * value('v_g'))) / value('v_tank_area');
  const root = Math.sqrt(value('v_h0')) - (k * t) / 2;
  return root > 0 ? root * root : 0;
}

export const tankDraining: ExampleModel = {
  id: 'tank-draining',
  title: 'Tank draining (Torricelli’s law)',
  description:
    'Water drains through a bottom orifice at v = √(2gh). The exact solution h(t) = (√h0 − k·t/2)² makes it a check ' +
    'on integration accuracy: compare Euler and RK4 and halve DT. Illustrative dimensions.',
  model,
  analytic: tankHeight,
  sources: [cite('torricelli-law', true)],
};
