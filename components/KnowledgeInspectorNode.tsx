import React, { memo, useMemo, useState, useEffect, useRef } from 'react';
import { Handle, Position, NodeProps, useEdges, useReactFlow } from 'reactflow';
import { PSDNodeData } from '../types';
import { useProceduralStore } from '../store/ProceduralContext';
import { useKnowledgeScoper } from '../hooks/useKnowledgeScoper';
import { Filter, Layers, Eye, ScanSearch, FileText, Copy, Check, Terminal } from 'lucide-react';

const GLOBAL_KEY = 'GLOBAL CONTEXT';

export const KnowledgeInspectorNode = memo(({ id, data }: NodeProps<PSDNodeData>) => {
  const edges = useEdges();
  const { knowledgeRegistry, unregisterNode } = useProceduralStore();
  const { setNodes } = useReactFlow();
  const [copied, setCopied] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Local state for UI, initialized from persisted data if available
  const [selectedContainer, setSelectedContainer] = useState<string>(data.inspectorState?.selectedContainer || GLOBAL_KEY);

  // 1. Identify Upstream Knowledge Node
  const sourceNodeId = useMemo(() => {
    const edge = edges.find(e => e.target === id && e.targetHandle === 'knowledge-in');
    return edge ? edge.source : null;
  }, [edges, id]);

  // 2. Fetch Context
  const knowledge = sourceNodeId ? knowledgeRegistry[sourceNodeId] : null;

  // 3. Parse Rules using Scoping Engine
  const { scopes, availableScopes } = useKnowledgeScoper(knowledge?.rules);
  const currentRules = scopes[selectedContainer] || [];

  // Cleanup
  useEffect(() => {
    return () => unregisterNode(id);
  }, [id, unregisterNode]);

  // Wheel Event Isolation for Scrolling
  useEffect(() => {
      const el = scrollRef.current;
      if (el) {
          const onWheel = (e: WheelEvent) => e.stopPropagation();
          el.addEventListener('wheel', onWheel, { passive: false });
          return () => el.removeEventListener('wheel', onWheel);
      }
  }, []);

  // Persist Selection State
  useEffect(() => {
    if (data.inspectorState?.selectedContainer !== selectedContainer) {
        setNodes(nds => nds.map(n => {
            if (n.id === id) {
                return {
                    ...n,
                    data: {
                        ...n.data,
                        inspectorState: { selectedContainer }
                    }
                };
            }
            return n;
        }));
    }
  }, [selectedContainer, id, setNodes, data.inspectorState?.selectedContainer]);

  // Reset to Global if selected container disappears (e.g. rules changed)
  useEffect(() => {
      if (!availableScopes.includes(selectedContainer)) {
          setSelectedContainer(GLOBAL_KEY);
      }
  }, [availableScopes, selectedContainer]);

  const handleCopy = async () => {
      if (currentRules.length === 0) return;
      
      const textToCopy = `[${selectedContainer} PROTOCOL]\n${currentRules.join('\n')}`;
      try {
          await navigator.clipboard.writeText(textToCopy);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
      } catch (err) {
          console.error("Copy failed", err);
      }
  };

  return (
    <div className="w-96 bg-slate-950 rounded-lg shadow-2xl border border-teal-500/50 font-sans flex flex-col overflow-hidden transition-all hover:border-teal-400 hover:shadow-[0_0_20px_rgba(20,184,166,0.15)] group">
      
      {/* Header */}
      <div className="bg-slate-900 p-2 border-b border-teal-500/30 flex items-center justify-between shrink-0 relative overflow-hidden">
         {/* Scanline Effect */}
         <div className="absolute top-0 left-0 w-full h-[1px] bg-teal-500/30 animate-scan-x pointer-events-none"></div>
         
         <div className="flex items-center space-x-2 z-10">
           <div className="p-1.5 rounded bg-teal-500/10 border border-teal-500/30">
             <Terminal className="w-4 h-4 text-teal-400" />
           </div>
           <div className="flex flex-col leading-none">
             <span className="text-sm font-bold text-teal-100 tracking-tight">Knowledge Inspector</span>
             <span className="text-[9px] text-teal-500 font-mono font-medium">SCOPING ENGINE v1.0</span>
           </div>
         </div>
         <div className="px-2 py-0.5 rounded border border-teal-500/20 bg-black/40 text-[9px] text-teal-400 font-mono shadow-inner">
             {availableScopes.length - 1} ACTIVE ZONES
         </div>
      </div>

      {/* Input Handle */}
      <Handle
        type="target"
        position={Position.Left}
        id="knowledge-in"
        className="!w-3 !h-3 !-left-1.5 !top-10 !bg-teal-500 !border-2 !border-slate-900 shadow-[0_0_10px_#14b8a6]"
        title="Input: Knowledge Context"
      />

      {/* Controls & Filter */}
      <div className="p-3 bg-slate-900/80 space-y-3 relative">
          
          {/* Container Selector */}
          <div className="relative group/select">
              <div className="absolute inset-y-0 left-0 pl-2 flex items-center pointer-events-none">
                  <Filter className="h-3 w-3 text-teal-500/70" />
              </div>
              <select 
                  value={selectedContainer}
                  onChange={(e) => setSelectedContainer(e.target.value)}
                  onMouseDown={(e) => e.stopPropagation()} 
                  disabled={!knowledge}
                  className="nodrag nopan w-full bg-black/40 border border-slate-700 text-teal-100 text-xs rounded pl-8 pr-8 py-2 focus:outline-none focus:border-teal-500 focus:bg-slate-900 transition-all disabled:opacity-50 appearance-none cursor-pointer font-mono shadow-sm hover:border-slate-600"
              >
                  {availableScopes.map(key => (
                      <option key={key} value={key}>
                          {key}
                      </option>
                  ))}
              </select>
              <div className="absolute inset-y-0 right-0 pr-2 flex items-center pointer-events-none">
                  <ScanSearch className="h-3 w-3 text-slate-500" />
              </div>
          </div>

          {/* Console Display */}
          <div className="bg-black/60 rounded-md border border-slate-800 flex flex-col min-h-[180px] max-h-[300px] shadow-inner relative overflow-hidden">
              {/* Toolbar */}
              <div className="flex items-center justify-between px-3 py-1.5 border-b border-slate-800 bg-slate-900/50">
                  <div className="flex items-center space-x-2">
                      <div className={`w-1.5 h-1.5 rounded-full ${currentRules.length > 0 ? 'bg-emerald-500 animate-pulse' : 'bg-slate-600'}`}></div>
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">{selectedContainer}</span>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                      <span className="text-[9px] text-slate-600 font-mono">{currentRules.length} LOC</span>
                      <button 
                        onClick={handleCopy}
                        onMouseDown={(e) => e.stopPropagation()}
                        disabled={currentRules.length === 0}
                        className={`nodrag nopan p-1 rounded transition-all flex items-center space-x-1 ${copied ? 'text-emerald-400 bg-emerald-900/20' : 'text-slate-500 hover:text-teal-400 hover:bg-slate-800'}`}
                        title="Copy Filtered Rules for Analyst Prompt"
                      >
                          {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      </button>
                  </div>
              </div>
              
              {/* Terminal Output */}
              <div 
                ref={scrollRef}
                className="nodrag nopan p-3 overflow-y-auto custom-scrollbar flex-1 font-mono text-[10px] leading-relaxed relative"
                onMouseDown={(e) => e.stopPropagation()}
              >
                  {!knowledge ? (
                      <div className="flex flex-col items-center justify-center h-full text-slate-700 space-y-2 opacity-60">
                          <Eye className="w-8 h-8 opacity-50" />
                          <span className="uppercase tracking-widest text-[9px]">Signal Lost</span>
                      </div>
                  ) : currentRules.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-full text-slate-700 opacity-60">
                          <span className="italic">No specific directives found.</span>
                          <span className="text-[9px] mt-1 opacity-50">Inherits Global Intuition</span>
                      </div>
                  ) : (
                      <ul className="space-y-3">
                          {currentRules.map((rule, idx) => (
                              <li key={idx} className="text-slate-300 flex items-start space-x-2 group/line">
                                  <span className="text-teal-500/50 shrink-0 select-none group-hover/line:text-teal-400 transition-colors">{`>`}</span>
                                  <span className="break-words opacity-90 group-hover/line:opacity-100 transition-opacity">{rule.replace(/^[-*]\s/, '')}</span>
                              </li>
                          ))}
                          <li className="h-4"></li> {/* Spacer */}
                      </ul>
                  )}
                  
                  {/* CRT Line Effect */}
                  <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] z-10 bg-[length:100%_2px,3px_100%] opacity-20"></div>
              </div>
          </div>

          {/* Visual Anchors Summary (Transparency) */}
          {knowledge && knowledge.visualAnchors.length > 0 && (
              <div className="flex items-center justify-between pt-2 border-t border-slate-800">
                  <div className="flex items-center space-x-1.5">
                      <Layers className="w-3 h-3 text-purple-400" />
                      <span className="text-[9px] text-purple-300 font-mono uppercase tracking-wide">
                          Attached References
                      </span>
                  </div>
                  <div className="flex -space-x-1.5">
                      {knowledge.visualAnchors.slice(0, 4).map((anchor, i) => (
                          <div key={i} className="w-5 h-5 rounded border border-slate-700 bg-slate-800 overflow-hidden relative z-0 hover:z-10 hover:scale-150 transition-all shadow-sm">
                              <img 
                                src={`data:${anchor.mimeType};base64,${anchor.data}`} 
                                alt="ref" 
                                className="w-full h-full object-cover opacity-80 hover:opacity-100" 
                              />
                          </div>
                      ))}
                      {knowledge.visualAnchors.length > 4 && (
                          <div className="w-5 h-5 rounded border border-slate-700 bg-slate-800 flex items-center justify-center text-[7px] text-slate-400 z-10 font-bold bg-slate-900">
                              +{knowledge.visualAnchors.length - 4}
                          </div>
                      )}
                  </div>
              </div>
          )}

      </div>
      
      <style>{`
        @keyframes scan-x {
            0% { transform: translateX(-100%); opacity: 0; }
            50% { opacity: 1; }
            100% { transform: translateX(100%); opacity: 0; }
        }
        .animate-scan-x {
            animation: scan-x 3s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
});