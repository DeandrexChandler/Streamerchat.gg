// Emote type definitions
export type EmoteEmotion = 'happy' | 'sad' | 'toxic' | 'thinking' | 'neutral';

export interface Emote {
  id: string;
  name: string;
  url: string;
  emotion: EmoteEmotion;
  tags: string[];
}

export interface EmoteCache {
  emotes: Emote[];
  lastUpdated: string;
  version: string;
}

// Load emotes from cache file
export async function loadEmotes(): Promise<EmoteCache> {
  try {
    const response = await fetch('/.emote_cache.json');
    if (!response.ok) {
      throw new Error('Failed to load emote cache');
    }
    return await response.json();
  } catch (error) {
    console.error('Error loading emotes:', error);
    return { emotes: [], lastUpdated: new Date().toISOString(), version: '1.0.0' };
  }
}

// Get emotes by emotion
export function getEmotesByEmotion(emotes: Emote[], emotion: EmoteEmotion): Emote[] {
  return emotes.filter(emote => emote.emotion === emotion);
}

// Get random emote by emotion
export function getRandomEmote(emotes: Emote[], emotion: EmoteEmotion): Emote | null {
  const emotesForEmotion = getEmotesByEmotion(emotes, emotion);
  if (emotesForEmotion.length === 0) return null;
  return emotesForEmotion[Math.floor(Math.random() * emotesForEmotion.length)];
}

// Parse message and render emotes
export function parseMessageWithEmotes(message: string, emotes: Emote[]): Array<{ type: 'text' | 'emote', content: string, emote?: Emote }> {
  const words = message.split(' ');
  const result: Array<{ type: 'text' | 'emote', content: string, emote?: Emote }> = [];
  
  for (const word of words) {
    const emote = emotes.find(e => e.name === word);
    if (emote) {
      result.push({ type: 'emote', content: word, emote });
    } else {
      // Add to previous text or create new text segment
      const lastItem = result[result.length - 1];
      if (lastItem && lastItem.type === 'text') {
        lastItem.content += ' ' + word;
      } else {
        result.push({ type: 'text', content: word });
      }
    }
  }
  
  return result;
}

// Validate emote URL (for user additions)
export async function validateEmoteUrl(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { method: 'HEAD' });
    const contentType = response.headers.get('content-type');
    return response.ok && (contentType?.startsWith('image/') ?? false);
  } catch {
    return false;
  }
}
