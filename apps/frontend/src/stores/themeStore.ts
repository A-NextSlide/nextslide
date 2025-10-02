import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';
import { Theme, defaultThemes, initialWorkspaceTheme } from '@/types/themes';

interface ThemeStore {
  workspaceThemeId: string;
  availableThemes: Theme[];
  getWorkspaceTheme: () => Theme;
  setWorkspaceTheme: (themeId: string) => void;
  // Global readiness for applying theme to the document (CSS variables & fonts)
  isThemeReady: boolean;
  setThemeReady: (ready: boolean) => void;
  addCustomTheme: (theme: Omit<Theme, 'id' | 'isCustom'>) => string;
  removeCustomTheme: (themeId: string) => void;
  updateCustomTheme: (themeId: string, updates: Partial<Theme>) => void;
  // Persist theme per-outline during outline phase
  outlineThemes: Record<string, Theme>;
  outlineDeckThemes: Record<string, any>;
  setOutlineTheme: (outlineId: string, theme: Theme) => void;
  getOutlineTheme: (outlineId: string) => Theme | undefined;
  setOutlineDeckTheme: (outlineId: string, deckTheme: any) => void;
  getOutlineDeckTheme: (outlineId: string) => any | undefined;
  // Dedup flags to ensure we only request a generated theme once per outline in a session
  outlineThemeRequestFlags: Record<string, boolean>;
  markOutlineThemeRequested: (outlineId: string) => void;
  hasOutlineThemeRequested: (outlineId: string) => boolean;
  clearOutlineThemeRequested?: (outlineId: string) => void;
  resetForNewOutline: (outlineId?: string) => void;
}

export const useThemeStore = create<ThemeStore>()(
  persist(
    (set, get) => ({
      workspaceThemeId: initialWorkspaceTheme.id || '',
      availableThemes: defaultThemes,
      // Default to ready so the app is themed unless a flow explicitly disables it
      isThemeReady: true,
      outlineThemes: {},
      outlineDeckThemes: {},
      outlineThemeRequestFlags: {},

      getWorkspaceTheme: () => {
        const { workspaceThemeId, availableThemes } = get();
        return availableThemes.find(theme => theme.id === workspaceThemeId) || initialWorkspaceTheme;
      },

      setWorkspaceTheme: (themeId) => {
        set({ workspaceThemeId: themeId });
      },

      setThemeReady: (ready) => {
        set({ isThemeReady: ready });
      },

      addCustomTheme: (theme) => {
        const newId = uuidv4();
        const newTheme: Theme = {
          ...theme,
          id: newId,
          isCustom: true
        };

        set(state => ({
          availableThemes: [...state.availableThemes, newTheme]
        }));

        return newId;
      },

      removeCustomTheme: (themeId) => {
        set(state => ({
          availableThemes: state.availableThemes.filter(theme => 
            theme.id !== themeId || theme.isCustom !== true
          )
        }));
      },

      updateCustomTheme: (themeId, updates) => {
        set(state => ({
          availableThemes: state.availableThemes.map(theme => 
            theme.id === themeId && theme.isCustom === true
              ? { ...theme, ...updates }
              : theme
          )
        }));
      },

      setOutlineTheme: (outlineId, theme) => {
        set(state => ({
          outlineThemes: { ...state.outlineThemes, [outlineId]: theme }
        }));
      },

      getOutlineTheme: (outlineId) => {
        const { outlineThemes } = get();
        return outlineThemes[outlineId];
      },

      setOutlineDeckTheme: (outlineId, deckTheme) => {
        set(state => ({
          outlineDeckThemes: { ...state.outlineDeckThemes, [outlineId]: deckTheme }
        }));
      },

      getOutlineDeckTheme: (outlineId) => {
        const { outlineDeckThemes } = get();
        return outlineDeckThemes[outlineId];
      },

      markOutlineThemeRequested: (outlineId) => {
        set(state => ({
          outlineThemeRequestFlags: { ...state.outlineThemeRequestFlags, [outlineId]: true }
        }));
      },

      hasOutlineThemeRequested: (outlineId) => {
        const { outlineThemeRequestFlags } = get();
        return !!outlineThemeRequestFlags[outlineId];
      },

      clearOutlineThemeRequested: (outlineId) => {
        set(state => {
          const { [outlineId]: _ignored, ...rest } = state.outlineThemeRequestFlags;
          return { outlineThemeRequestFlags: rest } as any;
        });
      },

      resetForNewOutline: (outlineId) => {
        const state = get();
        try {
          // Reset workspace theme to default
          set({ workspaceThemeId: initialWorkspaceTheme.id, isThemeReady: false, availableThemes: defaultThemes });
        } catch {}
        try {
          // Remove any custom outline theme for this outline
          if (outlineId) {
            const prev = state.getOutlineTheme?.(outlineId);
            if (prev?.id) {
              state.removeCustomTheme(prev.id);
            }
            // Clear per-outline deck theme cache
            set({ outlineDeckThemes: { ...state.outlineDeckThemes, [outlineId]: null } });
            // Reset outline theme to neutral default
            set({ outlineThemes: { ...state.outlineThemes, [outlineId]: { ...initialWorkspaceTheme, id: initialWorkspaceTheme.id, isCustom: false } as any } });
            // Clear request dedup flag
            const flags = { ...state.outlineThemeRequestFlags };
            delete flags[outlineId];
            set({ outlineThemeRequestFlags: flags });
          }
        } catch {}
      }
    }),
    {
      name: 'slide-sorcery-themes',
      version: 3,
      migrate: (persistedState: any, version: number) => {
        // Fully clear previously persisted theme state to avoid stale theme reuse
        return {} as any;
      },
      // Do not persist any theme state; only use in-memory values per session
      partialize: (_state) => ({})
    }
  )
);