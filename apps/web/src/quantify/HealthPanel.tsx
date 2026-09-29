/**
 * Model Health (SPEC §6.4): runs `runHealth` on the current model (deferred, so typing stays responsive) and
 * lists items by severity; clicking an item selects its elements on the canvas. The DT/2 integration-error
 * test is an advanced, opt-in check.
 */
import { useDeferredValue, useMemo, useState } from 'react';
import type { HealthItem } from '@looplab/core';
import { Unavailable } from '../components/fields.tsx';
import { health } from '../lib/engine.ts';
import { useModelStore } from '../state/store.ts';
import { useUiStore } from '../state/ui.ts';

const ORDER: Record<HealthItem['severity'], number> = { error: 0, warning: 1, info: 2 };
const SEV_LABEL: Record<HealthItem['severity'], string> = { error: 'Error', warning: 'Warning', info: 'Info' };

export function HealthPanel() {
  const model = useDeferredValue(useModelStore((s) => s.model));
  const [open, setOpen] = useState(true);
  const [integration, setIntegration] = useState(false);
  const report = useMemo(() => health(model, integration), [model, integration]);

  const items =
    report.status === 'ok' ? [...report.value.items].sort((a, b) => ORDER[a.severity] - ORDER[b.severity]) : [];
  const count = (s: HealthItem['severity']) => items.filter((i) => i.severity === s).length;

  return (
    <section className="health" data-testid="health-panel" aria-label="Model Health">
      <div className="health-head">
        <button
          type="button"
          className="btn ghost icon small"
          aria-expanded={open}
          aria-label={open ? 'Collapse Model Health' : 'Expand Model Health'}
          onClick={() => setOpen(!open)}
        >
          {open ? '▾' : '▸'}
        </button>
        <h2>Model Health</h2>
        {report.status === 'ok' && (
          <span className="health-counts">
            {report.value.ok && items.length === 0 ? (
              <span className="chip ok">✓ No issues</span>
            ) : (
              <>
                <span className="sev error">{count('error')} errors</span>
                <span className="sev warning">{count('warning')} warnings</span>
                <span className="sev info">{count('info')} info</span>
              </>
            )}
          </span>
        )}
        <label
          className="check"
          style={{ marginLeft: 'auto' }}
          title="Re-run at DT/2 and flag stocks whose results differ by more than the tolerance"
        >
          <input type="checkbox" checked={integration} onChange={(e) => setIntegration(e.target.checked)} />
          Integration-error test (DT vs DT/2)
        </label>
      </div>
      {open && (
        <div style={{ padding: '0 12px 8px', overflow: 'auto' }}>
          {report.status === 'unavailable' && <Unavailable what="Model Health" />}
          {report.status === 'error' && <p className="error-text">Model Health failed: {report.message}</p>}
          {report.status === 'ok' && items.length > 0 && (
            <ul className="health-list">
              {items.map((item, i) => (
                <li key={i}>
                  <button
                    type="button"
                    className="health-item"
                    data-testid={`health-item-${i}`}
                    onClick={() => useUiStore.getState().select(item.elementIds)}
                    title={item.elementIds.length ? 'Select the elements involved' : undefined}
                  >
                    <span className={`sev ${item.severity}`}>{SEV_LABEL[item.severity]}</span>
                    <span>{item.message}</span>
                    <span className="health-check">{item.check}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
