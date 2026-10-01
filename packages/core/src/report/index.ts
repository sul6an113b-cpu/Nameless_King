/** Decision-brief builder and CSV export (SPEC §6.8) — owner: interop (Phase 3). */
export { buildReport } from './build.ts';
export { toCsv } from './csv.ts';
export { kpiComparison, type KpiCell, type KpiComparison, type KpiRow } from './kpi.ts';
export { bandChartSvg, lineChartSvg, paretoSvg, tornadoSvg } from './svg.ts';
