/**
 * Reference-mode sketch pad: draw the behaviour over time with the pointer across the model horizon; the
 * stroke becomes time-ascending [time, value] points. Inline (no dialog).
 */
import { useRef, useState, type PointerEvent } from 'react';
import { finalizeStroke, toData, toPixel, type Range } from '../lib/sketch.ts';

const W = 400;
const H = 170;

interface Props {
  start: number;
  stop: number;
  timeUnit: string;
  onSave: (points: [number, number][], name: string, label: Label) => void;
  onCancel: () => void;
}

export type Label = 'historical' | 'expected' | 'feared' | 'hoped';

export function SketchPad({ start, stop, timeUnit, onSave, onCancel }: Props) {
  const [yMin, setYMin] = useState('0');
  const [yMax, setYMax] = useState('100');
  const [name, setName] = useState('');
  const [label, setLabel] = useState<Label>('feared');
  const [raw, setRaw] = useState<[number, number][]>([]);
  const drawing = useRef(false);

  const lo = Number(yMin);
  const hi = Number(yMax);
  const rangeOk = Number.isFinite(lo) && Number.isFinite(hi) && hi > lo;
  const range: Range = { t0: start, t1: stop, yMin: rangeOk ? lo : 0, yMax: rangeOk ? hi : 100 };
  const points = finalizeStroke(raw, range);

  const at = (e: PointerEvent<SVGSVGElement>): [number, number] => {
    const r = e.currentTarget.getBoundingClientRect();
    return toData(e.clientX - r.left, e.clientY - r.top, { width: r.width, height: r.height }, range);
  };

  const path = (pts: [number, number][]) =>
    pts
      .map(([t, v], i) => {
        const [x, y] = toPixel(t, v, { width: W, height: H }, range);
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');

  return (
    <div className="sketch" data-testid="sketch-pad">
      <div className="row" style={{ marginBottom: 6 }}>
        <label className="field">
          <span>Name</span>
          <input
            type="text"
            value={name}
            maxLength={80}
            placeholder="e.g. Backlog (feared)"
            data-testid="sketch-name"
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="field" style={{ maxWidth: 120 }}>
          <span>Label</span>
          <select value={label} onChange={(e) => setLabel(e.target.value as Label)}>
            <option value="historical">Historical</option>
            <option value="expected">Expected</option>
            <option value="feared">Feared</option>
            <option value="hoped">Hoped</option>
          </select>
        </label>
        <label className="field" style={{ maxWidth: 70 }}>
          <span>Y min</span>
          <input
            type="text"
            inputMode="decimal"
            value={yMin}
            aria-invalid={!rangeOk || undefined}
            onChange={(e) => setYMin(e.target.value)}
          />
        </label>
        <label className="field" style={{ maxWidth: 70 }}>
          <span>Y max</span>
          <input
            type="text"
            inputMode="decimal"
            value={yMax}
            aria-invalid={!rangeOk || undefined}
            onChange={(e) => setYMax(e.target.value)}
          />
        </label>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`Sketch area: time ${start} to ${stop} ${timeUnit} horizontally, value vertically`}
        data-testid="sketch-area"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          drawing.current = true;
          setRaw([at(e)]);
        }}
        onPointerMove={(e) => {
          if (drawing.current) {
            const p = at(e);
            setRaw((r) => [...r, p]);
          }
        }}
        onPointerUp={() => {
          drawing.current = false;
        }}
      >
        <line className="axis" x1="0" y1={H - 0.5} x2={W} y2={H - 0.5} />
        <line className="axis" x1="0.5" y1="0" x2="0.5" y2={H} />
        <text className="tick" x="4" y="12">
          {range.yMax}
        </text>
        <text className="tick" x="4" y={H - 6}>
          {range.yMin}
        </text>
        <text className="tick" x={W - 4} y={H - 6} textAnchor="end">
          {stop} {timeUnit}
        </text>
        {points.length > 1 && <path className="stroke" d={path(points)} vectorEffect="non-scaling-stroke" />}
      </svg>
      <div className="row" style={{ marginTop: 6 }}>
        <span className="note" style={{ margin: 0 }}>
          {points.length > 1 ? `${points.length} points` : 'Draw the behaviour over time with the mouse or pen.'}
        </span>
        <span style={{ flex: 1 }} />
        <button type="button" className="btn" onClick={() => setRaw([])} disabled={raw.length === 0}>
          Clear
        </button>
        <button type="button" className="btn" onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          className="btn primary"
          data-testid="sketch-save"
          disabled={points.length < 2 || !rangeOk}
          onClick={() => onSave(points, name.trim() || 'Sketched reference mode', label)}
        >
          Save reference mode
        </button>
      </div>
    </div>
  );
}
