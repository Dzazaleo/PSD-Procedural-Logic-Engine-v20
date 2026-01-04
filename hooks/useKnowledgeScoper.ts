import { useMemo } from 'react';

export interface ScopedKnowledge {
  scopes: Record<string, string[]>;
  availableScopes: string[];
}

const GLOBAL_KEY = 'GLOBAL CONTEXT';

/**
 * Parses raw text rules into a structured map of Container -> Rules.
 * Mimics the "Knowledge Scoping Protocol" used by the DesignAnalystNode to 
 * partition global guidelines into container-specific directives.
 */
export const useKnowledgeScoper = (rawRules: string | undefined): ScopedKnowledge => {
  return useMemo(() => {
    if (!rawRules) {
      return { 
        scopes: { [GLOBAL_KEY]: [] }, 
        availableScopes: [GLOBAL_KEY] 
      };
    }

    const scopes: Record<string, string[]> = { [GLOBAL_KEY]: [] };
    let currentScope = GLOBAL_KEY;

    // Splits by newline to process line-by-line
    const lines = rawRules.split('\n');

    // REGEX STRATEGY:
    // Detects lines that look like headers.
    // 1. Optional Markdown prefix (##, ###, **, - **)
    // 2. Uppercase Text (allowing spaces, numbers, underscores)
    // 3. Optional Suffix (:, **, ])
    // 4. Strict length check (< 40 chars) to prevent capturing shouted sentences.
    const headerRegex = /^(?:#+\s*|[-*]\s*\*\*\s*|\*\*\s*|\[)?([A-Z][A-Z0-9 _/-]*[A-Z0-9])(?::|\*\*|\])?\s*$/;

    lines.forEach(line => {
      const trimmed = line.trim();
      if (!trimmed) return;

      const match = trimmed.match(headerRegex);
      
      // Heuristic: Headers are usually short and don't end with punctuation like periods
      const isLikelyHeader = match && trimmed.length < 40 && !trimmed.endsWith('.');

      if (isLikelyHeader && match) {
        // Normalize Scope Name
        currentScope = match[1].trim().toUpperCase();
        
        // Initialize scope bucket if new
        if (!scopes[currentScope]) {
          scopes[currentScope] = [];
        }
      } else {
        // It's a rule content line
        // We clean up leading bullets for cleaner specific lists, but keep the text
        const cleanRule = trimmed; //.replace(/^[-*]\s/, ''); 
        scopes[currentScope].push(cleanRule);
      }
    });

    // Cleanup: Remove scopes that have no rules? 
    // No, keep them as it indicates a section exists even if empty (perhaps visual only).

    return {
      scopes,
      availableScopes: Object.keys(scopes)
    };
  }, [rawRules]);
};