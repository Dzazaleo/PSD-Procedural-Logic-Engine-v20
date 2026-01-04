import React, { memo, useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { Handle, Position, NodeProps, useEdges, NodeResizer, useUpdateNodeInternals, useReactFlow } from 'reactflow';
import { PSDNodeData, TransformedPayload } from '../types';
import { useProceduralStore } from '../store/ProceduralContext';
import { compositePayloadToCanvas } from '../services/psdService';
import { Layers, Maximize, Scan, RotateCw, ShieldCheck, FileWarning, Plus, MonitorPlay } from 'lucide-react';

// --- SUB-COMPONENT: Preview Instance Row ---
const PreviewInstanceRow = memo(({ index, nodeId }: { index: number, nodeId: string }) => {
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const lastPayloadRef = useRef<string | null>(null);

    const edges = useEdges();
    const { 
        payloadRegistry, 
        reviewerRegistry, 
        psdRegistry, 
        registerPreviewPayload,
        globalVersion,
        triggerGlobalRefresh
    } = useProceduralStore();

    // 1. Resolve Incoming Payload
    const incomingPayload = useMemo(() => {
        const edge = edges.find(e => e.target === nodeId && e.targetHandle === `payload-in-${index}`);
        if (!edge) return null;

        // Check Reviewer (Polished) first, then Standard Payload (Draft)
        const reviewerData = reviewerRegistry[edge.source];
        if (reviewerData && reviewerData[edge.sourceHandle || '']) {
            return reviewerData[edge.sourceHandle || ''];
        }

        const rawData = payloadRegistry[edge.source];
        if (rawData && rawData[edge.sourceHandle || '']) {
            return rawData[edge.sourceHandle || ''];
        }

        return null;
    }, [edges, nodeId, index, payloadRegistry, reviewerRegistry]);

    // 2. Render Effect & Proxy Logic
    useEffect(() => {
        if (!incomingPayload) {
            setPreviewUrl(null);
            setError(null);
            return;
        }

        const psd = psdRegistry[incomingPayload.sourceNodeId];
        
        // BINARY DETECTION LOGIC
        if (!psd) {
            setError('BINARY_MISSING');
            setIsLoading(false);
            // Don't register invalid payloads
            return;
        }

        if (error === 'BINARY_MISSING') {
            setError(null);
        }

        const payloadSignature = JSON.stringify({
            metrics: incomingPayload.metrics,
            layers: incomingPayload.layers,
            id: incomingPayload.generationId,
            gv: globalVersion,
            isPolished: incomingPayload.isPolished // Track polish state
        });

        if (lastPayloadRef.current === payloadSignature && !error && previewUrl) {
            return; 
        }
        lastPayloadRef.current = payloadSignature;

        setIsLoading(true);

        let isMounted = true;

        compositePayloadToCanvas(incomingPayload, psd)
            .then((url) => {
                if (isMounted && url) {
                    setPreviewUrl(url);
                    setIsLoading(false);
                    setError(null);
                    
                    // PROXY LOGIC:
                    // Only proxy to reviewerRegistry if we have a valid render.
                    // If incoming payload is "geometric" (not polished), this registration will usually promote it to polished.
                    // However, if the intent is to stop proxying when "no longer polished", we must ensure we respect the geometric state if reset.
                    // Since Preview Node ACTS as a polish gate, it should output a polished version of whatever it renders.
                    // The "Reset" happens upstream. If upstream resets, incomingPayload becomes geometric. 
                    // This effect runs, renders the geometric view, and outputs it as verified (polished) geometric layout.
                    // This is correct behavior for a production gate.
                    registerPreviewPayload(nodeId, `payload-out-${index}`, incomingPayload, url);
                }
            })
            .catch(err => {
                console.error("Preview Render Failed:", err);
                if (isMounted) {
                    setError('RENDER_FAILED');
                    setIsLoading(false);
                    // On failure, do not register/proxy corrupt data
                }
            });

        return () => { isMounted = false; };

    }, [incomingPayload, psdRegistry, nodeId, index, registerPreviewPayload, globalVersion]);

    const getLayerCount = (payload: TransformedPayload) => {
        let count = 0;
        const traverse = (layers: any[]) => {
            layers.forEach(l => {
                count++;
                if (l.children) traverse(l.children);
            });
        };
        traverse(payload.layers);
        return count;
    };

    const layerCount = incomingPayload ? getLayerCount(incomingPayload) : 0;
    const isPolished = incomingPayload?.isPolished;

    // Use safe zone bounds if available for accurate dimension readout
    const targetW = incomingPayload ? (incomingPayload.targetBounds?.w ?? incomingPayload.metrics.target.w) : 0;
    const targetH = incomingPayload ? (incomingPayload.targetBounds?.h ?? incomingPayload.metrics.target.h) : 0;

    return (
        <div className="relative border-b border-emerald-900/30 bg-slate-900/20 p-2 flex flex-col space-y-2 first:rounded-t-none">
            {/* ABSOLUTE DOCKED HANDLES (Left Edge) */}
            <Handle 
                type="target" 
                position={Position.Left} 
                id={`payload-in-${index}`} 
                className="!absolute !-left-1.5 !top-12 !w-3 !h-3 !rounded-full !bg-indigo-500 !border-2 !border-slate-900 z-50 hover:scale-125 transition-transform" 
                title="Input: Transformed Payload" 
            />
            <Handle 
                type="target" 
                position={Position.Left} 
                id={`target-in-${index}`} 
                className="!absolute !-left-1.5 !top-20 !w-3 !h-3 !rounded-full !bg-emerald-500 !border-2 !border-slate-900 z-50 hover:scale-125 transition-transform" 
                title="Input: Target Definition" 
            />

            {/* Row Header */}
            <div className="flex items-center justify-between px-2 pt-1 h-8">
                <div className="flex items-center space-x-2">
                    <div className={`w-2 h-2 rounded-full ${incomingPayload ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]' : 'bg-slate-700'}`}></div>
                    <span className="text-[11px] font-bold text-emerald-100 uppercase tracking-widest truncate max-w-[200px]">
                        {incomingPayload?.targetContainer || `Monitor ${index + 1}`}
                    </span>
                </div>

                <div className="flex items-center space-x-2 relative">
                     {isPolished && (
                         <span className="flex items-center gap-1 text-[8px] bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded border border-emerald-500/30 font-bold uppercase tracking-widest backdrop-blur-sm">
                             <ShieldCheck className="w-2.5 h-2.5" /> Verified
                         </span>
                     )}
                     
                     {/* ABSOLUTE OUTPUT HANDLE (Right Edge - Top Aligned in Row) */}
                     <Handle 
                        type="source" 
                        position={Position.Right} 
                        id={`payload-out-${index}`} 
                        className="!absolute !-right-3.5 !top-1/2 !-translate-y-1/2 !w-3 !h-3 !rounded-full !bg-emerald-500 !border-2 !border-slate-800 shadow-[0_0_8px_rgba(16,185,129,0.5)] z-50 hover:scale-125 transition-transform" 
                        title="Output: Validated Payload" 
                    />
                </div>
            </div>

            {/* Main Visual Stage (Safe-Zone Rendering) */}
            <div className="flex-1 relative flex items-center justify-center p-4 min-h-[300px] overflow-hidden rounded border border-emerald-900/30 shadow-inner group/stage">
                 
                 {/* Empty State */}
                 {!incomingPayload && (
                     <div className="flex flex-col items-center text-slate-600 z-10">
                         <Scan className="w-8 h-8 mb-2 opacity-30" />
                         <span className="text-[10px] font-mono uppercase tracking-widest opacity-60">Awaiting Signal</span>
                     </div>
                 )}

                 {/* Error States */}
                 {error === 'BINARY_MISSING' && (
                     <div className="absolute inset-0 bg-orange-950/60 backdrop-blur-sm flex flex-col items-center justify-center z-20 p-4 text-center">
                         <FileWarning className="w-8 h-8 text-orange-500 mb-2 animate-bounce" />
                         <span className="text-xs font-bold text-orange-200 uppercase tracking-wider mb-1">Binary Source Missing</span>
                         <button 
                           onClick={() => triggerGlobalRefresh()}
                           className="mt-2 flex items-center gap-1.5 bg-orange-600 hover:bg-orange-500 text-white px-3 py-1.5 rounded text-[10px] font-bold uppercase tracking-wider transition-colors shadow-lg border border-orange-400/50"
                         >
                             <RotateCw className="w-3 h-3" /> Refresh
                         </button>
                     </div>
                 )}

                 {/* Safe Zone Matte Container - BLUEPRINT MODE (Overlay z-20) */}
                 {incomingPayload && (
                    <div className="absolute inset-4 pointer-events-none z-20">
                        {/* Enhanced border visibility and removal of background fill */}
                        <div className="w-full h-full border-2 border-dashed border-emerald-500/50 flex flex-col justify-end">
                             <div className="p-1.5 bg-black/60 backdrop-blur-sm self-start rounded-tr text-[9px] font-mono text-emerald-500/70 border-t border-r border-emerald-500/10">
                                {Math.round(targetW)}x{Math.round(targetH)}px
                             </div>
                        </div>
                    </div>
                 )}

                 {/* Content Render - Max Containment Strategy */}
                 {previewUrl && !isLoading && !error && (
                     <img 
                       src={previewUrl} 
                       alt="Preview" 
                       className="max-w-full max-h-full object-contain pointer-events-none drop-shadow-2xl relative z-10"
                     />
                 )}

                 {/* Scanning Effect */}
                 {isLoading && (
                     <div className="absolute inset-0 z-30 pointer-events-none">
                         <div className="absolute inset-0 bg-gradient-to-b from-transparent via-emerald-500/10 to-transparent animate-scan-y"></div>
                         <div className="absolute inset-x-0 h-px bg-emerald-400/50 shadow-[0_0_15px_rgba(52,211,153,0.5)] animate-scan-line"></div>
                     </div>
                 )}
            </div>

            {/* Metrics Footer */}
            {incomingPayload && (
                 <div className="flex items-center justify-between px-2 text-[9px] font-mono font-bold tracking-wider text-slate-500 pt-1">
                     <div className="flex items-center gap-3">
                         <div className="flex items-center gap-1.5">
                             <Layers className="w-3 h-3 opacity-70" />
                             <span>{layerCount} LAYERS</span>
                         </div>
                         <div className="flex items-center gap-1.5">
                             <Maximize className="w-3 h-3 opacity-70" />
                             <span>{incomingPayload.scaleFactor.toFixed(2)}x SCALE</span>
                         </div>
                     </div>
                 </div>
            )}
            
            <style>{`
                @keyframes scan-y {
                    0% { transform: translateY(-100%); }
                    100% { transform: translateY(100%); }
                }
                .animate-scan-y {
                    animation: scan-y 2s linear infinite;
                }
                @keyframes scan-line {
                    0% { top: 0%; opacity: 0; }
                    10% { opacity: 1; }
                    90% { opacity: 1; }
                    100% { top: 100%; opacity: 0; }
                }
                .animate-scan-line {
                    animation: scan-line 2s linear infinite;
                }
            `}</style>
        </div>
    );
});

export const ContainerPreviewNode = memo(({ id, data }: NodeProps<PSDNodeData>) => {
  const instanceCount = data.instanceCount || 1;
  const { setNodes } = useReactFlow();
  const updateNodeInternals = useUpdateNodeInternals();
  const { unregisterNode } = useProceduralStore();
  const rootRef = useRef<HTMLDivElement>(null);

  // ResizeObserver: Essential for tracking internal content changes (like image loads)
  useEffect(() => {
    if (rootRef.current) {
        const observer = new ResizeObserver(() => {
            updateNodeInternals(id);
        });
        observer.observe(rootRef.current);
        return () => observer.disconnect();
    }
  }, [id, updateNodeInternals]);

  useEffect(() => {
    // Force React Flow to re-index handles when instances change or on mount
    updateNodeInternals(id);
  }, [id, instanceCount, updateNodeInternals]);

  useEffect(() => {
    return () => unregisterNode(id);
  }, [id, unregisterNode]);

  const addInstance = useCallback(() => {
      setNodes(nds => nds.map(n => n.id === id ? { ...n, data: { ...n.data, instanceCount: instanceCount + 1 } } : n));
  }, [id, instanceCount, setNodes]);

  return (
    // ROOT: No overflow-hidden to allow handles to poke out from rows
    <div ref={rootRef} className="w-[650px] bg-slate-900 rounded-lg shadow-2xl border border-emerald-500/50 font-sans flex flex-col relative transition-all group duration-500 hover:border-emerald-400">
      <NodeResizer 
        minWidth={650} 
        minHeight={400} 
        isVisible={true} 
        onResize={() => updateNodeInternals(id)} // Critical: Syncs handles during manual resize
        lineStyle={{ border: 'none' }}
        handleStyle={{ background: 'transparent', border: 'none' }}
      />

      {/* Header */}
      <div className="relative p-2 border-b flex items-center justify-between shrink-0 rounded-t-lg bg-emerald-950/80 backdrop-blur-md border-emerald-500/30 overflow-hidden">
         {/* Noise Background Container */}
         <div className="absolute inset-0 pointer-events-none opacity-20 mix-blend-soft-light">
            <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')]"></div>
         </div>
         
         <div className="flex items-center space-x-2 z-10 pl-1">
           <MonitorPlay className="w-4 h-4 text-emerald-400" />
           <div className="flex flex-col leading-none">
             <span className="text-sm font-bold tracking-tight text-emerald-100">Visual Preview</span>
             <span className="text-[9px] font-mono font-bold tracking-widest uppercase text-emerald-500/70">
                 MULTI-MONITOR
             </span>
           </div>
         </div>
         
         <div className="z-10 px-2 py-0.5 rounded border border-emerald-500/20 bg-black/20 text-[9px] font-mono text-emerald-400">
             {instanceCount} Active {instanceCount === 1 ? 'View' : 'Views'}
         </div>
      </div>

      {/* Instance List Container */}
      <div className="flex flex-col flex-1 bg-slate-950/50">
          {Array.from({ length: instanceCount }).map((_, i) => (
              <PreviewInstanceRow key={i} index={i} nodeId={id} />
          ))}
      </div>

      {/* Footer */}
      <button 
          onClick={addInstance} 
          className="w-full py-2 bg-slate-900 hover:bg-slate-800 text-emerald-500 hover:text-emerald-400 text-[9px] font-bold uppercase tracking-widest transition-colors flex items-center justify-center space-x-2 border-t border-emerald-900/50 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] rounded-b-lg overflow-hidden shrink-0"
      >
          <Plus className="w-3 h-3" />
          <span>Add Monitor View</span>
      </button>
    </div>
  );
});