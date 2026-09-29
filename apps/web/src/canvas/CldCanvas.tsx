/** Map stage: the causal loop diagram — a projection of the model (all variables, all links). */
import { useMemo } from 'react';
import { Background, ConnectionMode, Controls, ReactFlow, type Connection } from '@xyflow/react';
import { useCopilotStore } from '../copilot/index.ts';
import { useEffectiveTheme } from '../lib/theme.ts';
import { useModelStore } from '../state/store.ts';
import { useUiStore } from '../state/ui.ts';
import { createLink } from './actions.ts';
import { buildCld } from './build.ts';
import { CanvasExporter, CanvasKeys, CanvasToolbar } from './CanvasChrome.tsx';
import { buildGhosts } from './ghosts.ts';
import { onLinkModeClick, onRenameDoubleClick } from './interaction.ts';
import { cldNodeTypes, edgeTypes } from './types.ts';
import { useDiagram } from './useDiagram.ts';

const onConnect = (c: Connection) => {
  if (c.source && c.target) createLink(c.source, c.target);
};

export function CldCanvas() {
  const model = useModelStore((s) => s.model);
  const pendingPatch = useCopilotStore((s) => s.pendingPatch);
  const decisions = useCopilotStore((s) => s.decisions);
  const linkSource = useUiStore((s) => s.linkSource);
  const theme = useEffectiveTheme();

  const overlay = useMemo(() => buildGhosts(model, pendingPatch, decisions), [model, pendingPatch, decisions]);
  const built = useMemo(() => buildCld(model, overlay, linkSource), [model, overlay, linkSource]);
  const { nodes, edges, onNodesChange, onEdgesChange, onNodeDragStop } = useDiagram(built.nodes, built.edges, 'cld');

  return (
    <div className="canvas" data-testid="canvas-cld">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={cldNodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDragStop={onNodeDragStop}
        onConnect={onConnect}
        onNodeClick={(_e, node) => onLinkModeClick(node, createLink)}
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
        <CanvasToolbar lens="cld" />
        <CanvasKeys lens="cld" />
        <CanvasExporter lens="cld" />
      </ReactFlow>
      {model.variables.length === 0 && !overlay && (
        <div className="canvas-empty" aria-hidden="true">
          <p>
            Start mapping: press <kbd>A</kbd> or “+ Variable”, then drag from a node’s dot to link cause → effect.
          </p>
        </div>
      )}
    </div>
  );
}
