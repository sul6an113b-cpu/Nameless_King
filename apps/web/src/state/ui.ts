/** Transient UI state (never persisted in the model): stage, dock, theme, selection, toasts, save status. */
import { create } from 'zustand';
import type { Stage } from '@looplab/core';

export type ThemeChoice = 'system' | 'light' | 'dark';
export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error' | 'unavailable';

export interface Toast {
  id: number;
  kind: 'info' | 'success' | 'error';
  text: string;
}

export interface FileError {
  message: string;
  issues: string[];
}

export interface UiState {
  stage: Stage;
  dockTab: 'inspector' | 'copilot';
  dockOpen: boolean;
  theme: ThemeChoice;
  /** selected node and link ids (one selection shared by both canvases and the inspector) */
  selection: string[];
  /** variable whose name is being edited inline on the canvas */
  renamingId: string | null;
  /** L: click a source node, then a target node, to add a link */
  linkMode: boolean;
  linkSource: string | null;
  shortcutsOpen: boolean;
  toasts: Toast[];
  saveStatus: SaveStatus;
  fileError: FileError | null;

  setStage: (stage: Stage) => void;
  setDockTab: (tab: 'inspector' | 'copilot') => void;
  setDockOpen: (open: boolean) => void;
  setTheme: (theme: ThemeChoice) => void;
  select: (ids: string[]) => void;
  applySelection: (changes: { id: string; selected: boolean }[]) => void;
  setRenaming: (id: string | null) => void;
  setLinkMode: (on: boolean) => void;
  setLinkSource: (id: string | null) => void;
  setShortcutsOpen: (open: boolean) => void;
  toast: (text: string, kind?: Toast['kind']) => void;
  dismissToast: (id: number) => void;
  setSaveStatus: (s: SaveStatus) => void;
  setFileError: (e: FileError | null) => void;
}

export const TOAST_MS = 4000;
let toastSeq = 0;

const sameIds = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

export const useUiStore = create<UiState>()((set, get) => ({
  stage: 'frame',
  dockTab: 'inspector',
  dockOpen: true,
  theme: 'system',
  selection: [],
  renamingId: null,
  linkMode: false,
  linkSource: null,
  shortcutsOpen: false,
  toasts: [],
  saveStatus: 'idle',
  fileError: null,

  setStage: (stage) => set({ stage, selection: [], renamingId: null, linkMode: false, linkSource: null }),
  setDockTab: (dockTab) => set({ dockTab, dockOpen: true }),
  setDockOpen: (dockOpen) => set({ dockOpen }),
  setTheme: (theme) => set({ theme }),
  select: (ids) => {
    if (!sameIds(ids, get().selection)) set({ selection: ids });
  },
  applySelection: (changes) => {
    const next = new Set(get().selection);
    for (const c of changes) {
      if (c.selected) next.add(c.id);
      else next.delete(c.id);
    }
    get().select([...next]);
  },
  setRenaming: (renamingId) => set({ renamingId }),
  setLinkMode: (linkMode) => set({ linkMode, linkSource: null }),
  setLinkSource: (linkSource) => set({ linkSource }),
  setShortcutsOpen: (shortcutsOpen) => set({ shortcutsOpen }),
  toast: (text, kind = 'info') => {
    const id = ++toastSeq;
    set({ toasts: [...get().toasts, { id, kind, text }].slice(-4) });
    setTimeout(() => get().dismissToast(id), TOAST_MS);
  },
  dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
  setSaveStatus: (saveStatus) => set({ saveStatus }),
  setFileError: (fileError) => set({ fileError }),
}));
