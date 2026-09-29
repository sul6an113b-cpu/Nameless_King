/** Phase-1 app shell (owner: canvas-ui from Phase 2): top bar, workflow rail, work area, right dock. */
import { useState } from 'react';
import type { Stage } from '@looplab/core';
import { STAGES } from './stages.ts';
import { useModelStore } from './state/store.ts';
import { CopilotPanel } from './copilot/index.ts';

export function App() {
  const [stage, setStage] = useState<Stage>('frame');
  const [dockTab, setDockTab] = useState<'inspector' | 'copilot'>('inspector');
  const modelName = useModelStore((s) => s.model.name);
  const current = STAGES.find((s) => s.id === stage) ?? STAGES[0];

  return (
    <div className="app">
      <header className="topbar">
        <strong className="brand">LoopLab</strong>
        <span className="model-name">{modelName}</span>
      </header>
      <nav className="rail" aria-label="Workflow stages">
        {STAGES.map((s) => (
          <button
            key={s.id}
            type="button"
            data-testid={`stage-${s.id}`}
            className={s.id === stage ? 'rail-item active' : 'rail-item'}
            aria-current={s.id === stage ? 'step' : undefined}
            title={s.hint}
            onClick={() => setStage(s.id)}
          >
            {s.label}
          </button>
        ))}
      </nav>
      <main className="work" aria-label={`${current?.label ?? ''} stage`}>
        <h1>{current?.label}</h1>
        <p className="muted">{current?.hint}</p>
      </main>
      <aside className="dock">
        <div className="dock-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={dockTab === 'inspector'} onClick={() => setDockTab('inspector')}>
            Inspector
          </button>
          <button type="button" role="tab" aria-selected={dockTab === 'copilot'} onClick={() => setDockTab('copilot')}>
            Copilot
          </button>
        </div>
        {dockTab === 'copilot' ? <CopilotPanel /> : <p className="muted">Select an element to edit it.</p>}
      </aside>
    </div>
  );
}
