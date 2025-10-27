import { type EmoteEmotion, type Emote } from './emotes';
import { sanitizeMessage } from './profanity-filter';

// Chat message type
export interface ChatMessage {
  id: string;
  username: string;
  color: string;
  message: string;
  timestamp: Date;
  emotes?: string[]; // Emote names used in message
}

// Username generation
const ADJECTIVES = [
  'Swift', 'Epic', 'Silent', 'Mystic', 'Cosmic', 'Brave', 'Wild', 'Cyber',
  'Neon', 'Phantom', 'Shadow', 'Turbo', 'Ultra', 'Mega', 'Super', 'Hyper',
  'Cool', 'Rad', 'Sick', 'Dope', 'Fresh', 'Lit', 'Fire', 'Based'
];

const NOUNS = [
  'Gamer', 'Wizard', 'Ninja', 'Dragon', 'Phoenix', 'Tiger', 'Wolf', 'Bear',
  'Hawk', 'Eagle', 'Lion', 'Panda', 'Fox', 'Racer', 'Warrior', 'Knight',
  'Mage', 'Ranger', 'Hunter', 'Slayer', 'Master', 'Legend', 'Pro', 'King'
];

// Twitch-like colors
const CHAT_COLORS = [
  '#FF0000', '#0000FF', '#00FF00', '#B22222', '#FF7F50', '#9ACD32',
  '#FF4500', '#2E8B57', '#DAA520', '#D2691E', '#5F9EA0', '#1E90FF',
  '#FF69B4', '#8A2BE2', '#00FF7F'
];

export function generateUsername(): string {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  const num = Math.floor(Math.random() * 999);
  return `${adj}${noun}${num}`;
}

export function getRandomColor(): string {
  return CHAT_COLORS[Math.floor(Math.random() * CHAT_COLORS.length)];
}

// Message templates by emotion
const MESSAGE_TEMPLATES: Record<EmoteEmotion, string[]> = {
  happy: [
    'lol', 'haha', 'nice', 'poggers', 'lets go', 'pog', 'W', 'based',
    'this is great', 'love this', 'amazing', 'so good', 'fire', 'clean'
  ],
  sad: [
    'oh no', 'sadge', 'rip', 'unlucky', 'L', 'pain', 'tragic', 'bruh',
    'thats rough', 'oof', 'not like this', 'why', 'no way'
  ],
  thinking: [
    'hmm', 'wait', 'huh', 'what', 'confused', 'interesting', 'i see',
    'makes sense', 'fair', 'true', 'valid', 'good point'
  ],
  toxic: [
    'ez', 'trash', 'get good', 'cope', 'ratio', 'imagine', 'cringe',
    'yikes', 'cooked', 'washed', 'down bad', 'fell off'
  ],
  neutral: [
    'ok', 'sure', 'yeah', 'noted', 'cool', 'alright', 'got it', 'hi',
    'hey', 'whats up', 'sup', 'yo', 'gg', 'glhf'
  ]
};

// Bored mode templates (longer messages)
const BORED_TEMPLATES = [
  'anyone else watching?',
  'what are we doing today?',
  'hows everyone doing?',
  'chat is this real?',
  'is this thing on?',
  'where is everyone?',
  'just got here, what did I miss?',
  'whats the plan today?',
  'someone clip that',
  'can you guys hear me?',
  'testing testing 123',
  'anyone have any questions?'
];

// Personality-specific message templates
export type ChatPersonality = 'normal' | 'w-community' | 'poggers-community';

