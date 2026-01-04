import React, { memo, useMemo, useState, useEffect, useCallback } from 'react';
import { Handle, Position, NodeProps, useEdges, NodeResizer, useUpdateNodeInternals } from 'reactflow';
import { PSDNodeData } from '../types';
import { useProceduralStore } from '../store/ProceduralContext';
import { Terminal, Radio, RefreshCcw, Save, AlertCircle, FileEdit, ArrowRight } from 'lucide-react';

export const KnowledgeInspectorNode = memo(({ id, data }: NodeProps<PSDNodeData>) => {
  const edges = useEdges();
  const updateNodeInternals = useUpdateNodeInternals();
  const { knowledgeRegistry, registerInspectedKnowledge, unregisterNode } = useProceduralStore();
  
  // Local State for the Editor
  const [localRules, setLocalRules] = useState<string>("");
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [hasEdits, setHasEdits] = useState(false);
  
  // 1. Identify Upstream Knowledge Node
  const sourceNodeId = useMemo(() => {
    const edge = edges.find(e => e.target === id && e.targetHandle === 'knowledge-in');
    return edge ? edge.source : null;
  }, [edges, id]);

  // 2. Fetch Upstream Context
  const upstreamContext = sourceNodeId ? knowledgeRegistry[sourceNodeId] : null;
  const upstreamRules = upstreamContext?.rules || "";

  // 3. Initialization Logic (Scoping)
  useEffect(() => {
      // Only auto-populate if local rules are empty and we have upstream data.
      // This prevents overwriting user work if the upstream re-renders.
      if (!localRules && upstreamRules && !hasEdits) {
          setLocalRules(upstreamRules);
      }
  }, [upstreamRules, localRules, hasEdits]);

  // 4. Broadcasting Logic (Sync to Store)
  useEffect(() => {
      if (!localRules) return;

      setIsBroadcasting(true);
      const timer = setTimeout(() => {
          registerInspectedKnowledge(id, {
              sourceNodeId: id,
              rules: localRules
          });
          setIsBroadcasting(false);
      }, 600); // Debounce to prevent store thrashing

      return () => clearTimeout(timer);
  }, [localRules, id, registerInspectedKnowledge]);

  // Cleanup
  useEffect(() => {
    return () => unregisterNode(id);
  }, [id, unregisterNode]);

  // Handle Resize
  useEffect(() => {
      updateNodeInternals(id);
  }, [id, updateNodeInternals]);

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setLocalRules(e.target.value);
      setHasEdits(true);
  };

  const handleRevert = () => {
      if (confirm("Discard all manual edits and revert to global rules?")) {
          setLocalRules(upstreamRules);
          setHasEdits(false);
      }
  };

  const isDesync = hasEdits && localRules !== upstreamRules;

  return (
    <div className="w-[450px] h-[400px] bg-slate-950 rounded-lg shadow-2xl border border-teal-500/50 font-sans flex flex-col overflow-hidden transition-all group hover:border-teal-400">
      <NodeResizer 
        minWidth={300} 
        minHeight={250} 
        isVisible={true}
        lineStyle={{ border: 'none' }}
        handleStyle={{ background: 'transparent' }}
      />

      {/* Header */}
      <div className="bg-slate-900 p-2 border-b border-teal-500/30 flex items-center justify-between shrink-0 relative">
         <div className="flex items-center space-x-2 z-10">
           <div className="p-1.5 rounded bg-teal-500/10 border border-teal-500/30">
             <Terminal className="w-4 h-4 text-teal-400" />
           </div>
           <div className="flex flex-col leading-none">
             <span className="text-sm font-bold text-teal-100 tracking-tight">Knowledge Inspector</span>
             <span className="text-[9px] text-teal-500 font-mono font-medium">MIDDLEWARE EDITOR</span>
           </div>
         </div>
         
         <div className="flex items-center space-x-2">
             {isBroadcasting ? (
                 <div className="flex items-center space-x-1.5 px-2 py-0.5 rounded-full bg-teal-900/30 border border-teal-500/30">
                     <div className="w-1.5 h-1.5 bg-teal-400 rounded-full animate-ping" />
                     <span className="text-[9px] text-teal-300 font-bold uppercase tracking-wider">Syncing</span>
                 </div>
             ) : (
                 <div className="flex items-center space-x-1.5 px-2 py-0.5 rounded bg-black/40 border border-teal-500/20">
                     <Radio className="w-3 h-3 text-teal-600" />
                     <span className="text-[9px] text-teal-600 font-bold uppercase tracking-wider">Live Broadcast</span>
                 </div>
             )}
         </div>
      </div>

      {/* Toolbar */}
      <div className="px-3 py-1.5 bg-slate-900/50 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-2">
              <FileEdit className="w-3 h-3 text-slate-500" />
              <span className="text-[9px] text-slate-400 font-mono">
                  {localRules.length} chars
              </span>
              {isDesync && (
                  <span className="text-[8px] text-orange-400 bg-orange-900/20 px-1 rounded border border-orange-500/30">
                      MODIFIED
                  </span>
              )}
          </div>
          
          <button 
            onClick={handleRevert}
            disabled={!hasEdits}
            className="flex items-center space-x-1 text-[9px] text-slate-500 hover:text-red-400 disabled:opacity-30 transition-colors"
            title="Revert to Upstream Global Knowledge"
          >
              <RefreshCcw className="w-3 h-3" />
              <span>Revert</span>
          </button>
      </div>

      {/* Editor Area */}
      <div className="flex-1 relative bg-black/20 group/editor">
          {!upstreamContext ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-600 space-y-2">
                  <AlertCircle className="w-8 h-8 opacity-50" />
                  <span className="text-xs font-medium uppercase tracking-wider">No Input Signal</span>
                  <span className="text-[10px] opacity-70">Connect Project Brain</span>
              </div>
          ) : (
              <textarea
                  value={localRules}
                  onChange={handleTextChange}
                  className="w-full h-full bg-transparent p-3 text-xs font-mono text-teal-100/90 focus:outline-none resize-none custom-scrollbar leading-relaxed"
                  placeholder="// Procedural Rules will appear here..."
                  spellCheck={false}
              />
          )}
          
          {/* Output Handle Indicator */}
          <div className="absolute bottom-2 right-2 flex items-center space-x-1 opacity-50 group-hover/editor:opacity-100 transition-opacity pointer-events-none">
              <span className="text-[8px] text-teal-500 font-bold">TO ANALYST</span>
              <ArrowRight className="w-3 h-3 text-teal-500" />
          </div>
      </div>

      {/* Handles */}
      <Handle
        type="target"
        position={Position.Left}
        id="knowledge-in"
        className="!w-3 !h-3 !-left-1.5 !top-10 !bg-teal-500 !border-2 !border-slate-900 shadow-[0_0_10px_#14b8a6] transition-transform hover:scale-125"
        title="Input: Global Knowledge"
      />
      
      <Handle
        type="source"
        position={Position.Right}
        id="knowledge-out"
        className="!w-3 !h-3 !-right-1.5 !top-1/2 !-translate-y-1/2 !bg-teal-400 !border-2 !border-white shadow-[0_0_15px_#2dd4bf] transition-transform hover:scale-125"
        title="Output: Inspected Knowledge"
      />
    </div>
  );
});