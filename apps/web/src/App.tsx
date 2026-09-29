/**
 * App shell (SPEC §8): top bar (44 px) · workflow rail (64 px) · stage work area · right dock (340 px,
 * Inspector | Copilot, collapsible). Each stage shows only its own tools; nothing common opens a modal.
 */
import { useEffect } from 'react';
import { FileErrorBanner, Dock, Rail, Toasts } from './components/Shell.tsx';
import { TopBar } from './components/TopBar.tsx';
import { applyTheme } from './lib/theme.ts';
import { useGlobalKeys } from './lib/useGlobalKeys.ts';
import { STAGES } from './stages.ts';
import { FrameStage } from './stages/FrameStage.tsx';
import { AnalyzeStage, DecideStage, MapStage, QuantifyStage } from './stages/Stages.tsx';
import { TestStage } from './stages/TestStage.tsx';
import { useUiStore } from './state/ui.ts';

const BODY = {
  frame: FrameStage,
  map: MapStage,
  analyze: AnalyzeStage,
  quantify: QuantifyStage,
  test: TestStage,
  decide: DecideStage,
};

export function App() {
  const stage = useUiStore((s) => s.stage);
  const dockOpen = useUiStore((s) => s.dockOpen);
  const theme = useUiStore((s) => s.theme);
  useEffect(() => applyTheme(theme), [theme]);
  useGlobalKeys();

  const current = STAGES.find((s) => s.id === stage) ?? STAGES[0];
  const Body = BODY[stage];

  return (
    <div className={dockOpen ? 'app' : 'app dock-closed'}>
      <TopBar />
      <Rail />
      <main className="work" aria-label={`${current?.label ?? ''} stage`} data-stage={stage}>
        <div className="stage-head">
          <h1>{current?.label}</h1>
          <span className="stage-hint">{current?.hint}</span>
        </div>
        <FileErrorBanner />
        <Body />
        <Toasts />
      </main>
      {dockOpen && <Dock />}
    </div>
  );
}