const PERSONALITY_TEMPLATES: Record<ChatPersonality, Record<EmoteEmotion, string[]>> = {
  normal: MESSAGE_TEMPLATES,
  'w-community': {
    happy: [
      'W', 'MASSIVE W', 'HUGE W', 'W STREAMER', 'W CHAT', 'GIGACHAD',
      'BASED', 'SO BASED', 'ACTUALLY BASED', 'W TAKE', 'REAL', 'REAL AF'
    ],
    sad: [
      'L', 'MASSIVE L', 'HUGE L', 'L TAKE', 'NOT IT', 'COOKED',
      'DOWN HORRENDOUS', 'DOWN BAD', 'FELL OFF', 'WASHED', 'ITS OVER'
    ],
    thinking: [
      'REAL?', 'IS THIS REAL?', 'WAIT PAUSE', 'HUH?', 'WHAT',
      'NAH WAIT', 'HOLD ON', 'WAIT A MINUTE', 'INTERESTING', 'HMMMM'
    ],
    toxic: [
      'RATIO', 'L + RATIO', 'COPE', 'COPE HARDER', 'IMAGINE', 'CRINGE',
      'YOu FELL OFF', 'WASHED UP', 'GET GOOD', 'EZ CLAP', 'TOO EZ'
    ],
    neutral: [
      'YO', 'YOOO', 'CHAT', 'W CHAT', 'SUP CHAT', 'LESSGO',
      'IM HERE', 'PRESENT', 'YESSIR', 'BET', 'SAY LESS'
    ]
  },
  'poggers-community': {
    happy: [
      'POGGERS', 'POG', 'POGCHAMP', 'SO POG', 'MEGA POG', 'ULTRA POG',
      'POGGIES', 'POG MOMENT', 'THATS POG', 'VERY POG', 'MUCH POG'
    ],
    sad: [
      'SADGE', 'SO SADGE', 'MEGA SADGE', 'PEPEHANDS', 'FEELS BAD MAN',
      'MONKAS', 'MONKA S', 'NOT POG', 'UNLUCKY', 'PAIN PEKO'
    ],
    thinking: [
      'THONK', 'THONKING', 'HMM THONK', '5HEAD', 'BIG BRAIN',
      'WAIT THONK', 'INTERESTING', 'CURIOUS', 'HMMM', 'NOTED'
    ],
    toxic: [
      'KEKW', 'OMEGALUL', 'LULW', 'PEPEGA', 'PEPEGA CLAP',
      'EZ', 'TOO EZ', '4HEAD', 'MALDING', 'COPIUM'
    ],
    neutral: [
      'HELLO', 'HI CHAT', 'HYPERS', 'WAVE', 'CATJAM', 'VIBING',
      'CHILLIN', 'LURK', 'LURKING', 'PEPE JAM', 'BOBBING'
    ]
  }
};

/**
 * Generate chat messages from context
 */
export interface GenerateOptions {
  count?: number; // Number of messages to generate
  emotion?: EmoteEmotion; // Specific emotion or random
  emotes?: Emote[]; // Available emotes
  useEmotes?: boolean; // Include emotes in messages
  messageLength?: 'short' | 'medium' | 'long'; // 1-10, 10-15, 15-20 words
  profanityFilter?: 'filter' | 'replace' | 'off';
  personality?: ChatPersonality; // Chat personality mode
}

export function generateMessages(options: GenerateOptions = {}): ChatMessage[] {
  const {
    count = 1,
    emotion = getRandomEmotion(),
    emotes = [],
    useEmotes = true,
    messageLength = 'short',
    profanityFilter = 'replace',
    personality = 'normal'
  } = options;

  const messages: ChatMessage[] = [];
  
  for (let i = 0; i < count; i++) {
    const username = generateUsername();
    const color = getRandomColor();
    
    // Get base message template from personality
    const templates = PERSONALITY_TEMPLATES[personality][emotion];
    let message = templates[Math.floor(Math.random() * templates.length)];
    
    // Extend message based on length preference
    if (messageLength === 'medium' || messageLength === 'long') {
      const additionalWords = Math.floor(Math.random() * 5) + 3;
      const extraTemplate = templates[Math.floor(Math.random() * templates.length)];
      message += ' ' + extraTemplate;
    }
    
    // Add emote if enabled and available
    if (useEmotes && emotes.length > 0 && Math.random() > 0.5) {
      const emotesForEmotion = emotes.filter(e => e.emotion === emotion);
      if (emotesForEmotion.length > 0) {
        const emote = emotesForEmotion[Math.floor(Math.random() * emotesForEmotion.length)];
        message += ' ' + emote.name;
      }
    }
    
    // Apply profanity filter
    if (profanityFilter !== 'off') {
      const sanitized = sanitizeMessage(message, profanityFilter);
      if (!sanitized) continue; // Skip this message if filtered
      message = sanitized;
    }
    
    messages.push({
      id: crypto.randomUUID(),
      username,
      color,
      message,
      timestamp: new Date(),
      emotes: useEmotes ? extractEmoteNames(message, emotes) : []
    });
  }
  
  return messages;
}

/**
 * Generate bored mode messages (when no speech detected)
 */
export function generateBoredMessage(emotes: Emote[] = []): ChatMessage {
  const username = generateUsername();
  const color = getRandomColor();
  const message = BORED_TEMPLATES[Math.floor(Math.random() * BORED_TEMPLATES.length)];
  
  return {
    id: crypto.randomUUID(),
    username,
    color,
    message,
    timestamp: new Date(),
    emotes: extractEmoteNames(message, emotes)
  };
}

// Helper functions
function getRandomEmotion(): EmoteEmotion {
  const emotions: EmoteEmotion[] = ['happy', 'sad', 'thinking', 'toxic', 'neutral'];
  return emotions[Math.floor(Math.random() * emotions.length)];
}

function extractEmoteNames(message: string, emotes: Emote[]): string[] {
  const words = message.split(' ');
  return words.filter(word => emotes.some(e => e.name === word));
}
