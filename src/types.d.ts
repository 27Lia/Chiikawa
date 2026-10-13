type CharacterId = 'chiikawa' | 'hachiware' | 'usagi' | 'momonga';

interface CharacterConfig {
  id: CharacterId;
  image: string;
  perchXRatio: number;
  size: number;
  reactionType: 'slip' | 'jump' | 'spin' | 'glide';
}

type PinMode = 'desktop' | 'top';

interface AppSettings {
  dragEnabled: boolean;
  reactionsEnabled: boolean;
  autoWalkEnabled: boolean;
  cursorChaseEnabled: boolean;
  pinMode: PinMode;
  characters: Record<CharacterId, boolean>;
}

interface CursorPoint {
  x: number;
  y: number;
}

interface PetAPI {
  setIgnoreMouseEvents(ignore: boolean): void;
  onSettingsChanged(callback: (settings: AppSettings) => void): void;
  onCursorPos(callback: (point: CursorPoint) => void): void;
  grabCursor(payload: { dx: number; dy: number; durationMs: number }): void;
}

interface SettingsAPI {
  getSettings(): Promise<AppSettings>;
  updateSettings(partial: Partial<AppSettings>): void;
  onSettingsChanged(callback: (settings: AppSettings) => void): void;
  getAccessibilityStatus(): Promise<boolean>;
  requestAccessibilityPermission(): Promise<boolean>;
  onAccessibilityStatus(callback: (granted: boolean) => void): void;
}

interface Window {
  petAPI: PetAPI;
  settingsAPI: SettingsAPI;
}
