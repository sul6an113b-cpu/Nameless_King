/** Align series (possibly with different time grids, e.g. runs at different DT) into uPlot's column format. */
import uPlot from 'uplot';

export interface ChartSeries {
  label: string;
  time: ArrayLike<number>;
  values: ArrayLike<number>;
  /** categorical colour slot 0..7 */
  slot: number;
  dash: number[];
}

const clean = (a: ArrayLike<number>): (number | null)[] => Array.from(a, (x) => (Number.isFinite(x) ? x : null));

const sameGrid = (a: ArrayLike<number>, b: ArrayLike<number>): boolean => {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
};

export function alignSeries(series: ChartSeries[]): uPlot.AlignedData {
  const first = series[0];
  if (!first) return [[]];
  if (series.every((s) => sameGrid(s.time, first.time)))
    return [Array.from(first.time), ...series.map((s) => clean(s.values))];
  return uPlot.join(series.map((s) => [Array.from(s.time), clean(s.values)] as uPlot.AlignedData));
}
