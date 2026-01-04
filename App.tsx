import React, { useCallback, useMemo, useEffect } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  Edge,
  Node,
  BackgroundVariant,
  ReactFlowProvider,
} from 'reactflow';

import { LoadPSDNode } from './components/LoadPSDNode';
import { TargetTemplateNode } from './components/TargetTemplateNode';
import { TargetSplitterNode } from './components/TargetSplitterNode';
import { DesignInfoNode } from './components/DesignInfoNode';
import { TemplateSplitterNode } from './components/TemplateSplitterNode';
import { ContainerResolverNode } from './components/ContainerResolverNode';
import { RemapperNode } from './components/RemapperNode';
import { DesignAnalystNode } from './components/DesignAnalystNode'; 
import { ExportPSDNode } from './components/ExportPSDNode';
import { KnowledgeNode } from './components/KnowledgeNode'; 
import { KnowledgeInspectorNode } from './components/KnowledgeInspectorNode';
import { DesignReviewerNode } from './components/DesignReviewerNode';
import { ContainerPreviewNode } from './components/ContainerPreviewNode'; 
import { ProjectControls } from './components/ProjectControls';
import { PSDNodeData } from './types';
import { ProceduralStoreProvider } from './store/ProceduralContext';

const INITIAL_NODES: Node<PSDNodeData>[] = [
  // 1. Knowledge Column (X: ~90)
  {
    id: 'node-knowledge-1',
    type: 'knowledge',
    position: { x: 92, y: -350 },
    data: { fileName: null, template: null, validation: null, designLayers: null },
  },
  
  // 2. Inspector Column (X: 450 - Aligned with Col 2)
  {
    id: 'node-inspector-1',
    type: 'knowledgeInspector',
    position: { x: 450, y: -350 },
    data: { fileName: null, template: null, validation: null, designLayers: null },
  },

  // 3. Source Column (X: 50)
  {
    id: 'node-1', // Load PSD
    type: 'loadPsd',
    position: { x: 50, y: 50 },
    data: { fileName: null, template: null, validation: null, designLayers: null },
  },
  {
    id: 'node-target-1',
    type: 'targetTemplate',
    position: { x: 50, y: 450 },
    data: { fileName: null, template: null, validation: null, designLayers: null },
  },

  // 4. Structure & Metadata Column (X: 450)
  {
    id: 'node-info-1',
    type: 'designInfo',
    position: { x: 450, y: 50 },
    data: { fileName: null, template: null, validation: null, designLayers: null },
  },
  {
    id: 'node-template-splitter-1',
    type: 'templateSplitter',
    position: { x: 450, y: 450 },
    data: { fileName: null, template: null, validation: null, designLayers: null },
  },

  // 5. Logic & Resolution Column (X: 870 - shifted for spacing)
  {
    id: 'node-resolver-1',
    type: 'containerResolver',
    position: { x: 870, y: 50 },
    data: { 
      fileName: null, 
      template: null, 
      validation: null, 
      designLayers: null,
      channelCount: 10 
    },
  },
  {
    id: 'node-target-splitter-1',
    type: 'targetSplitter',
    position: { x: 870, y: 450 },
    data: { fileName: null, template: null, validation: null, designLayers: null },
  },

  // 6. Procedural Intelligence Pipeline (Linear Flow)
  {
    id: 'node-analyst-1', 
    type: 'designAnalyst',
    position: { x: 1562, y: 248 },
    data: { fileName: null, template: null, validation: null, designLayers: null },
    style: { width: 650 },
  },
  {
    id: 'node-remapper-1',
    type: 'remapper',
    position: { x: 2300, y: 248 }, // Adjusted to 2300 (buffer > 80px from Analyst end at 2212)
    data: { 
      fileName: null, 
      template: null, 
      validation: null, 
      designLayers: null, 
      remapperConfig: { targetContainerName: null },
      instanceCount: 1 
    },
    style: { width: 500 }
  },
  {
    id: 'node-reviewer-1', 
    type: 'designReviewer',
    position: { x: 2900, y: 248 }, // Adjusted to 2900 (buffer > 100px from Remapper end at 2800)
    data: { 
        fileName: null, template: null, validation: null, designLayers: null,
        instanceCount: 1 
    },
    style: { width: 480 }
  },
  {
    id: 'node-preview-1',
    type: 'containerPreview',
    position: { x: 3500, y: 248 }, // Adjusted to 3500 (buffer > 120px from Reviewer end at 3380)
    data: { fileName: null, template: null, validation: null, designLayers: null },
    style: { width: 650, height: 500 },
  },
  {
    id: 'node-export-1',
    type: 'exportPsd',
    position: { x: 4250, y: 248 }, // Adjusted to 4250 (buffer > 100px from Preview end at 4150)
    data: { fileName: null, template: null, validation: null, designLayers: null },
  }
];

