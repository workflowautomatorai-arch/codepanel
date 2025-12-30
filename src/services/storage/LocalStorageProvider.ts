import { IStorageProvider, UserSettings } from './StorageProvider';
import { ProgrammingLanguage, UserLanguage, AppMode } from '@shared/api.ts';
import { LOCAL_STORAGE_KEYS } from '@shared/storage';

export class LocalStorageProvider implements IStorageProvider {
  private readonly STORAGE_KEY = LOCAL_STORAGE_KEYS.CODEPANEL_SETTINGS;

  private readonly defaultSettings: UserSettings = {
    solutionLanguage: ProgrammingLanguage.Python,
    userLanguage: UserLanguage.EN_US,
    appMode: AppMode.LIVE_INTERVIEW,
  };

  private safeGetItem(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch (error) {
      // localStorage may be unavailable in private browsing mode or when disabled
      console.warn('Failed to access localStorage:', error);
      return null;
    }
  }

  private safeSetItem(key: string, value: string): boolean {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch (error) {
      // localStorage may throw when quota is exceeded or in private browsing mode
      console.warn('Failed to write to localStorage:', error);
      return false;
    }
  }

  getSettings(): Promise<UserSettings> {
    const stored = this.safeGetItem(this.STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as {
          solutionLanguage?: ProgrammingLanguage;
          userLanguage?: UserLanguage;
          appMode?: AppMode;
        };

        return Promise.resolve({
          solutionLanguage:
            parsed.solutionLanguage || this.defaultSettings.solutionLanguage,
          userLanguage: parsed.userLanguage || this.defaultSettings.userLanguage,
          appMode: parsed.appMode || this.defaultSettings.appMode,
        });
      } catch (error) {
        console.warn('Failed to parse stored settings:', error);
      }
    }

    return Promise.resolve({ ...this.defaultSettings });
  }

  async updateSettings(settings: Partial<UserSettings>): Promise<void> {
    const currentSettings = await this.getSettings();
    const newSettings = { ...currentSettings, ...settings };
    this.safeSetItem(this.STORAGE_KEY, JSON.stringify(newSettings));
  }

  async getSolutionLanguage(): Promise<ProgrammingLanguage> {
    const settings = await this.getSettings();

    return settings.solutionLanguage;
  }

  async setSolutionLanguage(language: ProgrammingLanguage): Promise<void> {
    await this.updateSettings({ solutionLanguage: language });
  }

  async getUserLanguage(): Promise<UserLanguage> {
    const settings = await this.getSettings();

    return settings.userLanguage;
  }

  async setUserLanguage(language: UserLanguage): Promise<void> {
    await this.updateSettings({ userLanguage: language });
  }

  async getAppMode(): Promise<AppMode> {
    const settings = await this.getSettings();

    return settings.appMode;
  }

  async setAppMode(appMode: AppMode): Promise<void> {
    await this.updateSettings({ appMode });
  }
}
