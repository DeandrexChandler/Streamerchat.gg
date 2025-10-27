// User settings types
export interface SimulationSettings {
  chatSpeed: number; // 0.5, 1.0, 1.5, 2.0 messages per second
  micThreshold: number; // 0-100
  useEmotes: boolean;
  profanityFilter: 'filter' | 'replace' | 'off';
  messageLength: 'short' | 'medium' | 'long';
  boredModeEnabled: boolean;
  boredModeDelay: number; // seconds (10-15)
  timestampsEnabled: boolean;
  colorScheme: 'twitch' | 'kick' | 'custom';
  chatPersonality: 'normal' | 'w-community' | 'poggers-community';
}

export interface ThemeSettings {
  mode: 'light' | 'dark';
  primaryColor: string;
  accentColor: string;
}

export interface UserSettings {
  simulation: SimulationSettings;
  theme: ThemeSettings;
  presets: SavedPreset[];
}

export interface SavedPreset {
  id: string;
  name: string;
  settings: SimulationSettings;
  createdAt: string;
}

// Default settings
export const DEFAULT_SETTINGS: UserSettings = {
  simulation: {
    chatSpeed: 1.0,
    micThreshold: 50,
    useEmotes: true,
    profanityFilter: 'replace',
    messageLength: 'short',
    boredModeEnabled: true,
    boredModeDelay: 12,
    timestampsEnabled: true,
    colorScheme: 'twitch',
    chatPersonality: 'normal'
  },
  theme: {
    mode: 'dark',
    primaryColor: '#9333ea',
    accentColor: '#a855f7'
  },
  presets: []
};

const STORAGE_KEY = 'streamer-chat-ai-settings';

/**
 * Load settings from localStorage
 */
export function loadSettings(): UserSettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return DEFAULT_SETTINGS;
    
    const parsed = JSON.parse(stored);
    // Merge with defaults to handle new settings
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      simulation: { ...DEFAULT_SETTINGS.simulation, ...parsed.simulation },
      theme: { ...DEFAULT_SETTINGS.theme, ...parsed.theme }
    };
  } catch (error) {
    console.error('Error loading settings:', error);
    return DEFAULT_SETTINGS;
  }
}

/**
 * Save settings to localStorage
 */
export function saveSettings(settings: UserSettings): void {
  if (typeof window === 'undefined') return;
  
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (error) {
    console.error('Error saving settings:', error);
  }
}

/**
 * Update specific simulation setting
 */
export function updateSimulationSetting<K extends keyof SimulationSettings>(
  key: K,
  value: SimulationSettings[K]
): void {
  const settings = loadSettings();
  settings.simulation[key] = value;
  saveSettings(settings);
}

/**
 * Update theme setting
 */
export function updateThemeSetting<K extends keyof ThemeSettings>(
  key: K,
  value: ThemeSettings[K]
): void {
  const settings = loadSettings();
  settings.theme[key] = value;
  saveSettings(settings);
}

/**
 * Save a preset
 */
export function savePreset(name: string, simulationSettings: SimulationSettings): SavedPreset {
  const settings = loadSettings();
  const preset: SavedPreset = {
    id: crypto.randomUUID(),
    name,
    settings: simulationSettings,
    createdAt: new Date().toISOString()
  };
  
  settings.presets.push(preset);
  saveSettings(settings);
  return preset;
}

/**
 * Load a preset
 */
export function loadPreset(presetId: string): SimulationSettings | null {
  const settings = loadSettings();
  const preset = settings.presets.find(p => p.id === presetId);
  return preset?.settings ?? null;
}

/**
 * Delete a preset
 */
export function deletePreset(presetId: string): void {
  const settings = loadSettings();
  settings.presets = settings.presets.filter(p => p.id !== presetId);
  saveSettings(settings);
}

/**
 * Export settings as JSON file
 */
export function exportSettings(): void {
  const settings = loadSettings();
  const dataStr = JSON.stringify(settings, null, 2);
  const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
  
  const exportFileDefaultName = `streamer-chat-ai-settings-${new Date().toISOString().split('T')[0]}.json`;
  
  const linkElement = document.createElement('a');
  linkElement.setAttribute('href', dataUri);
  linkElement.setAttribute('download', exportFileDefaultName);
  linkElement.click();
}

/**
 * Import settings from JSON file
 */
export function importSettings(file: File): Promise<UserSettings> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const settings = JSON.parse(e.target?.result as string);
        saveSettings(settings);
        resolve(settings);
      } catch (error) {
        reject(new Error('Invalid settings file'));
      }
    };
    
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
}