const INITIAL_EDGES: Edge[] = [
    // Source -> Info
    { id: 'e-load-info', source: 'node-1', target: 'node-info-1' },
    // Source -> Template Splitter
    { id: 'e-load-template-splitter', source: 'node-1', target: 'node-template-splitter-1' },
    // Target Template -> Target Splitter
    { 
      id: 'e-target-target-splitter', 
      source: 'node-target-1', 
      target: 'node-target-splitter-1', 
      sourceHandle: 'target-metadata-out',
      targetHandle: 'template-input'
    },
    // Knowledge -> Inspector
    {
      id: 'e-knowledge-inspector',
      source: 'node-knowledge-1',
      target: 'node-inspector-1',
      sourceHandle: 'knowledge-out',
      targetHandle: 'knowledge-in'
    }
];

const getInitialNodes = (): Node<PSDNodeData>[] => {
  try {
    const saved = localStorage.getItem('psd_graph_layout');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (err) {
    console.warn("Failed to retrieve graph layout from storage", err);
  }
  return INITIAL_NODES;
};

const App: React.FC = () => {
  const [nodes, setNodes, onNodesChange] = useNodesState(getInitialNodes());
  const [edges, setEdges, onEdgesChange] = useEdgesState(INITIAL_EDGES);

  // Persistence logic for layout state
  useEffect(() => {
    const saveLayout = setTimeout(() => {
        if (nodes.length > 0) {
            localStorage.setItem('psd_graph_layout', JSON.stringify(nodes));
        }
    }, 1000); // Debounce saves
    return () => clearTimeout(saveLayout);
  }, [nodes]);

  const onConnect = useCallback(
    (params: Connection) => {
      // 1. Validation Logic
      // Resolve source and target nodes to check their types
      const sourceNode = nodes.find((n) => n.id === params.source);
      const targetNode = nodes.find((n) => n.id === params.target);

      if (sourceNode && targetNode) {
        // Target Splitter Validation Rules
        if (targetNode.type === 'targetSplitter') {
          // Check if connecting to the Template Input handle
          if (params.targetHandle === 'template-input') {
             // Constraint: Template Input expects a TargetTemplateNode
             if (sourceNode.type !== 'targetTemplate') {
               console.warn("Invalid Connection: Target Splitter 'Template Input' requires a Target Template source.");
               return;
             }
          }
          // Note: Target Splitter Slots can connect to DesignAnalyst OR Remapper
        }
        
        // Remapper Validation Rules (Dynamic Multi-Instance)
        if (targetNode.type === 'remapper') {
            const handle = params.targetHandle || '';
            
            // Allow dynamic Target Template Slots
            if (handle.startsWith('target-in-')) {
                 // Remapper accepts Target Splitter OR Design Analyst (Proxy)
                 if (sourceNode.type !== 'targetSplitter' && sourceNode.type !== 'designAnalyst') {
                     console.warn("Remapper 'Target' input requires a Target Splitter or Design Analyst.");
                     return;
                 }
            } 
            // Allow dynamic Content Sources
            else if (handle.startsWith('source-in-')) {
                 // Remapper accepts Container Resolver OR Design Analyst (Proxy)
                 if (sourceNode.type !== 'containerResolver' && sourceNode.type !== 'designAnalyst') {
                     console.warn("Remapper 'Source' input requires a Container Resolver or Design Analyst.");
                     return;
                 }
            }
        }

        // Design Analyst Validation Rules
        if (targetNode.type === 'designAnalyst') {
            const handle = params.targetHandle || '';

            if (handle === 'knowledge-in') {
                if (sourceNode.type !== 'knowledge') {
                    console.warn("Design Analyst 'Knowledge' input requires a Knowledge Node source.");
                    return;
                }
            } else if (handle.startsWith('source-in')) {
                if (sourceNode.type !== 'containerResolver') {
                    console.warn("Design Analyst 'Source' requires a Container Resolver.");
                    return;
                }
            } else if (handle.startsWith('target-in')) {
                if (sourceNode.type !== 'targetSplitter') {
                    console.warn("Design Analyst 'Target' requires a Target Splitter.");
                    return;
                }
            }
        }

        // Knowledge Inspector Validation Rules
        if (targetNode.type === 'knowledgeInspector') {
            if (params.targetHandle === 'knowledge-in') {
                if (sourceNode.type !== 'knowledge') {
                    console.warn("Knowledge Inspector requires a Knowledge Node source.");
                    return;
                }
            }
        }

        // Design Reviewer Validation Rules
        if (targetNode.type === 'designReviewer') {
            const handle = params.targetHandle || '';

            if (handle.startsWith('payload-in')) {
                // Accepts output from Remapper OR Container Resolver (Direct Bridge Exception)
                if (sourceNode.type !== 'remapper' && sourceNode.type !== 'containerResolver') {
                    console.warn("Reviewer 'Payload Input' requires a Remapper or Container Resolver source.");
                    return;
                }
            } else if (handle.startsWith('target-in')) {
                // Accepts Target Splitter (context definition)
                if (sourceNode.type !== 'targetSplitter') {
                    console.warn("Reviewer 'Target Input' requires a Target Splitter.");
                    return;
                }
            }
        }

        // Container Preview Validation Rules (UPDATED for Multi-Instance)
        if (targetNode.type === 'containerPreview') {
            const handle = params.targetHandle || '';

            if (handle.startsWith('payload-in')) {
                // Accepts output from DesignReviewer (Polished) or Remapper (Draft)
                // Strict flow: Remapper -> Reviewer -> Preview
                if (sourceNode.type !== 'designReviewer' && sourceNode.type !== 'remapper') {
                    console.warn("Preview 'Payload Input' requires a Design Reviewer or Remapper source.");
                    return;
                }
            } else if (handle.startsWith('target-in')) {
                // Needs target definition to draw bounds accurately
                if (sourceNode.type !== 'targetSplitter') {
                    console.warn("Preview 'Target Input' requires a Target Splitter.");
                    return;
                }
            }
        }

        // Export Node Validation Update (PHASE 4: STRICT GATE)
        // Updated to include 'containerPreview' as a valid polished source
        if (targetNode.type === 'exportPsd' && params.targetHandle?.startsWith('input-')) {
            // STRICT PRODUCTION GATE: Only accept DesignReviewer OR ContainerPreview
            if (sourceNode.type !== 'designReviewer' && sourceNode.type !== 'containerPreview') {
                console.error(`[PIPELINE VIOLATION] Export Gate Locked. Input must come from 'DesignReviewer' or 'ContainerPreview'. Attempted source: ${sourceNode.type}`);
                alert("⛔ PIPELINE ENFORCEMENT: The Export Node strictly requires a 'Design Reviewer' or 'Container Preview' connection. Direct connections from Remapper or Resolvers are prohibited in Production Mode.");
                return;
            }
        }
      }

      // 2. Apply Connection
      setEdges((eds) => {
        // Logic: Ensure only one edge connects to any given target handle.
        // Intercept connection and remove any existing edge on the specific target handle.
        const targetHandle = params.targetHandle || null;
        
        // Exception: Export Node Assembly Input allows multiple connections
        const isMultiInput = targetNode?.type === 'exportPsd' && targetHandle === 'assembly-input';

        const cleanEdges = isMultiInput ? eds : eds.filter((edge) => {
          const edgeTargetHandle = edge.targetHandle || null;
          // Keep the edge if it targets a different node OR a different handle on the same node
          return edge.target !== params.target || edgeTargetHandle !== targetHandle;
        });
        
        return addEdge(params, cleanEdges);
      });
    },
    [nodes, setEdges]
  );

  // Register custom node types
  const nodeTypes = useMemo(() => ({
    loadPsd: LoadPSDNode,
    targetTemplate: TargetTemplateNode,
    targetSplitter: TargetSplitterNode,
    designInfo: DesignInfoNode,
    templateSplitter: TemplateSplitterNode,
    containerResolver: ContainerResolverNode,
    remapper: RemapperNode,
    designAnalyst: DesignAnalystNode, 
    designReviewer: DesignReviewerNode,
    containerPreview: ContainerPreviewNode, 
    exportPsd: ExportPSDNode,
    knowledge: KnowledgeNode,
    knowledgeInspector: KnowledgeInspectorNode, 
  }), []);

  return (
    <ProceduralStoreProvider>
      <div className="w-screen h-screen bg-slate-900">
        <ReactFlowProvider>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            nodeTypes={nodeTypes}
            fitView
            className="bg-slate-900"
          >
            <Background variant={BackgroundVariant.Dots} gap={12} size={1} color="#334155" />
            <Controls className="bg-slate-800 border-slate-700 fill-slate-200" />
            <MiniMap 
              className="bg-slate-800 border-slate-700" 
              nodeColor="#475569" 
              maskColor="rgba(15, 23, 42, 0.6)"
            />
            
            <div className="absolute top-4 left-4 z-10 pointer-events-none">
              <h1 className="text-2xl font-bold text-slate-100 tracking-tight">
                PSD Procedural Logic Engine
              </h1>
              <p className="text-slate-400 text-sm">
                Procedural generation graph for Adobe Photoshop files
              </p>
            </div>
          </ReactFlow>
          <ProjectControls />
        </ReactFlowProvider>
      </div>
    </ProceduralStoreProvider>
  );
};

export default App;