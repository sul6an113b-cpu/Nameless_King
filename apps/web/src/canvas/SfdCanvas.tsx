/** Quantify stage: the stock-and-flow diagram — the same model seen through the SFD lens. */
import { useMemo } from 'react';
import { Background, ConnectionMode, Controls, ReactFlow, type Connection, type Edge } from '@xyflow/react';
import { useCopilotStore } from '../copilot/index.ts';
import { useEffectiveTheme } from '../lib/theme.ts';
import { useModelStore } from '../state/store.ts';
import { useUiStore } from '../state/ui.ts';
import { connectSfd } from './actions.ts';
import { buildSfd } from './build.ts';
import { CanvasExporter, CanvasKeys, CanvasToolbar } from './CanvasChrome.tsx';
import { buildGhosts } from './ghosts.ts';
import { onLinkModeClick, onRenameDoubleClick } from './interaction.ts';
import { edgeTypes, sfdNodeTypes } from './types.ts';
import { useDiagram } from './useDiagram.ts';

const onConnect = (c: Connection) => {
  if (c.source && c.target) connectSfd(c.source, c.target);
};

/** Clicking a pipe selects its flow. */
const onEdgeClick = (_e: unknown, edge: Edge) => {
  if (edge.type !== 'pipe') return;
  const flowId = edge.id.split(':')[1];
  if (flowId) useUiStore.getState().select([flowId]);
};

export function SfdCanvas() {
  const model = useModelStore((s) => s.model);
  const pendingPatch = useCopilotStore((s) => s.pendingPatch);
  const decisions = useCopilotStore((s) => s.decisions);
  const linkSource = useUiStore((s) => s.linkSource);
  const theme = useEffectiveTheme();

  const overlay = useMemo(() => buildGhosts(model, pendingPatch, decisions), [model, pendingPatch, decisions]);
  const built = useMemo(() => buildSfd(model, overlay, linkSource), [model, overlay, linkSource]);
  const { nodes, edges, onNodesChange, onEdgesChange, onNodeDragStop } = useDiagram(built.nodes, built.edges, 'sfd');

  return (
    <div className="canvas" data-testid="canvas-sfd">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={sfdNodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDragStop={onNodeDragStop}
        onConnect={onConnect}
        onEdgeClick={onEdgeClick}
        onNodeClick={(_e, node) => onLinkModeClick(node, connectSfd)}
        onNodeDoubleClick={(_e, node) => onRenameDoubleClick(node)}
        connectionMode={ConnectionMode.Loose}
        deleteKeyCode={null}
        disableKeyboardA11y
        zoomOnDoubleClick={false}
        elevateEdgesOnSelect
        fitView
        fitViewOptions={{ padding: 0.2, maxZoom: 1.2 }}
        minZoom={0.15}
        maxZoom={2.5}
        colorMode={theme}
      >
        <Background gap={24} size={1} />
        <Controls showInteractive={false} position="bottom-left" />
        <CanvasToolbar lens="sfd" />
        <CanvasKeys lens="sfd" />
        <CanvasExporter lens="sfd" />
      </ReactFlow>
      {model.variables.length === 0 && !overlay && (
        <div className="canvas-empty" aria-hidden="true">
          <p>
            Add stocks and flows, then drag from a flow valve’s dot to a stock (or from a stock to a valve) to connect
            the pipe.
          </p>
        </div>
      )}
    </div>
  );
}
