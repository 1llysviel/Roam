// 本地草稿与显示偏好：只存在当前浏览器（localStorage），不冒充团队同步结果。
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { EditFile, EditOp } from './edits';

export interface Prefs {
  showCandidates: boolean;
  showLegs: boolean;
  criticalOnly: boolean;
  showEnglish: boolean;
}
export const DEFAULT_PREFS: Prefs = { showCandidates: true, showLegs: true, criticalOnly: false, showEnglish: true };

export interface LocalState {
  editMode: boolean;
  author: string;
  ops: EditOp[];
  submitted: EditFile[]; // 已打开 GitHub 提交页、等待发布确认的批次
  prefs: Prefs;
  lastDay: string | null;
}

const EMPTY: LocalState = { editMode: false, author: '', ops: [], submitted: [], prefs: DEFAULT_PREFS, lastDay: null };

function read(key: string): LocalState {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return EMPTY;
    const v = JSON.parse(raw);
    return { ...EMPTY, ...v, prefs: { ...DEFAULT_PREFS, ...(v.prefs ?? {}) } };
  } catch { return EMPTY; }
}

export function useLocalState(tripId: string | null) {
  const key = `roam:v1:${tripId ?? 'none'}`;
  const [st, setSt] = useState<LocalState>(() => (tripId ? read(key) : EMPTY));
  const [storageOk, setStorageOk] = useState(true);

  useEffect(() => { if (tripId) setSt(read(key)); }, [key, tripId]);
  useEffect(() => {
    if (!tripId) return;
    try { localStorage.setItem(key, JSON.stringify(st)); setStorageOk(true); } catch { setStorageOk(false); }
  }, [key, st, tripId]);

  const update = useCallback((patch: Partial<LocalState> | ((s: LocalState) => Partial<LocalState>)) => {
    setSt((s) => ({ ...s, ...(typeof patch === 'function' ? patch(s) : patch) }));
  }, []);
  return { st, update, storageOk };
}

export interface EditCtx {
  editMode: boolean;
  touchedDraft: Set<string>;
  touchedPending: Set<string>;
  author: string;
  setAuthor: (a: string) => void;
  addOps: (ops: EditOp[]) => void;
  prefs: Prefs;
  setPrefs: (p: Prefs) => void;
}

export const EditContext = createContext<EditCtx>({
  editMode: false, touchedDraft: new Set(), touchedPending: new Set(), author: '', setAuthor: () => {}, addOps: () => {}, prefs: DEFAULT_PREFS, setPrefs: () => {},
});
export const useEdit = () => useContext(EditContext);
