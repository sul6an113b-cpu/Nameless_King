/**
 * Thin React wrapper around uPlot (canvas, 10k+ points). Rebuilt when the series or theme change; resized with
 * the container. Colours come from the theme's categorical slots (--series-1…8); the live legend doubles as
 * the hover read-out. Non-finite values are drawn as gaps.
 */
import { useEffect, useRef } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import { useEffectiveTheme } from '../lib/theme.ts';
import { alignSeries, type ChartSeries } from './align.ts';

interface Props {
  series: ChartSeries[];
  xLabel: string;
  yLabel?: string;
  height?: number;
  title?: string;
  /** fixed y-axis range (default: fitted to the data) */
  yRange?: [number, number];
}

export function TimeSeriesChart({ series, xLabel, yLabel, height = 280, title, yRange }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const theme = useEffectiveTheme();
  const yMin = yRange?.[0];
  const yMax = yRange?.[1];

  useEffect(() => {
    const el = ref.current;
    if (!el || series.length === 0) return;
    const css = getComputedStyle(el);
    const v = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
    const axis = {
      stroke: v('--muted', '#5f6b7a'),
      grid: { stroke: v('--grid', '#e8ebef'), width: 1 },
      ticks: { stroke: v('--grid', '#e8ebef'), width: 1 },
    };
    const opts: uPlot.Options = {
      title,
      width: Math.max(200, el.clientWidth),
      height,
      scales: { x: { time: false }, ...(yMin !== undefined && yMax !== undefined ? { y: { range: [yMin, yMax] as [number, number] } } : {}) },
      axes: [
        { ...axis, label: xLabel },
        { ...axis, label: yLabel, size: 60 },
      ],
      series: [
        { label: xLabel },
        ...series.map((s) => ({
          label: s.label,
          stroke: v(`--series-${(s.slot % 8) + 1}`, '#2a78d6'),
          width: 2,
          dash: s.dash,
          points: { show: false },
        })),
      ],
      legend: { live: true },
      cursor: { drag: { x: true, y: false } },
    };
    const u = new uPlot(opts, alignSeries(series), el);
    const ro = new ResizeObserver(() => u.setSize({ width: Math.max(200, el.clientWidth), height }));
    ro.observe(el);
    return () => {
      ro.disconnect();
      u.destroy();
    };
  }, [series, xLabel, yLabel, height, title, yMin, yMax, theme]);

  return <div ref={ref} className="ts-chart" />;
}
