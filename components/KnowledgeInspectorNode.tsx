import React, { memo, useState, useEffect, useMemo, useRef } from 'react';
import { Handle, Position, NodeProps, useEdges, useUpdateNodeInternals } from 'reactflow';
import { PSDNodeData } from '../types';
import { useProceduralStore } from '../store/ProceduralContext';
import { Terminal, FileEdit, RefreshCcw, ShieldCheck, Activity, CheckCircle2 } from 'lucide-react';

export const KnowledgeInspectorNode = memo(({ id }: NodeProps<PSDNodeData>) => {
  const [localRules, setLocalRules] = useState<string>('');
  const edges = useEdges();
  const updateNodeInternals = useUpdateNodeInternals();
  const { knowledgeRegistry, registerInspectedKnowledge, unregisterNode } = useProceduralStore();

  // 1. Resolve Upstream Knowledge Source
  const upstreamKnowledge = useMemo(() => {
    const edge = edges.find(e => e.target === id && e.targetHandle === 'knowledge-in');
    if (!edge) return null;
    return knowledgeRegistry[edge.source];
  }, [edges, id, knowledgeRegistry]);

  const upstreamRules = upstreamKnowledge?.rules || '';

  // 2. Initialization Sync: Only auto-populate if local is empty and we have upstream rules
  useEffect(() => {
    if (upstreamRules && !localRules) {
      setLocalRules(upstreamRules);
    }
  }, [upstreamRules]); // Intentionally not including localRules to avoid loop, though condition handles it

  // 3. Broadcasting Sync: Keep Store updated with local edits
  useEffect(() => {
    registerInspectedKnowledge(id, { rules: localRules, sourceNodeId: id });
  }, [id, localRules, registerInspectedKnowledge]);

  useEffect(() => {
    return () => unregisterNode(id);
  }, [id, unregisterNode]);

  useEffect(() => {
      updateNodeInternals(id);
  }, [id, updateNodeInternals]);

  const hasEdits = localRules !== upstreamRules;
  const isSyncActive = !!upstreamKnowledge;

  return (
    <div className="w-[350px] bg-slate-900 rounded-lg shadow-2xl border border-teal-500/50 font-sans flex flex-col overflow-hidden">
      <Handle 
        type="target" 
        position={Position.Left} 
        id="knowledge-in" 
        className="!w-3 !h-3 !-left-1.5 !bg-teal-500 !border-2 !border-slate-900 z-50" 
      />
      
      <div className="bg-slate-950 p-2 border-b border-teal-900/50 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <div className="p-1 bg-teal-500/10 rounded border border-teal-500/20">
             <Terminal className="w-3.5 h-3.5 text-teal-400" />
          </div>
          <div className="flex flex-col leading-none">
            <span className="text-xs font-bold text-teal-100">Knowledge Inspector</span>
            <span className="text-[9px] text-teal-500/70 font-mono tracking-wide">REFINEMENT_TERMINAL</span>
          </div>
        </div>
        {hasEdits && (
          <span className="text-[8px] bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded border border-amber-500/30 font-bold tracking-wider">MODIFIED</span>
        )}
      </div>

      <div className="p-3 bg-slate-800/50 space-y-3">
        <div className="flex items-center justify-between">
            <div className="flex items-center space-x-1.5 text-slate-400">
                <FileEdit className="w-3 h-3" />
                <span className="text-[10px] uppercase font-bold tracking-wider">Extracted Rules</span>
            </div>
            <div className="flex items-center space-x-2">
                <button 
                    onClick={() => setLocalRules(upstreamRules)}
                    disabled={!hasEdits}
                    className={`p-1 rounded transition-colors ${hasEdits ? 'text-teal-400 hover:bg-teal-900/30 border border-transparent hover:border-teal-500/30' : 'text-slate-600 cursor-not-allowed opacity-50'}`}
                    title="Revert to Source"
                >
                    <RefreshCcw className="w-3 h-3" />
                </button>
                <span className="text-[9px] text-slate-500 font-mono">{localRules.length} chars</span>
            </div>
        </div>

        <textarea 
            value={localRules}
            onChange={(e) => setLocalRules(e.target.value)}
            placeholder="Waiting for upstream knowledge signal..."
            className="w-full h-48 bg-black/40 border border-slate-700 rounded p-2 text-[11px] text-teal-100/90 font-mono focus:outline-none focus:border-teal-500/50 resize-none custom-scrollbar placeholder:text-slate-600"
            spellCheck={false}
        />

        <div className="flex items-center justify-between pt-2 border-t border-slate-700/50">
            <div className="flex items-center space-x-2">
                {isSyncActive ? (
                    <div className="flex items-center space-x-1.5">
                        <Activity className="w-3 h-3 text-teal-500 animate-pulse" />
                        <span className="text-[9px] text-teal-400 font-bold uppercase tracking-wider">Live Broadcast</span>
                    </div>
                ) : (
                    <span className="text-[9px] text-slate-600 font-bold uppercase italic tracking-wider">Signal Disconnected</span>
                )}
            </div>
            {isSyncActive && localRules.length > 0 && (
                <div className="flex items-center space-x-1 bg-emerald-900/20 px-1.5 py-0.5 rounded border border-emerald-500/20">
                    <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                    <span className="text-[9px] text-emerald-400 font-mono font-bold">SYNC_OK</span>
                </div>
            )}
        </div>
      </div>

      <Handle 
        type="source" 
        position={Position.Right} 
        id="knowledge-out" 
        className="!w-3 !h-3 !-right-1.5 !bg-teal-500 !border-2 !border-slate-900 z-50 shadow-[0_0_10px_#14b8a6]" 
      />
    </div>
  );
});