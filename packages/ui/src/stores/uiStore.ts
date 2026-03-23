/**
 * Zustand store for UI state management.
 * Tracks active view, sidebar state, theme, and keyboard shortcuts.
 */

import { create } from 'zustand';

export type ViewId = 'garden' | 'seed' | 'evolution' | 'forge' | 'chat' | 'entity';

export interface UiState {
  /** Currently active view. */
  activeView: ViewId;
  /** Whether the sidebar is expanded. */
  sidebarOpen: boolean;
  /** Whether the command palette is open. */
  commandPaletteOpen: boolean;
  /** Backend connection status. */
  connected: boolean;
}

export interface UiActions {
  /** Switch to a different view. */
  setView(view: ViewId): void;
  /** Toggle sidebar open/closed. */
  toggleSidebar(): void;
  /** Set sidebar open state. */
  setSidebarOpen(open: boolean): void;
  /** Toggle command palette. */
  toggleCommandPalette(): void;
  /** Set connection status. */
  setConnected(connected: boolean): void;
}

export const useUiStore = create<UiState & UiActions>((set) => ({
  activeView: 'garden',
  sidebarOpen: true,
  commandPaletteOpen: false,
  connected: false,

  setView(view) {
    set({ activeView: view });
  },

  toggleSidebar() {
    set((state) => ({ sidebarOpen: !state.sidebarOpen }));
  },

  setSidebarOpen(open) {
    set({ sidebarOpen: open });
  },

  toggleCommandPalette() {
    set((state) => ({ commandPaletteOpen: !state.commandPaletteOpen }));
  },

  setConnected(connected) {
    set({ connected });
  },
}));
