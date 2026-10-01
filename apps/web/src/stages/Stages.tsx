/** Stage bodies. Each stage shows only its own tools (BRIEF: workflow rail). */
import { AnalyzeStage } from '../analyze/AnalyzeStage.tsx';
import { DecideStage } from '../decide/DecideStage.tsx';
import { CldCanvas } from '../canvas/CldCanvas.tsx';
import { SfdCanvas } from '../canvas/SfdCanvas.tsx';
import { HealthPanel } from '../quantify/HealthPanel.tsx';

export { AnalyzeStage, DecideStage };

export function MapStage() {
  return (
    <div className="stage-body">
      <CldCanvas />
    </div>
  );
}

export function QuantifyStage() {
  return (
    <div className="stage-body">
      <SfdCanvas />
      <HealthPanel />
    </div>
  );
}
