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
 * 
 * UPGRADE v2: Enhanced Regex to support:
 * 1. Bracketed names: [Bonus 1], [Header]
 * 2. Markdown headers: ### Header
 * 3. Colon suffixes: Header Name:
 * 4. Bold headers: **Header**
 */
export const useKnowledgeScoper = (rawRules: string | undefined): ScopedKnowledge => {
  return useMemo(() => {
    if (!rawRules) {
      return { 
        scopes: { [GLOBAL_KEY]: [] }, 
        availableScopes: [GLOBAL_KEY] 
      };
    }

    // Initialize with Global Context to ensure it's always first
    const scopes: Record<string, string[]> = { [GLOBAL_KEY]: [] };
    let currentScope = GLOBAL_KEY;

    // Splits by newline to process line-by-line
    const lines = rawRules.split('\n');

    lines.forEach(line => {
      const trimmed = line.trim();
      if (!trimmed) return;

      // --- REGEX STRATEGY ---
      
      // 1. Bracketed Headers: [Container Name]
      // Capture content inside brackets, ignore trailing colons
      const bracketMatch = trimmed.match(/^\[([^\]]+)\]:?$/);

      // 2. Markdown Headers: ### Container Name
      const mdMatch = trimmed.match(/^#+\s+(.+)$/);

      // 3. Colon Headers: Container Name: 
      // Strict length check (< 50) to avoid capturing long sentences ending in colon.
      // allow letters, numbers, spaces, underscores, dashes/slashes
      const colonMatch = trimmed.match(/^([A-Za-z0-9 _/-]+):$/);

      // 4. Bold Headers: **Container Name**
      const boldMatch = trimmed.match(/^\*\*([^*]+)\*\*:?$/);

      let detectedHeader: string | null = null;

      if (bracketMatch) {
          detectedHeader = bracketMatch[1];
      } else if (mdMatch) {
          detectedHeader = mdMatch[1];
      } else if (boldMatch) {
          detectedHeader = boldMatch[1];
      } else if (colonMatch && trimmed.length < 50) {
          detectedHeader = colonMatch[1];
      }

      // --- SCOPING LOGIC ---

      if (detectedHeader) {
          // Normalize to Uppercase for consistent key matching
          const normalizedScope = detectedHeader.trim().toUpperCase();

          // Filter out system tags that might look like headers
          if (normalizedScope !== 'START KNOWLEDGE' && normalizedScope !== 'END KNOWLEDGE') {
              currentScope = normalizedScope;
              
              // Initialize bucket if it doesn't exist
              if (!scopes[currentScope]) {
                  scopes[currentScope] = [];
              }
          }
      } else {
          // It's a rule/content line, add to current scope
          scopes[currentScope].push(trimmed);
      }
    });

    return {
      scopes,
      // Object.keys preserves insertion order for string keys (mostly), 
      // keeping GLOBAL_KEY first as initialized.
      availableScopes: Object.keys(scopes)
    };
  }, [rawRules]);
};