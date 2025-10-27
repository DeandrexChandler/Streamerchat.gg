// Profanity filter configuration
const PROFANITY_LIST = [
  // Add common profanity here (redacted for example)
  // This list should be comprehensive in production
  'badword1', 'badword2', 'slur1', 'slur2'
];

// More sophisticated filter with pattern matching
const PROFANITY_PATTERNS = PROFANITY_LIST.map(word => ({
  pattern: new RegExp(`\\b${word}\\b`, 'gi'),
  replacement: '***'
}));

/**
 * Sanitize a message by removing or replacing profanity
 * @param message - The message to sanitize
 * @param mode - 'filter' removes the message, 'replace' censors words
 * @returns Sanitized message or null if filtered
 */
export function sanitizeMessage(
  message: string,
  mode: 'filter' | 'replace' = 'replace'
): string | null {
  // Check if message contains profanity
  const containsProfanity = PROFANITY_LIST.some(word => 
    message.toLowerCase().includes(word.toLowerCase())
  );
  
  if (!containsProfanity) {
    return message;
  }
  
  if (mode === 'filter') {
    return null; // Drop the message entirely
  }
  
  // Replace mode: censor the words
  let sanitized = message;
  for (const { pattern, replacement } of PROFANITY_PATTERNS) {
    sanitized = sanitized.replace(pattern, replacement);
  }
  
  return sanitized;
}

/**
 * Batch sanitize multiple messages
 */
export function sanitizeMessages(
  messages: string[],
  mode: 'filter' | 'replace' = 'replace'
): string[] {
  return messages
    .map(msg => sanitizeMessage(msg, mode))
    .filter((msg): msg is string => msg !== null);
}

/**
 * Check if a word is in the profanity list
 */
export function isProfane(word: string): boolean {
  return PROFANITY_LIST.some(profanity => 
    word.toLowerCase().includes(profanity.toLowerCase())
  );
}

/**
 * Add custom profanity words (for user configuration)
 */
export function createCustomFilter(customWords: string[]) {
  const allWords = [...PROFANITY_LIST, ...customWords];
  const patterns = allWords.map(word => ({
    pattern: new RegExp(`\\b${word}\\b`, 'gi'),
    replacement: '***'
  }));
  
  return (message: string, mode: 'filter' | 'replace' = 'replace'): string | null => {
    const containsProfanity = allWords.some(word => 
      message.toLowerCase().includes(word.toLowerCase())
    );
    
    if (!containsProfanity) return message;
    if (mode === 'filter') return null;
    
    let sanitized = message;
    for (const { pattern, replacement } of patterns) {
      sanitized = sanitized.replace(pattern, replacement);
    }
    return sanitized;
  };
}
