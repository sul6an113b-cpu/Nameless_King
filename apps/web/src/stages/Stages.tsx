/** Stage bodies. Each stage shows only its own tools (BRIEF: workflow rail). */
import { CldCanvas } from '../canvas/CldCanvas.tsx';
import { SfdCanvas } from '../canvas/SfdCanvas.tsx';
import { HealthPanel } from '../quantify/HealthPanel.tsx';

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

function Upcoming({ items, note }: { items: string[]; note: string }) {
  return (
    <div className="stage-scroll">
      <section className="card" style={{ maxWidth: 640 }}>
        <h2>Coming in the next build phase</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          {note}
        </p>
        <ul>
          {items.map((i) => (
            <li key={i}>{i}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}

export function AnalyzeStage() {
  return (
    <Upcoming
      note="Structural analysis of the causal map you build in Map."
      items={[
        'Every feedback loop, classified reinforcing (R) or balancing (B), named and highlightable',
        'Loop participation and betweenness per variable',
        'Archetype candidates to confirm or reject',
        'Structural leverage map with a Pareto view',
      ]}
    />
  );
}

export function DecideStage() {
  return (
    <Upcoming
      note="Turn the analysis into a decision brief."
      items={[
        'Interventions tagged with their Meadows leverage level, each tested as a scenario',
        'Side-by-side KPI comparison',
        'Report preview and export (Markdown, print to PDF) in pyramid order',
      ]}
    />
  );
}
