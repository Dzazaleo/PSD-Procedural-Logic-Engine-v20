import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { Psd } from 'ag-psd';
import { TemplateMetadata, MappingContext, TransformedPayload, LayoutStrategy, KnowledgeContext, KnowledgeRegistry } from '../types';

interface ProceduralState {
  // Maps NodeID -> Raw PSD Object (Binary/Structure)
  psdRegistry: Record<string, Psd>;
  
  // Maps NodeID -> Lightweight Template Metadata
  templateRegistry: Record<string, TemplateMetadata>;
  
  // Maps NodeID -> HandleID -> Resolved Context (Layers + Bounds)
  resolvedRegistry: Record<string, Record<string, MappingContext>>;

  // Maps NodeID -> HandleID -> Transformed Payload (Ready for Assembly)
  payloadRegistry: Record<string, Record<string, TransformedPayload>>;

  // Maps NodeID -> HandleID -> Polished Payload (CARO Output)
  // Stores the final refined transforms from Reviewer nodes (and Preview node proxies)
  reviewerRegistry: Record<string, Record<string, TransformedPayload>>;

  // Maps NodeID -> HandleID -> Base64 Image String
  // Specific registry for caching the visual renders from ContainerPreviewNode
  previewRegistry: Record<string, Record<string, string>>;

  // Maps NodeID -> HandleID -> LayoutStrategy (AI Analysis)
  analysisRegistry: Record<string, Record<string, LayoutStrategy>>;

  // Maps NodeID -> KnowledgeContext (Global Design Rules)
  knowledgeRegistry: KnowledgeRegistry;

  // Global counter to force re-evaluation of downstream nodes upon binary re-hydration
  globalVersion: number;
}

interface ProceduralContextType extends ProceduralState {
  registerPsd: (nodeId: string, psd: Psd) => void;
  registerTemplate: (nodeId: string, template: TemplateMetadata) => void;
  registerResolved: (nodeId: string, handleId: string, context: MappingContext) => void;
  registerPayload: (nodeId: string, handleId: string, payload: TransformedPayload, masterOverride?: boolean) => void;
  registerReviewerPayload: (nodeId: string, handleId: string, payload: TransformedPayload) => void;
  registerPreviewPayload: (nodeId: string, handleId: string, payload: TransformedPayload, renderUrl: string) => void;
  updatePayload: (nodeId: string, handleId: string, partial: Partial<TransformedPayload>) => void; 
  registerAnalysis: (nodeId: string, handleId: string, strategy: LayoutStrategy) => void;
  registerKnowledge: (nodeId: string, context: KnowledgeContext) => void;
  updatePreview: (nodeId: string, handleId: string, url: string) => void;
  unregisterNode: (nodeId: string) => void;
  flushPipelineInstance: (nodeId: string, handleId: string) => void;
  triggerGlobalRefresh: () => void;
}

const ProceduralContext = createContext<ProceduralContextType | null>(null);

// --- HELPER: Reconcile Terminal State ---
// Implements "Double-Buffer" Update Strategy + Stale Guard + Geometric Preservation + Logic Gate
const reconcileTerminalState = (
    incomingPayload: TransformedPayload, 
    currentPayload: TransformedPayload | undefined
): TransformedPayload => {

    // 0. RESET LOGIC (Cascaded Flush)
    // If the payload is effectively idle/reset and lacks a generation ID, we force a strip of all AI artifacts.
    if (incomingPayload.status === 'idle' && !incomingPayload.generationId) {
        return {
            ...incomingPayload,
            previewUrl: undefined,
            isConfirmed: false,
            isTransient: false,
            isSynthesizing: false,
            isPolished: false,
            requiresGeneration: false,
            sourceReference: undefined
        };
    }

    // 1. GENERATIVE LOGIC GATE: HARD STOP
    // If generation is explicitly disallowed (per-instance toggle), we must strip purely synthetic assets.
    // SURGICAL UPDATE: We must NOT delete layers that were "Swapped" (changed from Pixel -> Gen).
    // Swapped layers retain their original IDs (e.g., "0.3.1"). Additive layers use synthetic IDs ("gen-layer-...").
    if (incomingPayload.generationAllowed === false) {
        return {
            ...incomingPayload,
            // Destructive Strip:
            previewUrl: undefined,
            isConfirmed: false,
            isTransient: false,
            isSynthesizing: false,
            requiresGeneration: false, // Ensure downstream nodes know generation is off
            // Preserve geometric data
            metrics: incomingPayload.metrics,
            // FILTER LOGIC:
            // Remove 'generative' layers ONLY IF they are purely additive (start with 'gen-layer-').
            // Swapped layers (with original IDs) are kept. If they are type='generative', they render as placeholders,
            // which is safer than deleting the entire node from the tree.
            layers: incomingPayload.layers.filter(l => 
                l.type !== 'generative' || (l.id && !l.id.startsWith('gen-layer-'))
            ) 
        };
    }

    // --- PHASE 4B: MANDATORY AUTO-CONFIRMATION ---
    // If specific directives enforce generation, we bypass the confirmation queue.
    const hasMandatoryDirective = incomingPayload.directives?.includes('MANDATORY_GEN_FILL');
    const isForced = incomingPayload.isMandatory || hasMandatoryDirective;

    if (isForced && incomingPayload.requiresGeneration) {
        // Force Auto-Confirm
        return {
            ...incomingPayload,
            status: 'success',
            isConfirmed: true,
            isTransient: false, // Treat as solid immediately
            isSynthesizing: incomingPayload.isSynthesizing, // Preserve active gen state if already started
            // Inherit valid existing data to prevent flicker
            previewUrl: incomingPayload.previewUrl || currentPayload?.previewUrl,
            sourceReference: incomingPayload.sourceReference || currentPayload?.sourceReference,
            generationId: incomingPayload.generationId || currentPayload?.generationId
        };
    }

    // 2. STALE GUARD:
    // If store has a newer generation ID than incoming, reject the update.
    // NOTE: This allows Equal IDs to pass through (essential for geometric refinements of the same asset)
    if (currentPayload?.generationId && incomingPayload.generationId && incomingPayload.generationId < currentPayload.generationId) {
        return currentPayload;
    }

    // 3. SANITATION (Geometric Reset)
    // Explicitly flush preview and history if status is 'idle' (e.g. disconnected or reset)
    if (incomingPayload.status === 'idle') {
        return {
             ...incomingPayload,
             previewUrl: undefined,
             isConfirmed: false,
             isTransient: false,
             isSynthesizing: false
        };
    }

    // 4. FLUSH PHASE (Start Synthesis)
    if (incomingPayload.isSynthesizing) {
        return {
            ...(currentPayload || incomingPayload),
            isSynthesizing: true,
            // Preserve visual context during load
            previewUrl: currentPayload?.previewUrl,
            sourceReference: incomingPayload.sourceReference || currentPayload?.sourceReference,
            targetContainer: incomingPayload.targetContainer || currentPayload?.targetContainer || '',
            metrics: incomingPayload.metrics || currentPayload?.metrics,
            generationId: currentPayload?.generationId,
            generationAllowed: true
        };
    }

    // 5. REFINEMENT PERSISTENCE (State Guard)
    // Prevent accidental reset of confirmation if prompt hasn't changed structurally
    let isConfirmed = incomingPayload.isConfirmed ?? currentPayload?.isConfirmed ?? false;
    
    // If explicitly marked transient (draft), it cannot be confirmed yet
    if (incomingPayload.isTransient) {
        isConfirmed = false;
    }

    // 6. GEOMETRIC PRESERVATION
    // If this is a layout update (no generationId) but we have AI assets, keep them.
    if (!incomingPayload.generationId && currentPayload?.generationId) {
         return {
            ...incomingPayload,
            previewUrl: currentPayload.previewUrl,
            generationId: currentPayload.generationId,
            isSynthesizing: currentPayload.isSynthesizing,
            isConfirmed: currentPayload.isConfirmed, 
            isTransient: currentPayload.isTransient,
            sourceReference: currentPayload.sourceReference || incomingPayload.sourceReference,
            generationAllowed: true
         };
    }

    // 7. FINAL CONSTRUCTION
    return {
        ...incomingPayload,
        isConfirmed,
        sourceReference: incomingPayload.sourceReference || currentPayload?.sourceReference,
        generationId: incomingPayload.generationId || currentPayload?.generationId,
        generationAllowed: true
    };
};

export const ProceduralStoreProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [psdRegistry, setPsdRegistry] = useState<Record<string, Psd>>({});
  const [templateRegistry, setTemplateRegistry] = useState<Record<string, TemplateMetadata>>({});
  const [resolvedRegistry, setResolvedRegistry] = useState<Record<string, Record<string, MappingContext>>>({});
  const [payloadRegistry, setPayloadRegistry] = useState<Record<string, Record<string, TransformedPayload>>>({});
  const [reviewerRegistry, setReviewerRegistry] = useState<Record<string, Record<string, TransformedPayload>>>({});
  const [previewRegistry, setPreviewRegistry] = useState<Record<string, Record<string, string>>>({});
  const [analysisRegistry, setAnalysisRegistry] = useState<Record<string, Record<string, LayoutStrategy>>>({});
  const [knowledgeRegistry, setKnowledgeRegistry] = useState<KnowledgeRegistry>({});
  const [globalVersion, setGlobalVersion] = useState<number>(0);

  const registerPsd = useCallback((nodeId: string, psd: Psd) => {
    setPsdRegistry(prev => ({ ...prev, [nodeId]: psd }));
  }, []);

  const registerTemplate = useCallback((nodeId: string, template: TemplateMetadata) => {
    setTemplateRegistry(prev => {
      if (prev[nodeId] === template) return prev;
      if (JSON.stringify(prev[nodeId]) === JSON.stringify(template)) return prev;
      return { ...prev, [nodeId]: template };
    });
  }, []);

  const registerResolved = useCallback((nodeId: string, handleId: string, context: MappingContext) => {
    // SANITATION LOGIC (Ghost Flushing)
    let sanitizedContext = context;

    // Check Logic Gate: Is generation permitted?
    const isGenerationDisallowed = context.generationAllowed === false || context.aiStrategy?.generationAllowed === false;

    if (isGenerationDisallowed) {
        sanitizedContext = {
            ...context,
            // Flush Ghost Preview
            previewUrl: undefined,
            // Flush Generative Intent
            aiStrategy: context.aiStrategy ? {
                ...context.aiStrategy,
                generativePrompt: '',
                generationAllowed: false
            } : undefined,
            generationAllowed: false
        };
    } else if (context.aiStrategy?.method === 'GEOMETRIC') {
        sanitizedContext = {
            ...context,
            // Flush Ghost Preview
            previewUrl: undefined,
            // Flush Generative Intent
            aiStrategy: {
                ...context.aiStrategy,
                generativePrompt: ''
            }
        };
    }

    setResolvedRegistry(prev => {
      const nodeRecord = prev[nodeId] || {};
      const currentContext = nodeRecord[handleId];
      if (currentContext === sanitizedContext) return prev;
      if (currentContext && JSON.stringify(currentContext) === JSON.stringify(sanitizedContext)) return prev;
      
      return {
        ...prev,
        [nodeId]: {
          ...nodeRecord,
          [handleId]: sanitizedContext
        }
      };
    });
  }, []);

  const registerPayload = useCallback((nodeId: string, handleId: string, payload: TransformedPayload, masterOverride?: boolean) => {
    setPayloadRegistry(prev => {
      const nodeRecord = prev[nodeId] || {};
      const currentPayload = nodeRecord[handleId];
      
      let effectivePayload = { ...payload };

      // Phase 4A: Cascaded Generation Blocking (Master Override)
      if (masterOverride === false) {
          effectivePayload.generationAllowed = false;
      }

      // APPLY RECONCILIATION MIDDLEWARE
      const reconciledPayload = reconcileTerminalState(effectivePayload, currentPayload);

      // Deep equality check optimization
      if (currentPayload && JSON.stringify(currentPayload) === JSON.stringify(reconciledPayload)) {
          return prev;
      }

      return { 
        ...prev, 
        [nodeId]: {
            ...nodeRecord,
            [handleId]: reconciledPayload
        } 
      };
    });
  }, []);

  const registerReviewerPayload = useCallback((nodeId: string, handleId: string, payload: TransformedPayload) => {
    setReviewerRegistry(prev => {
        const nodeRecord = prev[nodeId] || {};
        const currentPayload = nodeRecord[handleId];
        
        // --- CRITICAL EXPORT GATE ---
        // Enforce 'isPolished' Flag for CARO output.
        // This validates that the payload has passed through the Reviewer/Audit node.
        const effectivePayload = { ...payload, isPolished: true };

        // Use same reconciliation logic as standard payloads to handle generation IDs and stale updates.
        // NOTE: Even if generationId matches (e.g. refining geometry of the same AI asset), 
        // the changed 'layers' coords in effectivePayload will bypass the equality check below.
        const reconciledPayload = reconcileTerminalState(effectivePayload, currentPayload);

        if (currentPayload && JSON.stringify(currentPayload) === JSON.stringify(reconciledPayload)) {
            return prev;
        }

        return {
            ...prev,
            [nodeId]: {
                ...nodeRecord,
                [handleId]: reconciledPayload
            }
        };
    });
  }, []);

  const registerPreviewPayload = useCallback((nodeId: string, handleId: string, payload: TransformedPayload, renderUrl: string) => {
    // 1. Store Render in Preview Registry (Visual State Only)
    setPreviewRegistry(prev => {
        const nodeRecord = prev[nodeId] || {};
        if (nodeRecord[handleId] === renderUrl) return prev;
        return {
            ...prev,
            [nodeId]: { ...nodeRecord, [handleId]: renderUrl }
        };
    });

    // 2. Proxy Payload to Reviewer Registry (Data State)
    // This allows ExportNode to find the data in a "trusted" registry with 'isPolished' ensured.
    setReviewerRegistry(prev => {
        const nodeRecord = prev[nodeId] || {};
        const currentPayload = nodeRecord[handleId];

        const effectivePayload = { 
            ...payload, 
            isPolished: true       // Enforce gate
        };

        const reconciledPayload = reconcileTerminalState(effectivePayload, currentPayload);

        if (currentPayload && JSON.stringify(currentPayload) === JSON.stringify(reconciledPayload)) {
            return prev;
        }

        return {
            ...prev,
            [nodeId]: {
                ...nodeRecord,
                [handleId]: reconciledPayload
            }
        };
    });
  }, []);

  // NEW: Atomic Partial Update to prevent Stale Closures
  const updatePayload = useCallback((nodeId: string, handleId: string, partial: Partial<TransformedPayload>) => {
    setPayloadRegistry(prev => {
      const nodeRecord = prev[nodeId] || {};
      const currentPayload = nodeRecord[handleId];
      
      // Safety: Cannot update non-existent payload unless sufficient data provided (assumed handled upstream)
      if (!currentPayload && !partial.sourceContainer && !partial.previewUrl) return prev; 

      // Merge: State = Current + Partial
      const mergedPayload: TransformedPayload = currentPayload 
        ? { ...currentPayload, ...partial }
        : (partial as TransformedPayload); 

      // Reconcile
      const reconciledPayload = reconcileTerminalState(mergedPayload, currentPayload);
      
      if (currentPayload && JSON.stringify(currentPayload) === JSON.stringify(reconciledPayload)) return prev;

      return { 
        ...prev, 
        [nodeId]: {
            ...nodeRecord,
            [handleId]: reconciledPayload
        } 
      };
    });
  }, []);

  const registerAnalysis = useCallback((nodeId: string, handleId: string, strategy: LayoutStrategy) => {
    setAnalysisRegistry(prev => {
        const nodeRecord = prev[nodeId] || {};
        const currentStrategy = nodeRecord[handleId];
        
        if (currentStrategy === strategy) return prev;
        if (currentStrategy && JSON.stringify(currentStrategy) === JSON.stringify(strategy)) return prev;
        
        return { 
            ...prev, 
            [nodeId]: {
                ...nodeRecord,
                [handleId]: strategy
            } 
        };
    });
  }, []);

  const registerKnowledge = useCallback((nodeId: string, context: KnowledgeContext) => {
    setKnowledgeRegistry(prev => {
        if (prev[nodeId] === context) return prev;
        if (JSON.stringify(prev[nodeId]) === JSON.stringify(context)) return prev;
        return { ...prev, [nodeId]: context };
    });
  }, []);

  const updatePreview = useCallback((nodeId: string, handleId: string, url: string) => {
    setPayloadRegistry(prev => {
      const nodeRecord = prev[nodeId];
      if (!nodeRecord) return prev; 
      
      const currentPayload = nodeRecord[handleId];
      if (!currentPayload) return prev;

      if (currentPayload.previewUrl === url) return prev;

      return {
        ...prev,
        [nodeId]: {
          ...nodeRecord,
          [handleId]: {
            ...currentPayload,
            previewUrl: url
          }
        }
      };
    });
  }, []);

  const unregisterNode = useCallback((nodeId: string) => {
    setPsdRegistry(prev => { const { [nodeId]: _, ...rest } = prev; return rest; });
    setTemplateRegistry(prev => { const { [nodeId]: _, ...rest } = prev; return rest; });
    setResolvedRegistry(prev => { const { [nodeId]: _, ...rest } = prev; return rest; });
    setPayloadRegistry(prev => { const { [nodeId]: _, ...rest } = prev; return rest; });
    setReviewerRegistry(prev => { const { [nodeId]: _, ...rest } = prev; return rest; });
    setAnalysisRegistry(prev => { const { [nodeId]: _, ...rest } = prev; return rest; });
    
    setKnowledgeRegistry(prev => { 
        if (!prev[nodeId]) return prev;
        const { [nodeId]: _, ...rest } = prev; 
        return rest; 
    });

    setPreviewRegistry(prev => {
        if (!prev[nodeId]) return prev;
        const { [nodeId]: _, ...rest } = prev;
        return rest;
    });
    
    setGlobalVersion(v => v + 1);
  }, []);

  // NEW: Deep Pipeline Flush to clear AI artifacts on reset
  // Updated to ensure it clears all registry levels associated with a specific slot index
  const flushPipelineInstance = useCallback((nodeId: string, handleId: string) => {
      const clearEntry = (registry: Record<string, Record<string, any>>, setRegistry: React.Dispatch<React.SetStateAction<any>>) => {
          setRegistry((prev: Record<string, Record<string, any>>) => {
              if (!prev[nodeId]) return prev;
              const { [handleId]: _, ...restHandles } = prev[nodeId];
              return { ...prev, [nodeId]: restHandles };
          });
      };

      // Atomic clearance of all downstream data sources for this specific pipeline slot
      // Clearing resolvedRegistry triggers Remapper to reset.
      clearEntry(resolvedRegistry, setResolvedRegistry);
      
      // Clearing payloadRegistry signals Reviewer to reset.
      // Note: Reviewer listens to 'payload-in-{i}' which usually maps to Remapper's 'result-out-{i}'.
      // So flushing resolvedRegistry (source for Remapper) cascades to Remapper output flush.
      
      // Explicitly clear direct payloads if any
      clearEntry(payloadRegistry, setPayloadRegistry);
      clearEntry(reviewerRegistry, setReviewerRegistry);
      clearEntry(previewRegistry, setPreviewRegistry);
      clearEntry(analysisRegistry, setAnalysisRegistry);
  }, [resolvedRegistry, payloadRegistry, reviewerRegistry, previewRegistry, analysisRegistry]);

  const triggerGlobalRefresh = useCallback(() => {
    setGlobalVersion(v => v + 1);
  }, []);

  const value = useMemo(() => ({
    psdRegistry,
    templateRegistry,
    resolvedRegistry,
    payloadRegistry,
    reviewerRegistry,
    previewRegistry,
    analysisRegistry,
    knowledgeRegistry,
    globalVersion,
    registerPsd,
    registerTemplate,
    registerResolved,
    registerPayload,
    registerReviewerPayload,
    registerPreviewPayload,
    updatePayload, 
    registerAnalysis,
    registerKnowledge,
    updatePreview,
    unregisterNode,
    flushPipelineInstance,
    triggerGlobalRefresh
  }), [
    psdRegistry, templateRegistry, resolvedRegistry, payloadRegistry, reviewerRegistry, previewRegistry, analysisRegistry, knowledgeRegistry, globalVersion,
    registerPsd, registerTemplate, registerResolved, registerPayload, registerReviewerPayload, registerPreviewPayload, updatePayload, registerAnalysis, registerKnowledge, updatePreview,
    unregisterNode, flushPipelineInstance, triggerGlobalRefresh
  ]);

  return (
    <ProceduralContext.Provider value={value}>
      {children}
    </ProceduralContext.Provider>
  );
};

export const useProceduralStore = () => {
  const context = useContext(ProceduralContext);
  if (!context) {
    throw new Error('useProceduralStore must be used within a ProceduralStoreProvider');
  }
  return context;
};