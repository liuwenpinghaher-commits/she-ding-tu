import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { api, apiText, humanizeError } from "../api/client";
import type {
  Beat,
  BookCard,
  BookCraft,
  BookList,
  DossierPayload,
  Entity,
  SceneCard,
  SetupRel,
  UiDraft,
  UiState,
} from "../canon/types";
import { asDraftScene, asScene } from "../canon/types";
import { boardHash, parseHash, writeHash, type BoardQuery, type Route } from "../shell/hash";
import { DEFAULT_TAB, EXTRA_LOOKS, isWorkspaceTab, loadStoredTab, persistTab, readTab, type AnyLook, type TabFilter, type WorkspaceTab } from "../shell/workspaceTabs";
import { loadConstraints } from "../shell/localPrefs";
import { clockDiffs, resolveDependencyClocks } from "../board/timelineGeom";

type TalkPending = { field: string; text: string } | null;

export type SitPacket = {
  intent: string;
  last_value_shift: string;
  stakes: string[];
  knowledge_gaps: string[];
  wrong_beliefs: string[];
  reader_knows: string[];
  reader_irony: string[];
  open_promises: { name: string; id?: string; deadline_clock?: number | null }[];
  open_promises_more: number;
  suggestion: { promise_id: string; op: string; name: string; due: boolean } | null;
};

const EMPTY_SIT: SitPacket = {
  intent: "",
  last_value_shift: "",
  stakes: [],
  knowledge_gaps: [],
  wrong_beliefs: [],
  reader_knows: [],
  reader_irony: [],
  open_promises: [],
  open_promises_more: 0,
  suggestion: null,
};

export interface Store {
  route: Route;
  q: BoardQuery;
  books: BookList;
  state: UiState | null;
  banner: string;
  sidebar: string;
  sit: SitPacket;
  sitError: string;
  selectedChip: { entityId: string; sceneId: string; draft: boolean } | null;
  setSelectedChip: (c: { entityId: string; sceneId: string; draft: boolean } | null) => void;
  drawer: "left" | "right" | null;
  setDrawer: (d: "left" | "right" | null) => void;
  intent: string;
  placeId: string;
  sceneTitle: string;
  doText: string;
  sayText: string;
  thinkText: string;
  valueShift: string;
  causeBeat: string;
  tellingOrd: string;
  visPrivate: boolean;
  visibleTo: string;
  discussOpen: boolean;
  discussDraft: string;
  talkPending: TalkPending;
  fillPending: boolean;
  modelSuggest: boolean;
  opError: string;
  searchHits: Entity[];
  searchEmpty: boolean;
  searchQ: string;
  undoStack: Array<{ kind: string; payload: unknown }>;
  toast: string;
  look: string | null;
  workspaceTab: AnyLook;
  splitTab: WorkspaceTab | null;
  followDependents: boolean;
  tabFilter: TabFilter | null;
  setTabFilter: (f: TabFilter | null) => void;
  splitFilter: TabFilter | null;
  setSplitFilter: (f: TabFilter | null) => void;
  splitLock: boolean;
  setSplitLock: (v: boolean) => void;
  leftKind: string | null;
  setLeftKind: (k: string | null) => void;
  setSplit: (tab: WorkspaceTab | null) => void;
  setFollowDependents: (v: boolean) => void;
  createNear: (id: string, where: "copy" | "above" | "below") => Promise<void>;
  patchSceneField: (id: string, draft: boolean, body: Record<string, unknown>) => Promise<void>;
  line: string | null;
  craftOpen: boolean;
  exportOpen: boolean;
  pasteOpen: boolean;
  pasteText: string;
  exportOut: string;
  exportIncludeDrafts: boolean;
  dossierOpen: boolean;
  dossierLoading: boolean;
  dossierName: string;
  dossierPayload: DossierPayload | null;
  dossierRels: SetupRel[];
  sceneChrome: "dock" | "side" | "full";
  delBookOpen: boolean;
  delBookName: string;
  delBookType: string;
  causedBy: string;
  reviseMsg: string;
  craftMsg: string;
  mentionOpen: boolean;
  mentionQ: string;
  mentionField: string | null;
  slashField: string | null;
  cmd: string | null;
  saveStatus: string;
  committing: boolean;
  fillChunks: { do_text?: string; say_text?: string; think_text?: string } | null;
  presencePicker: string | null;
  cmdOpen: boolean;
  setCmdOpen: (v: boolean) => void;
  writeBusy: boolean;
  fillLiveBusy: boolean;
  notice: string;
  setNotice: (v: string) => void;
  queuedPresence: string[];
  appearNext: (entityId: string) => void;
  toggleComposePerson: (entityId: string) => void;
  plantPromise: () => void;
  fillLive: () => Promise<void>;
  deleteDraftAsk: string | null;
  askDeleteDraft: () => void;
  confirmDeleteDraft: () => Promise<void>;
  cancelDeleteDraft: () => void;
  editingCanon: boolean;
  setEditingCanon: (v: boolean) => void;
  planBones: Array<{ serial?: boolean; intent: string; presence?: string[]; necessity?: string; meet?: string | null; detail?: string }>;
  planNotice: string;
  deleteEntity: (id: string) => Promise<void>;
  planSuggest: () => Promise<void>;
  planApply: (mode: "tail" | "mid") => Promise<void>;
  planDetail: () => void;
  setIntent: (v: string) => void;
  setPlaceId: (v: string) => void;
  setSceneTitle: (v: string) => void;
  setDoText: (v: string) => void;
  setSayText: (v: string) => void;
  setThinkText: (v: string) => void;
  setValueShift: (v: string) => void;
  setCauseBeat: (v: string) => void;
  setTellingOrd: (v: string) => void;
  setVisPrivate: (v: boolean) => void;
  setVisibleTo: (v: string) => void;
  setSearchQ: (v: string) => void;
  setPasteText: (v: string) => void;
  setExportIncludeDrafts: (v: boolean) => void;
  setDelBookType: (v: string) => void;
  setLook: (look: string | null) => void;
  setLine: (line: string | null) => void;
  setWho: (who: string | null) => void;
  setOpen: (open: string | null) => void;
  goShelf: () => void;
  goNew: () => void;
  goBoard: (book?: string, extra?: Partial<BoardQuery>) => void;
  goLibrary: () => void;
  goSettings: () => void;
  openBookTo: (name: string, dest: "board" | "settings" | "library" | "export") => Promise<void>;
  refreshBooks: () => Promise<void>;
  refresh: (opts?: { skipSit?: boolean }) => Promise<void>;
  createBook: (name: string, extra?: { premise?: string; clock?: string; minute?: number; tick?: number; format?: string }) => Promise<void>;
  openBook: (name: string) => Promise<void>;
  deleteBook: (name: string, confirm: string) => Promise<void>;
  writeNext: () => Promise<void>;
  writeParallel: () => Promise<void>;
  addColumn: () => Promise<void>;
  removeColumn: () => Promise<void>;
  mergeColumns: () => Promise<void>;
  swapColumns: () => Promise<void>;
  setWindow: (patch: { n?: number; start?: number; density?: string }) => Promise<void>;
  selectScene: (id: string, draft: boolean) => Promise<void>;
  selectColumn: (columnId: string) => Promise<void>;
  requestCanonEdit: (id: string) => Promise<void>;
  addEntity: (kind: string, name: string, profile?: Record<string, string>) => Promise<void>;
  addPresence: (entityId: string, sceneId?: string) => Promise<void>;
  removePresence: (entityId: string, sceneId?: string, draft?: boolean) => Promise<void>;
  patchScene: (body: Record<string, unknown>) => Promise<void>;
  commit: () => Promise<void>;
  revise: () => Promise<void>;
  createThread: (name: string, type?: string) => Promise<void>;
  attachThread: (nameOrId: string, role?: string, sceneId?: string) => Promise<void>;
  runTalk: (field: string, text: string) => Promise<void>;
  writeBox: () => Promise<void>;
  fillFake: () => Promise<void>;
  addDelta: (entity_id: string, attr: string, value: string, clock_from?: number) => Promise<void>;
  addKnow: (who: string, fact: string, cert?: string, truth?: string, method?: string, source?: string) => Promise<void>;
  addPromiseOp: (promiseId: string, op: string) => Promise<void>;
  applyFillPart: (field: "do_text" | "say_text" | "think_text") => Promise<void>;
  setSlashField: (f: string | null) => void;
  setCmd: (c: string | null) => void;
  clearMention: () => void;
  preview: (op: string, extra?: Record<string, unknown>) => Promise<void>;
  confirmChange: (choice: string) => Promise<void>;
  cancelChange: () => Promise<void>;
  invade: (columnId: string, clockTo: number) => Promise<void>;
  jumpTooth: (i: number) => Promise<void>;
  shiftSceneClock: (id: string, draft: boolean, clockFrom: number, clockTo: number) => Promise<void>;
  createAtClock: (t: number) => Promise<string | undefined>;
  resolveAllClocks: () => Promise<void>;
  reorderTelling: (fromId: string, toIndex: number) => Promise<void>;
  batchTelling: (ids: string[]) => Promise<void>;
  search: () => Promise<void>;
  openDossier: (name: string) => Promise<void>;
  saveDossier: (fields: Record<string, string>) => Promise<void>;
  addRel: (kind: string, target: string) => Promise<void>;
  saveCraft: (craft: BookCraft) => Promise<void>;
  composeBusy: boolean;
  composeOut: string;
  composeMsg: string;
  composeChapter: (chapter?: string, polish?: boolean) => Promise<void>;
  setTelling: () => Promise<void>;
  toggleReadingOrder: () => Promise<void>;
  loadExport: (includeDrafts: boolean) => Promise<void>;
  runPaste: () => Promise<void>;
  applyPaste: (id: string) => Promise<void>;
  deleteCanon: () => Promise<void>;
  makeEllipsis: () => Promise<void>;
  undo: () => Promise<void>;
  setCraftOpen: (v: boolean) => void;
  setExportOpen: (v: boolean) => void;
  setPasteOpen: (v: boolean) => void;
  setDossierOpen: (v: boolean) => void;
  setDelBookOpen: (name?: string) => void;
  setSidebar: (v: string) => void;
  scenes: SceneCard[];
  selectedScene: SceneCard | null;
  currentColId: string;
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [route, setRoute] = useState<Route>({ kind: "shelf" });
  const [q, setQ] = useState<BoardQuery>({
    look: null,
    line: null,
    s: null,
    n: null,
    start: null,
    who: null,
    open: null,
    split: null,
  });
  const [books, setBooks] = useState<BookList>({ books: [], items: [], current: null });
  const [state, setState] = useState<UiState | null>(null);
  const [banner, setBanner] = useState("");
  const [sidebar, setSidebar] = useState("");
  const [intent, setIntent] = useState("");
  const [placeId, setPlaceId] = useState("");
  const [sceneTitle, setSceneTitle] = useState("");
  const [doText, setDoText] = useState("");
  const [sayText, setSayText] = useState("");
  const [thinkText, setThinkText] = useState("");
  const [valueShift, setValueShift] = useState("");
  const [causeBeat, setCauseBeat] = useState("");
  const [tellingOrd, setTellingOrd] = useState("");
  const [visPrivate, setVisPrivate] = useState(false);
  const [visibleTo, setVisibleTo] = useState("");
  const [discussOpen, setDiscussOpen] = useState(false);
  const [discussDraft, setDiscussDraft] = useState("");
  const [talkPending, setTalkPending] = useState<TalkPending>(null);
  const [fillPending, setFillPending] = useState(false);
  const [modelSuggest, setModelSuggest] = useState(false);
  const [opError, setOpError] = useState("");
  const [searchHits, setSearchHits] = useState<Entity[]>([]);
  const [searchEmpty, setSearchEmpty] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const [undoStack, setUndoStack] = useState<Array<{ kind: string; payload: unknown }>>([]);
  const undoStackRef = useRef(undoStack);
  const resetUndo = () => {
    undoStackRef.current = [];
    setUndoStack([]);
  };
  const pushUndo = (entry: { kind: string; payload: unknown }) => {
    const next = [...undoStackRef.current, entry];
    undoStackRef.current = next;
    setUndoStack(next);
  };
  const [followDependents, setFollowDependentsState] = useState(true);
  const [tabFilter, setTabFilter] = useState<TabFilter | null>(null);
  const [splitFilter, setSplitFilter] = useState<TabFilter | null>(null);
  const [splitLock, setSplitLock] = useState(false);
  const [leftKind, setLeftKind] = useState<string | null>(null);
  const [toast, setToast] = useState("");
  const [craftOpen, setCraftOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [exportOut, setExportOut] = useState("");
  const [exportIncludeDrafts, setExportIncludeDrafts] = useState(true);
  const [dossierOpen, setDossierOpen] = useState(false);
  const [dossierLoading, setDossierLoading] = useState(false);
  const [dossierName, setDossierName] = useState("");
  const [dossierPayload, setDossierPayload] = useState<DossierPayload | null>(null);
  const [dossierRels, setDossierRels] = useState<SetupRel[]>([]);
  const [delBookOpen, setDelBookOpen] = useState(false);
  const [delBookName, setDelBookName] = useState("");
  const [delBookType, setDelBookType] = useState("");
  const [causedBy, setCausedBy] = useState("");
  const [reviseMsg, setReviseMsg] = useState("");
  const [craftMsg, setCraftMsg] = useState("");
  const [composeBusy, setComposeBusy] = useState(false);
  const [composeOut, setComposeOut] = useState("");
  const [composeMsg, setComposeMsg] = useState("");
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQ, setMentionQ] = useState("");
  const [mentionField, setMentionField] = useState<string | null>(null);
  const [slashField, setSlashField] = useState<string | null>(null);
  const [cmd, setCmd] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState("");
  const [committing, setCommitting] = useState(false);
  const [fillChunks, setFillChunks] = useState<{ do_text?: string; say_text?: string; think_text?: string } | null>(null);
  const [presencePicker, setPresencePicker] = useState<string | null>(null);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [writeBusy, setWriteBusy] = useState(false);
  const [fillLiveBusy, setFillLiveBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [queuedPresence, setQueuedPresence] = useState<string[]>([]);
  const queuedPresenceRef = useRef<string[]>([]);
  const [deleteDraftAsk, setDeleteDraftAsk] = useState<string | null>(null);
  const [editingCanon, setEditingCanon] = useState(false);
  const [planBones, setPlanBones] = useState<Array<{ serial?: boolean; intent: string; presence?: string[]; necessity?: string; meet?: string | null; detail?: string }>>([]);
  const [planNotice, setPlanNotice] = useState("");
  const pendingPlanRef = useRef<{
    bones: Array<{ serial?: boolean; intent: string; presence?: string[]; necessity?: string; meet?: string | null; detail?: string }>;
    goalId: string;
  } | null>(null);

  const failOp = useCallback((e: unknown, fallback: string) => {
    const raw = e instanceof Error ? e.message : fallback;
    const msg = humanizeError(raw || fallback);
    setOpError(msg);
    setNotice(msg);
    setToast(msg);
    return msg;
  }, []);
  const [sit, setSit] = useState<SitPacket>(EMPTY_SIT);
  const [sitError, setSitError] = useState("");
  const [selectedChip, setSelectedChip] = useState<{ entityId: string; sceneId: string; draft: boolean } | null>(null);
  const [drawer, setDrawer] = useState<"left" | "right" | null>(null);
  const refreshGen = useRef(0);
  const booksGen = useRef(0);
  const editorSel = useRef<string | null>(null);
  const lastDraftId = useRef<string | null>(null);
  const dirty = useRef<Set<string>>(new Set());
  const syncHash = useCallback(() => {
    const { route: r, q: nq } = parseHash(location.hash);
    setRoute(r);
    setQ(nq);
  }, []);

  useEffect(() => {
    syncHash();
    window.addEventListener("hashchange", syncHash);
    return () => window.removeEventListener("hashchange", syncHash);
  }, [syncHash]);

  const refreshBooks = useCallback(async () => {
    const mine = ++booksGen.current;
    const list = await api<BookList>("/api/books");
    if (mine !== booksGen.current) return;
    setBooks(list);
  }, []);

  const applyState = useCallback((st: UiState) => {
    setState(st);
    if (st.world_error) setNotice(st.world_error);
    const sel = st.selected
      ? st.drafts.find((d) => d.id === st.selected)
      : null;
    const canon = st.selected_canon
      ? st.committed.find((b) => b.id === st.selected_canon)
      : null;
    const sid = st.selected || st.selected_canon || null;
    const switched = sid !== editorSel.current;
    if (switched) {
      editorSel.current = sid;
      dirty.current.clear();
    }
    const take = (key: string, fn: () => void) => {
      if (switched || !dirty.current.has(key)) fn();
    };
    if (sel) {
      take("intent", () => setIntent(sel.draft.intent || ""));
      take("place", () => setPlaceId(sel.draft.place_id || ""));
      take("do", () => setDoText(sel.draft.do_text || ""));
      take("say", () => setSayText(sel.draft.say_text || ""));
      take("think", () => setThinkText(sel.draft.think_text || ""));
      take("shift", () => setValueShift(sel.draft.value_shift || ""));
      take("cause", () => setCauseBeat(sel.draft.cause_beat || ""));
      take("title", () => setSceneTitle(sel.title || ""));
      take("telling", () => setTellingOrd(sel.draft.telling_ord != null ? String(sel.draft.telling_ord) : ""));
      take("vis", () => {
        setVisPrivate(!!sel.draft.visible_to?.length);
        setVisibleTo((sel.draft.visible_to || []).join("，"));
      });
    } else if (canon) {
      take("intent", () => setIntent(canon.intent || ""));
      take("place", () => setPlaceId(canon.place_id || ""));
      take("do", () => setDoText(canon.do_text || ""));
      take("say", () => setSayText(canon.say_text || ""));
      take("think", () => setThinkText(canon.think_text || ""));
      take("shift", () => setValueShift(canon.value_shift || ""));
      take("cause", () => setCauseBeat(canon.cause_beat || ""));
      take("title", () => setSceneTitle(""));
      take("telling", () => setTellingOrd(canon.telling_ord != null ? String(canon.telling_ord) : ""));
      take("vis", () => {
        setVisPrivate(!!canon.visible_to?.length);
        setVisibleTo((canon.visible_to || []).join("，"));
      });
    } else {
      take("intent", () => setIntent(""));
      take("place", () => setPlaceId(""));
      take("do", () => setDoText(""));
      take("say", () => setSayText(""));
      take("think", () => setThinkText(""));
      take("shift", () => setValueShift(""));
      take("cause", () => setCauseBeat(""));
      take("title", () => setSceneTitle(""));
      take("telling", () => setTellingOrd(""));
      take("vis", () => {
        setVisPrivate(false);
        setVisibleTo("");
      });
    }
  }, []);

  const loadSit = useCallback(async (st?: UiState | null) => {
    try {
      const r = await api<{
        empty?: boolean;
        packet?: {
          intent?: string;
          last_value_shift?: string | null;
          knowledge_gaps?: string[];
          stakes?: string[];
          open_promises?: { id?: string; name: string; deadline_clock?: number | null }[];
          wrong_beliefs?: string[];
          reader_knows?: string[];
          reader_irony?: string[];
        };
        suggestion?: { promise_id?: string; op?: string } | null;
        open_promises_more?: number;
      }>("/api/circumstances");
      if (r.empty && !r.packet) {
        setSit(EMPTY_SIT);
        setSitError("");
        return;
      }
      const pkt = r.packet;
      const bits = ["本场规定情境"];
      const last = (st?.committed || []).slice(-1)[0];
      if (last) bits.push("上场 " + [last.value_shift, last.intent, last.do_text].filter(Boolean).join(" "));
      if (pkt?.last_value_shift) bits.push("上场 " + pkt.last_value_shift);
      if (pkt?.knowledge_gaps?.length) bits.push("知情 " + pkt.knowledge_gaps.join("；"));
      if (pkt?.stakes?.length) bits.push(pkt.stakes.join("；"));
      if (pkt?.wrong_beliefs?.length) bits.push(pkt.wrong_beliefs.join("；"));
      if (pkt?.open_promises?.length) bits.push(pkt.open_promises.map((p) => p.name).join(" "));
      if ((st?.promises || []).length) bits.push((st?.promises || []).map((p) => p.name).join(" "));
      if (bits.length > 1) setSidebar(bits.join(" · "));
      const lastShift = pkt?.last_value_shift || [last?.value_shift, last?.intent].filter(Boolean).join(" ");
      const opens = (pkt?.open_promises || []).slice(0, 5);
      const sug = r.suggestion?.promise_id && r.suggestion.op
        ? {
            promise_id: r.suggestion.promise_id,
            op: r.suggestion.op,
            name: opens.find((p) => p.id === r.suggestion?.promise_id)?.name
              || (st?.promises || []).find((p) => p.id === r.suggestion?.promise_id)?.name
              || r.suggestion.promise_id,
            due: r.suggestion.op === "payoff",
          }
        : null;
      setSit({
        intent: pkt?.intent || "",
        last_value_shift: lastShift || "",
        stakes: pkt?.stakes || [],
        knowledge_gaps: pkt?.knowledge_gaps || [],
        wrong_beliefs: pkt?.wrong_beliefs || [],
        reader_knows: pkt?.reader_knows || [],
        reader_irony: pkt?.reader_irony || [],
        open_promises: opens,
        open_promises_more: r.open_promises_more || 0,
        suggestion: sug,
      });
      setSitError("");
    } catch (e) {
      setSit(EMPTY_SIT);
      const raw = e instanceof Error ? e.message : "算出这一刻失败";
      setSitError(`这一刻没算成：${raw}。不会改去问模型现在世界怎样。`);
    }
  }, []);

  const refresh = useCallback(async (opts?: { skipSit?: boolean }) => {
    const mine = ++refreshGen.current;
    try {
      const st = await api<UiState>("/api/state");
      if (mine !== refreshGen.current) return;
      applyState(st);
      setBanner("");
      if (!opts?.skipSit) {
        loadSit(st).catch(() => {});
      }
      if (st.book) {
        const live = parseHash(location.hash).q;
        const extra: Partial<BoardQuery> = {
          look: live.look,
          line: live.line,
          s: live.s || st.selected || st.selected_canon,
          n: st.n,
          start: st.window_start,
          who: live.who,
          open: live.open,
          split: live.split,
        };
        writeHash(boardHash(st.book, extra));
      }
    } catch (e) {
      if (mine !== refreshGen.current) return;
      setState(null);
      setBanner(e instanceof Error ? e.message : "打不开这本书");
    }
  }, [applyState, loadSit]);

  useEffect(() => {
    refreshBooks().catch(() => {});
  }, [refreshBooks]);

  useEffect(() => {
    const book = state?.book;
    if (!book) return;
    try {
      setFollowDependentsState(localStorage.getItem(`setting-follow:${book}`) !== "0");
    } catch {
      setFollowDependentsState(true);
    }
  }, [state?.book]);

  useEffect(() => {
    if (route.kind === "board" || route.kind === "library" || route.kind === "settings" || route.kind === "dossier" || route.kind === "scene" || route.kind === "export") {
      const book = "book" in route ? route.book : "";
      if (!book) return;
      if (state?.book === book) return;
      api<BookList>(`/api/books/${encodeURIComponent(book)}/open`, { method: "POST", body: "{}" })
        .then(async () => {
          const live = parseHash(location.hash).q;
          const sceneId = route.kind === "scene" ? route.scene : live.s;
          if (live.n != null || live.start != null) {
            await api("/api/window", { method: "POST", body: JSON.stringify({ n: live.n, start: live.start, density: live.n === 2 ? "sparse" : live.n === 6 ? "dense" : live.n === 4 ? "mid" : undefined }) });
          }
          if (sceneId) {
            try {
              const st = await api<UiState>("/api/state");
              const isDraft = (st.drafts || []).some((d) => d.id === sceneId);
              await api("/api/select", { method: "POST", body: JSON.stringify(isDraft ? { draft_id: sceneId } : { canon_id: sceneId }) });
            } catch {
              /* 场不在则忽略 */
            }
          }
          if (live.who) {
            await api("/api/lens", { method: "POST", body: JSON.stringify({ person: live.who }) });
          }
          await refresh();
        })
        .catch((e) => setBanner(String(e.message || e)));
    }
  }, [route, refresh, state?.book]);

  const hashApplied = useRef("");
  useEffect(() => {
    if (!state?.book) return;
    if (route.kind !== "board" && route.kind !== "scene") return;
    const sel = state.selected || state.selected_canon || "";
    const sceneId = route.kind === "scene" ? route.scene : q.s;
    const sig = `${state.book}|${sceneId || ""}|${q.n ?? ""}|${q.start ?? ""}`;
    if (hashApplied.current === sig) return;
    const needN = q.n != null && q.n !== state.n;
    const needStart = q.start != null && q.start !== state.window_start;
    const needS = !!(sceneId && sceneId !== sel);
    if (!needN && !needStart && !needS) {
      hashApplied.current = sig;
      return;
    }
    hashApplied.current = sig;
    (async () => {
      try {
        if (needN || needStart) {
          await api("/api/window", {
            method: "POST",
            body: JSON.stringify({ n: q.n ?? state.n, start: q.start ?? state.window_start }),
          });
        }
        if (needS && sceneId) {
          const isDraft = (state.drafts || []).some((d) => d.id === sceneId)
            || !(state.committed || []).some((b) => b.id === sceneId);
          await api("/api/select", {
            method: "POST",
            body: JSON.stringify(isDraft ? { draft_id: sceneId } : { canon_id: sceneId }),
          });
        }
        await refresh();
      } catch {
        /* 地址栏对不上时忽略 */
      }
    })();
  }, [route.kind, q.s, q.n, q.start, state?.book, state?.n, state?.window_start, state?.selected, state?.selected_canon, refresh, state?.drafts]);

  const goShelf = useCallback(() => {
    writeHash("#/");
    void refreshBooks();
  }, [refreshBooks]);
  const goNew = useCallback(() => writeHash("#/new"), []);
  const goBoard = useCallback((book?: string, extra?: Partial<BoardQuery>) => {
    const name = book || state?.book || books.current;
    if (!name) {
      writeHash("#/");
      return;
    }
    writeHash(boardHash(name, { look: q.look, line: q.line, s: q.s, n: q.n, start: q.start, ...extra }));
  }, [state?.book, books.current, q]);
  const goLibrary = useCallback(() => {
    const name = state?.book;
    if (name) writeHash(`#/b/${encodeURIComponent(name)}/library`);
  }, [state?.book]);
  const goSettings = useCallback(() => {
    const name = state?.book;
    if (name) writeHash(`#/b/${encodeURIComponent(name)}/settings`);
  }, [state?.book]);

  const setLook = useCallback((look: string | null) => {
    const name = state?.book;
    if (!name) return;
    if (look && (EXTRA_LOOKS as readonly string[]).includes(look)) {
      writeHash(boardHash(name, { ...q, look, n: state.n, start: state.window_start, s: q.s || state.selected || state.selected_canon }));
      return;
    }
    const tab = isWorkspaceTab(look) ? look : DEFAULT_TAB;
    persistTab(name, tab);
    writeHash(boardHash(name, { ...q, look: tab, n: state.n, start: state.window_start, s: q.s || state.selected || state.selected_canon }));
  }, [state, q]);

  const setSplit = useCallback((tab: WorkspaceTab | null) => {
    const name = state?.book;
    if (!name) return;
    writeHash(boardHash(name, {
      ...q,
      split: tab,
      n: state.n,
      start: state.window_start,
      s: q.s || state.selected || state.selected_canon,
    }));
  }, [state, q]);

  const setFollowDependents = useCallback((v: boolean) => {
    setFollowDependentsState(v);
    const book = state?.book;
    if (!book) return;
    try {
      localStorage.setItem(`setting-follow:${book}`, v ? "1" : "0");
    } catch {
      /* 无痕 */
    }
  }, [state?.book]);

  const setLine = useCallback((line: string | null) => {
    const name = state?.book;
    if (!name) return;
    writeHash(boardHash(name, { ...q, line, n: state.n, start: state.window_start }));
  }, [state, q]);

  const setWho = useCallback((who: string | null) => {
    const name = state?.book;
    if (!name) return;
    writeHash(boardHash(name, { ...q, who, n: state.n, start: state.window_start }));
    api("/api/lens", { method: "POST", body: JSON.stringify({ person: who || "" }) }).catch(() => {});
  }, [state, q]);

  const setOpen = useCallback((open: string | null) => {
    const name = state?.book;
    const sel = state?.selected || state?.selected_canon;
    if (!name) return;
    if (open === "full" && sel) {
      writeHash(`#/b/${encodeURIComponent(name)}/s/${encodeURIComponent(sel)}`);
      return;
    }
    writeHash(boardHash(name, { ...q, open, s: q.s || sel, n: state.n, start: state.window_start }));
  }, [state, q]);

  const createBook = useCallback(async (name: string, extra?: { premise?: string; clock?: string; minute?: number; tick?: number; format?: string }) => {
    const body: Record<string, unknown> = { name };
    if (extra?.premise) body.premise = extra.premise;
    if (extra?.clock) body.clock_origin_label = extra.clock;
    if (extra?.minute) body.clock_origin_minute = extra.minute;
    if (extra?.format) body.clock_format = extra.format;
    await api("/api/books", { method: "POST", body: JSON.stringify(body) });
    if (extra?.tick || extra?.minute || extra?.format) {
      await api(`/api/books/${encodeURIComponent(name)}`, {
        method: "PATCH",
        body: JSON.stringify({
          minutes_per_tick: extra.tick,
          clock_origin_minute: extra.minute,
          clock_format: extra.format,
          clock_origin_label: extra.clock,
          premise: extra.premise,
        }),
      }).catch(() => {});
    }
    resetUndo();
    writeHash(boardHash(name, { n: 1, start: 0, look: DEFAULT_TAB }));
    await refresh();
    void refreshBooks();
  }, [refresh, refreshBooks]);

  const openBookTo = useCallback(async (name: string, dest: "board" | "settings" | "library" | "export") => {
    await api(`/api/books/${encodeURIComponent(name)}/open`, { method: "POST", body: "{}" });
    resetUndo();
    if (dest === "settings") writeHash(`#/b/${encodeURIComponent(name)}/settings`);
    else if (dest === "library") writeHash(`#/b/${encodeURIComponent(name)}/library`);
    else if (dest === "export") {
      writeHash(boardHash(name));
      setExportOpen(true);
    } else writeHash(boardHash(name));
    await refresh();
    void refreshBooks();
    if (dest === "export") {
      const md = await apiText("/api/export");
      setExportOut(md);
    }
  }, [refresh, refreshBooks]);

  const openBook = useCallback(async (name: string) => {
    await api(`/api/books/${encodeURIComponent(name)}/open`, { method: "POST", body: "{}" });
    resetUndo();
    const tab = readTab(name, loadStoredTab(name), null);
    writeHash(boardHash(name, { look: tab }));
    await refresh();
  }, [refresh]);

  const deleteBook = useCallback(async (name: string, confirm: string) => {
    await api(`/api/books/${encodeURIComponent(name)}?confirm=${encodeURIComponent(confirm)}`, { method: "DELETE" });
    setDelBookOpen(false);
    setDelBookType("");
    await refreshBooks();
    setState(null);
    writeHash("#/");
    setToast(`已删掉 ${name}`);
  }, [refreshBooks]);

  const writeNext = useCallback(async () => {
    const typed = (document.querySelector<HTMLInputElement>("[data-testid=intent]")?.value ?? intent).trim();
    if (!typed) return;
    setWriteBusy(true);
    setOpError("");
    try {
      const r = await api<{ id?: string; new_column?: boolean }>("/api/write-next", {
        method: "POST",
        body: JSON.stringify({ intent: typed, place_id: placeId || undefined }),
      });
      if (state?.book) {
        persistTab(state.book, "分场条");
        writeHash(boardHash(state.book, { ...q, look: "分场条", n: state.n, start: state.window_start, s: r.id || q.s }));
      }
      await refresh();
      if (r.id) {
        lastDraftId.current = r.id;
        await api("/api/select", { method: "POST", body: JSON.stringify({ draft_id: r.id }) });
        const queued = [...queuedPresenceRef.current];
        for (const entityId of queued) {
          await api("/api/presence", {
            method: "POST",
            body: JSON.stringify({ draft_id: r.id, entity_id: entityId, action: "add" }),
          });
        }
        queuedPresenceRef.current = [];
        setQueuedPresence([]);
        setPresencePicker("open");
        await refresh();
        setNotice("已写下这场草稿。任务、地点、人物可以直接改。");
        setToast(r.new_column ? "在最后加了一列草稿，还不是正史。" : "已插一场草稿");
        requestAnimationFrame(() => document.querySelector<HTMLInputElement>("[data-testid=intent]")?.focus());
      }
    } catch (e) {
      failOp(e, "写下失败");
    } finally {
      setWriteBusy(false);
    }
  }, [intent, placeId, refresh, state, q, failOp]);

  const writeParallel = useCallback(async () => {
    const selectedId = state?.selected || state?.selected_canon;
    const fromScene = [...(state?.drafts || []).map((d) => ({ id: d.id, column_id: d.draft.column_id })), ...(state?.committed || []).map((b) => ({ id: b.id, column_id: b.column_id }))].find((x) => x.id === selectedId);
    const col = fromScene?.column_id || state?.selected_col || state?.columns[state.window_start]?.id;
    const c = (state?.columns || []).find((x) => x.id === col);
    const typed = (document.querySelector<HTMLInputElement>("[data-testid=intent]")?.value ?? intent).trim();
    let r: { id?: string };
    try {
      r = await api<{ id?: string }>("/api/write-parallel", {
        method: "POST",
        body: JSON.stringify({
          intent: typed || intent,
          column_id: col,
          place_id: placeId || undefined,
          clock_from: c?.clock_from,
          clock_to: c?.clock_to,
        }),
      });
    } catch (e) {
      failOp(e, "本列再写一场失败");
      return;
    }
    if (state?.book) {
      persistTab(state.book, "分场条");
      writeHash(boardHash(state.book, { ...q, look: "分场条", n: state.n, start: state.window_start, s: q.s || state.selected || state.selected_canon }));
    }
    await refresh();
    if (r.id) {
      await api("/api/select", { method: "POST", body: JSON.stringify({ draft_id: r.id }) });
      await refresh();
      setNotice("已在本列再写一场草稿。");
      setToast("已插一场草稿");
    }
  }, [intent, placeId, refresh, state, q, failOp]);

  const setWindow = useCallback(async (patch: { n?: number; start?: number; density?: string }) => {
    try {
      await api("/api/window", { method: "POST", body: JSON.stringify(patch) });
      await refresh();
    } catch (e) {
      failOp(e, "窗口没改成");
    }
  }, [refresh, failOp]);

  const selectScene = useCallback(async (id: string, draft: boolean) => {
    if (draft) lastDraftId.current = id;
    if (state?.book) {
      writeHash(boardHash(state.book, { ...q, s: id, n: state.n, start: state.window_start }));
    }
    await api("/api/select", {
      method: "POST",
      body: JSON.stringify(draft ? { draft_id: id } : { canon_id: id }),
    });
    setReviseMsg("");
    setEditingCanon(false);
    setPlanBones([]);
    setPlanNotice("");
    await refresh();
    try {
      const sc = await api<{ caused?: { intent?: string }[] }>(`/api/scenes/${encodeURIComponent(id)}`);
      const caused = (sc.caused || []).map((x) => x.intent || "").filter(Boolean).join("；");
      setCausedBy(caused);
    } catch {
      setCausedBy("");
    }
  }, [refresh, state, q]);

  const selectColumn = useCallback(async (columnId: string) => {
    try {
      if (state?.book) {
        writeHash(boardHash(state.book, { ...q, s: null, n: state.n, start: state.window_start }));
      }
      await api("/api/select", {
        method: "POST",
        body: JSON.stringify({ column_id: columnId, draft_id: "", canon_id: "" }),
      });
      await refresh();
    } catch (e) {
      failOp(e, "选不了这一列");
    }
  }, [refresh, failOp, state, q]);

  const requestCanonEdit = useCallback(async (id: string) => {
    await selectScene(id, false);
    setEditingCanon(true);
    setNotice("这场已是正史。改完再点「写入这次改动」。第几次写入正史不变。");
  }, [selectScene]);

  const addEntity = useCallback(async (kind: string, name: string, profile?: Record<string, string>) => {
    await api("/api/entities", {
      method: "POST",
      body: JSON.stringify({ id: name, kind, name, profile }),
    });
    setToast(`${name}已写入设定。写一场让它出场。`);
    setNotice("已写入设定，还没上场。打开档案可点「写一场让它出场」。不会自动进这场在场。");
    await refresh();
  }, [refresh]);

  const appearNext = useCallback((entityId: string) => {
    const id = entityId.trim();
    if (!id) return;
    if (!queuedPresenceRef.current.includes(id)) {
      queuedPresenceRef.current = [...queuedPresenceRef.current, id];
      setQueuedPresence(queuedPresenceRef.current);
    }
    setNotice("先写一行本场任务，点写下一场，会把它带进这场在场。");
    requestAnimationFrame(() => document.querySelector<HTMLInputElement>("[data-testid=intent]")?.focus());
  }, []);

  const addPresence = useCallback(async (entityId: string, sceneId?: string) => {
    const id = sceneId || state?.selected || state?.selected_canon;
    if (!id) return;
    const isDraft = !!state?.drafts?.some((d) => d.id === id);
    try {
      await api("/api/presence", {
        method: "POST",
        body: JSON.stringify(isDraft
          ? { draft_id: id, entity_id: entityId, action: "add" }
          : { canon_id: id, entity_id: entityId, action: "add" }),
      });
      void refresh({ skipSit: true });
    } catch (e) {
      failOp(e, "加不上在场");
    }
  }, [refresh, state?.selected, state?.selected_canon, state?.drafts, failOp]);

  const removePresence = useCallback(async (entityId: string, sceneId?: string, draft?: boolean) => {
    const id = sceneId || state?.selected || state?.selected_canon;
    if (!id) return;
    const isDraft = draft ?? (!!state?.drafts?.some((d) => d.id === id));
    try {
      await api("/api/presence", {
        method: "POST",
        body: JSON.stringify(isDraft
          ? { draft_id: id, entity_id: entityId, action: "remove" }
          : { canon_id: id, entity_id: entityId, action: "remove" }),
      });
      setSelectedChip(null);
      void refresh({ skipSit: true });
    } catch (e) {
      setToast(e instanceof Error ? e.message : "拿不掉");
    }
  }, [refresh, state?.selected, state?.selected_canon, state?.drafts]);

  const patchScene = useCallback(async (body: Record<string, unknown>) => {
    const id = state?.selected;
    if (!id) return;
    await api("/api/drafts/patch", { method: "POST", body: JSON.stringify({ id, ...body }) });
    await refresh();
  }, [refresh, state?.selected]);

  const patchSceneField = useCallback(async (id: string, draft: boolean, body: Record<string, unknown>) => {
    if (body.telling_ord != null) {
      const all = [...(state?.committed || []).map(asScene), ...(state?.drafts || []).map(asDraftScene)];
      const sc = all.find((x) => x.id === id);
      if (sc) {
        pushUndo({ kind: "telling", payload: { id, draft, telling_ord: sc.telling_ord ?? null } });
      }
      if (draft) {
        await api("/api/drafts/patch", { method: "POST", body: JSON.stringify({ id, telling_ord: body.telling_ord }) });
      } else {
        await api("/api/telling", { method: "POST", body: JSON.stringify({ beat_id: id, telling_ord: body.telling_ord }) });
      }
      const rest = { ...body };
      delete rest.telling_ord;
      if (Object.keys(rest).length === 0) {
        setToast("已改读序");
        await refresh();
        return;
      }
      body = rest;
    }
    if (!draft) {
      const lockedKeys = ["do_text", "say_text", "think_text", "place_id", "value_shift"];
      if (Object.keys(body).some((k) => lockedKeys.includes(k)) && (!editingCanon || state?.selected_canon !== id)) {
        setToast("这场已是正史。要点「改这一场」才动。");
        setNotice("这场已是正史。要点「改这一场」才动。");
        return;
      }
    }
    try {
      if (draft) {
        await api("/api/drafts/patch", { method: "POST", body: JSON.stringify({ id, ...body }) });
      } else {
        await api(`/api/beats/${encodeURIComponent(id)}/revise`, {
          method: "POST",
          body: JSON.stringify(body),
        });
      }
      await refresh();
    } catch (e) {
      failOp(e, "没改上");
    }
  }, [refresh, state, editingCanon, failOp]);

  const commit = useCallback(async () => {
    const id = state?.selected;
    if (!id) {
      setSidebar("没有选中的草稿，不能写入正史");
      return;
    }
    const typed = (document.querySelector<HTMLInputElement>("[data-testid=intent]")?.value ?? intent).trim();
    if (!typed) {
      setSidebar("没有本场任务，不能写入正史");
      return;
    }
    const body: Record<string, unknown> = {
      id,
      intent: typed,
      do_text: doText,
      say_text: sayText,
      think_text: thinkText,
      value_shift: valueShift || undefined,
      place_id: placeId || undefined,
      title: sceneTitle || undefined,
      cause_beat: causeBeat || undefined,
    };
    if (visPrivate && visibleTo.trim()) {
      body.visible_to = visibleTo.split(/[,，]/).map((s) => s.trim()).filter(Boolean);
    }
    setCommitting(true);
    setOpError("");
    try {
      await api("/api/drafts/patch", { method: "POST", body: JSON.stringify(body) });
      await api("/api/commit", { method: "POST", body: JSON.stringify({ id }) });
      setToast("已写入正史。不能撤销。接着写下一场。");
      setModelSuggest(false);
      dirty.current.clear();
      await refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "写入正史失败";
      setSidebar(msg);
      setOpError(msg);
      setToast(msg);
    } finally {
      setCommitting(false);
    }
  }, [state?.selected, intent, doText, sayText, thinkText, valueShift, placeId, sceneTitle, causeBeat, visPrivate, visibleTo, refresh]);

  const deleteEntity = useCallback(async (id: string) => {
    await api("/api/entities/delete", { method: "POST", body: JSON.stringify({ id }) });
    setDossierOpen(false);
    setToast(`已删掉设定 ${id}`);
    await refresh();
  }, [refresh]);

  const planSuggest = useCallback(async () => {
    const id = state?.selected || state?.selected_canon;
    if (!id) return;
    if (!intent.trim()) {
      setPlanNotice("目标场没有本场任务，不能给铺场建议");
      return;
    }
    setPlanNotice("正在想…");
    try {
      const r = await api<{
        bones?: Array<{ serial?: boolean; intent: string; presence?: string[]; necessity?: string; meet?: string | null; detail?: string }>;
        notice?: string;
        need_structure?: boolean;
        summary?: string;
      }>("/api/plan-suggest", { method: "POST", body: JSON.stringify({ goal_id: id }) });
      if (r.need_structure) {
        setPlanBones([]);
        setPlanNotice(r.notice || "这一段没有空，先加列或把前面那列拉长，确认变更后再铺。");
        return;
      }
      setPlanBones(r.bones || []);
      setPlanNotice((r.summary ? r.summary + "。" : "") + (r.notice || "建议不进历史，不算进算出这一刻。"));
    } catch (e) {
      setPlanNotice(e instanceof Error ? e.message : "铺场建议失败");
    }
  }, [state?.selected, state?.selected_canon, intent]);

  const planDetail = useCallback(() => {
    if (!planBones.length) {
      setPlanNotice("先建议这一段怎么铺。细稿可选，按旧世界生成，不算进算出这一刻。");
      return;
    }
    setPlanBones((rows) => rows.map((b) => ({
      ...b,
      detail: b.detail || "（按旧世界生成）尚未写出对白。点「模型填这一场」时只吃规定情境六块。",
    })));
    setPlanNotice("细稿按旧世界生成，不算进算出这一刻，不指定写哪一场。点「模型填这一场」才进讨论框。");
  }, [planBones.length]);

  const planApply = useCallback(async (mode: "tail" | "mid") => {
    const id = state?.selected || state?.selected_canon;
    if (!id || !planBones.length) return;
    if (mode === "mid") {
      pendingPlanRef.current = { bones: planBones, goalId: id };
      try {
        await api("/api/structure/preview", {
          method: "POST",
          body: JSON.stringify({ op: "plan_mid", beat_id: id }),
        });
        await refresh();
        setPlanNotice("插在中间须先确认变更。确认后才会落成预场草稿。");
      } catch (e) {
        pendingPlanRef.current = null;
        setPlanNotice(e instanceof Error ? e.message : "插在中间须先确认变更");
      }
      return;
    }
    try {
      await api("/api/plan-apply", {
        method: "POST",
        body: JSON.stringify({
          goal_id: id,
          mode,
          bones: planBones,
        }),
      });
      setToast("已落成预场草稿，须一场一场写入正史");
      setPlanBones([]);
      await refresh();
    } catch (e) {
      setPlanNotice(e instanceof Error ? e.message : "落下失败");
    }
  }, [state?.selected, state?.selected_canon, planBones, refresh]);

  const revise = useCallback(async () => {
    const id = state?.selected_canon;
    if (!id) return;
    await api(`/api/beats/${encodeURIComponent(id)}/revise`, {
      method: "POST",
      body: JSON.stringify({
        do_text: doText,
        say_text: sayText,
        think_text: thinkText,
        intent,
        value_shift: valueShift,
        place_id: placeId,
        cause_beat: causeBeat || undefined,
        deltas: state.committed.find((b) => b.id === id)?.deltas,
        knowledge_writes: state.committed.find((b) => b.id === id)?.knowledge_writes,
      }),
    });
    const seq = state.committed.find((b) => b.id === id)?.commit_seq;
    setReviseMsg(`第几次写入正史仍是 ${seq}`);
    setEditingCanon(false);
    await refresh();
  }, [state, doText, sayText, thinkText, intent, valueShift, placeId, causeBeat, refresh]);

  const createThread = useCallback(async (name: string, type = "支线") => {
    const t = await api<{ id: string; name: string }>("/api/threads", {
      method: "POST",
      body: JSON.stringify({ name, type }),
    });
    const id = state?.selected;
    if (id) {
      const d = state?.drafts.find((x) => x.id === id);
      const cur = [...(d?.draft.story_threads || [])];
      cur.push({ id: t.id, role: "推进" });
      await api("/api/drafts/patch", { method: "POST", body: JSON.stringify({ id, story_threads: cur }) });
    } else if (state?.selected_canon) {
      const b = state.committed.find((x) => x.id === state.selected_canon);
      const cur = [...(b?.story_threads || [])];
      cur.push({ id: t.id, role: "推进" });
      await api(`/api/beats/${encodeURIComponent(state.selected_canon)}/revise`, {
        method: "POST",
        body: JSON.stringify({ story_threads: cur }),
      });
    }
    await refresh();
  }, [state, refresh]);

  const attachThread = useCallback(async (nameOrId: string, role = "推进", sceneId?: string) => {
    const t = (state?.threads || []).find((x) => x.id === nameOrId || x.name === nameOrId);
    if (!t) return;
    const apply = (cur: { id: string; role?: string }[]) => {
      const next = [...cur];
      const i = next.findIndex((x) => x.id === t.id);
      if (i >= 0) next[i] = { ...next[i], id: t.id, role };
      else next.push({ id: t.id, role });
      return next;
    };
    const id = sceneId || state?.selected || state?.selected_canon;
    if (!id) return;
    const d = state?.drafts.find((x) => x.id === id);
    if (d) {
      const cur = apply(d.draft.story_threads || []);
      await api("/api/drafts/patch", { method: "POST", body: JSON.stringify({ id, story_threads: cur }) });
    } else {
      if (!editingCanon) {
        setToast("这场已是正史。要点「改这一场」才动。");
        setNotice("这场已是正史。要点「改这一场」才动。");
        return;
      }
      const b = state?.committed.find((x) => x.id === id);
      const cur = apply(b?.story_threads || []);
      await api(`/api/beats/${encodeURIComponent(id)}/revise`, {
        method: "POST",
        body: JSON.stringify({ story_threads: cur }),
      });
    }
    await refresh();
  }, [state, refresh, editingCanon]);

  const runTalk = useCallback(async (field: string, text: string) => {
    const fallback = "讨论稿：可再改";
    setDiscussOpen(true);
    setDiscussDraft(fallback);
    setTalkPending({ field, text: fallback });
    const id = state?.selected;
    if (!id) return;
    try {
      const r = await api<{ reply?: string; concerns?: { kind?: string; message?: string }[]; notice?: string }>(
        "/api/talk",
        { method: "POST", body: JSON.stringify({ id, field, text }) },
      );
      const opt = (r.concerns || []).find((c) => c.kind === "option");
      const pending = "讨论稿：" + ((opt && opt.message) || r.reply || "可再改");
      setTalkPending({ field, text: pending });
      setDiscussDraft(pending);
      setSidebar(r.notice || "讨论不是历史");
    } catch (e) {
      setTalkPending({ field, text: fallback });
      setDiscussDraft(fallback);
      setSidebar(String((e as Error).message || e));
    }
  }, [state?.selected]);

  const writeBox = useCallback(async () => {
    const id = state?.selected;
    if (!id) return;
    if (fillPending) {
      await api("/api/drafts/patch", {
        method: "POST",
        body: JSON.stringify({ id, apply_fill: true, intent }),
      });
      setFillPending(false);
      setFillChunks(null);
      setTalkPending(null);
      setDiscussDraft("");
      setDiscussOpen(false);
      dirty.current.delete("do");
      dirty.current.delete("say");
      dirty.current.delete("think");
      await refresh();
      setToast("已放到这个格子，仍是草稿");
      return;
    }
    if (!talkPending) return;
    const field = talkPending.field;
    const text = talkPending.text;
    if (field === "intent") setIntent(text);
    else if (field === "value_shift") setValueShift(text);
    else if (field === "say_text") setSayText(text);
    else if (field === "think_text") setThinkText(text);
    else setDoText(text);
    const patch: Record<string, unknown> = { id };
    if (field === "intent") patch.intent = text;
    else if (field === "value_shift") patch.value_shift = text;
    else if (field === "say_text") patch.say_text = text;
    else if (field === "think_text") patch.think_text = text;
    else patch.do_text = text;
    await api("/api/drafts/patch", { method: "POST", body: JSON.stringify(patch) });
    setTalkPending(null);
    setDiscussDraft("");
    setDiscussOpen(false);
    setToast("已放到这个格子，仍是草稿");
    await refresh();
  }, [state?.selected, fillPending, talkPending, intent, refresh]);

  const fillFake = useCallback(async () => {
    const id = state?.selected || lastDraftId.current || state?.drafts.at(-1)?.id;
    if (!id || !intent.trim()) {
      setOpError("先写下这场草稿，再让模型填。");
      return;
    }
    let r: { do_text?: string; say_text?: string; think_text?: string };
    try {
      r = await api<{ do_text?: string; say_text?: string; think_text?: string }>("/api/fill-fake", {
        method: "POST",
        body: JSON.stringify({ id }),
      });
    } catch (e) {
      failOp(e, "模型没填成");
      return;
    }
    setFillChunks({ do_text: r.do_text, say_text: r.say_text, think_text: r.think_text });
    const lines = [
      r.do_text ? `动作：${r.do_text}` : "动作：",
      r.say_text ? `对白：${r.say_text}` : "",
      r.think_text ? `内心：${r.think_text}` : "",
    ].filter(Boolean);
    setDiscussDraft(lines.join("\n") || "动作：");
    setDiscussOpen(true);
    setFillPending(true);
    setModelSuggest(true);
    setOpError("");
  }, [state?.selected, state?.drafts, intent, failOp]);

  const fillLive = useCallback(async () => {
    const id = state?.selected || lastDraftId.current || state?.drafts.at(-1)?.id;
    if (!id || !intent.trim()) {
      setNotice("先写一行本场任务，再让模型填。");
      setOpError("先写一行本场任务，再让模型填。");
      return;
    }
    setFillLiveBusy(true);
    setOpError("");
    setNotice("正在让模型填这场…");
    try {
      const r = await api<{
        do_text?: string;
        say_text?: string;
        think_text?: string;
        literary_thin?: boolean;
        literary_notice?: string;
      }>("/api/fill-live", {
        method: "POST",
        body: JSON.stringify({ id }),
      });
      setFillChunks({ do_text: r.do_text, say_text: r.say_text, think_text: r.think_text });
      const lines = [
        r.do_text ? `动作：${r.do_text}` : "动作：",
        r.say_text ? `对白：${r.say_text}` : "",
        r.think_text ? `内心：${r.think_text}` : "",
      ].filter(Boolean);
      setDiscussDraft(lines.join("\n") || "动作：");
      setDiscussOpen(true);
      setFillPending(true);
      setModelSuggest(true);
      setNotice(
        r.literary_thin
          ? (r.literary_notice || "这篇像复述，仍可改后写入正史")
          : "模型稿在讨论框里。点「放到这个格子」才进草稿，定稿还要再点写入正史。",
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "模型没填成";
      setNotice(msg);
      setOpError(msg);
    } finally {
      setFillLiveBusy(false);
    }
  }, [state?.selected, state?.drafts, intent]);

  const toggleComposePerson = useCallback((entityId: string) => {
    const sceneId = state?.selected || state?.selected_canon;
    if (sceneId) {
      const sc = [...(state?.drafts || []).map((d) => ({ id: d.id, ids: (d.draft.presences || []).map((p) => p.entity_id) })),
        ...(state?.committed || []).map((b) => ({ id: b.id, ids: (b.presences || []).map((p) => p.entity_id) }))]
        .find((x) => x.id === sceneId);
      const on = sc?.ids.includes(entityId);
      if (on) void removePresence(entityId, sceneId);
      else void addPresence(entityId, sceneId);
      return;
    }
    const next = queuedPresenceRef.current.includes(entityId)
      ? queuedPresenceRef.current.filter((id) => id !== entityId)
      : [...queuedPresenceRef.current, entityId];
    queuedPresenceRef.current = next;
    setQueuedPresence(next);
  }, [state, addPresence, removePresence]);

  const plantPromise = useCallback(() => {
    setLeftKind("promise");
    const acc = document.querySelector<HTMLDetailsElement>(".right-rail details.acc:last-of-type");
    if (acc) acc.open = true;
    const el = document.querySelector<HTMLElement>("[data-testid=promise-ops]");
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("flash-target");
      window.setTimeout(() => el.classList.remove("flash-target"), 1600);
      setNotice("伏笔在右边账目里。先建一条，再埋/推/兑/废。");
    } else {
      setNotice("先打开一场，伏笔在场页账目里。");
    }
  }, []);

  const askDeleteDraft = useCallback(() => {
    const id = state?.selected;
    if (!id || !state?.drafts?.some((d) => d.id === id)) {
      setNotice("没有选中的草稿。");
      return;
    }
    setDeleteDraftAsk(id);
  }, [state?.selected, state?.drafts]);

  const cancelDeleteDraft = useCallback(() => setDeleteDraftAsk(null), []);

  const confirmDeleteDraft = useCallback(async () => {
    const id = deleteDraftAsk;
    if (!id) return;
    await api("/api/delete-draft", { method: "POST", body: JSON.stringify({ id, confirm: true }) });
    setDeleteDraftAsk(null);
    setNotice("已丢掉这场草稿。正史没动。");
    setToast("已删这场草稿");
    await refresh();
  }, [deleteDraftAsk, refresh]);

  const applyFillPart = useCallback(async (field: "do_text" | "say_text" | "think_text") => {
    const id = state?.selected;
    const chunk = fillChunks?.[field];
    if (!id || !chunk) return;
    if (field === "do_text") setDoText(chunk);
    if (field === "say_text") setSayText(chunk);
    if (field === "think_text") setThinkText(chunk);
    await api("/api/drafts/patch", { method: "POST", body: JSON.stringify({ id, [field]: chunk }) });
    setToast("已放到这个格子，仍是草稿");
  }, [state?.selected, fillChunks]);

  const addDelta = useCallback(async (entity_id: string, attr: string, value: string, clock_from = 0) => {
    const id = state?.selected || state?.selected_canon;
    if (!id) return;
    const scene = state?.drafts.find((d) => d.id === id) || null;
    const canon = state?.committed.find((b) => b.id === id);
    const prev = [...((scene?.draft.deltas || canon?.deltas || []) as { entity_id: string }[])];
    const row = { entity_id, attr, value, clock_from, clock_to: null };
    const next = [...undoStackRef.current, { kind: "delta", payload: { id, deltas: prev } }];
    undoStackRef.current = next;
    setUndoStack(next);
    if (scene) {
      await api("/api/drafts/patch", {
        method: "POST",
        body: JSON.stringify({ id, deltas: [...(scene.draft.deltas || []), row] }),
      });
    } else if (canon) {
      if (!editingCanon) {
        setToast("这场已是正史。要点「改这一场」才动。");
        setNotice("这场已是正史。要点「改这一场」才动。");
        return;
      }
      await api(`/api/beats/${encodeURIComponent(id)}/revise`, {
        method: "POST",
        body: JSON.stringify({ deltas: [...(canon.deltas || []), row] }),
      });
    }
    await refresh();
    const leaveInputs = () => {
      try { (document.activeElement as HTMLElement | null)?.blur(); } catch { /* ignore */ }
      document.querySelector<HTMLElement>("[data-testid=delta-list]")?.focus();
    };
    leaveInputs();
    requestAnimationFrame(() => requestAnimationFrame(leaveInputs));
  }, [state, refresh, editingCanon]);

  const addKnow = useCallback(async (who: string, fact: string, cert = "knows", truth?: string, method?: string, source?: string) => {
    const id = state?.selected || state?.selected_canon;
    if (!id) return;
    const row = {
      person_id: who,
      fact,
      certainty: cert,
      truth_value: truth || null,
      method: method || null,
      source_person: source || null,
    };
    const scene = state?.drafts.find((d) => d.id === id);
    const canonRow = state?.committed.find((b) => b.id === id);
    if (scene) {
      await api("/api/drafts/patch", {
        method: "POST",
        body: JSON.stringify({ id, knowledge_writes: [...(scene.draft.knowledge_writes || []), row] }),
      });
    } else if (canonRow) {
      if (!editingCanon) {
        setToast("这场已是正史。要点「改这一场」才动。");
        setNotice("这场已是正史。要点「改这一场」才动。");
        return;
      }
      await api(`/api/beats/${encodeURIComponent(id)}/revise`, {
        method: "POST",
        body: JSON.stringify({ knowledge_writes: [...(canonRow.knowledge_writes || []), row] }),
      });
    }
    await refresh();
  }, [state, refresh, editingCanon]);

  const addPromiseOp = useCallback(async (promiseId: string, op: string) => {
    const id = state?.selected;
    if (!id) return;
    const scene = state?.drafts.find((d) => d.id === id);
    if (!scene) return;
    const cur = [...(scene.draft.promise_ops || [])];
    cur.push({ promise_id: promiseId, op });
    await api("/api/drafts/patch", { method: "POST", body: JSON.stringify({ id, promise_ops: cur }) });
    await refresh();
  }, [state, refresh]);

  const preview = useCallback(async (op: string, extra?: Record<string, unknown>) => {
    try {
      await api("/api/structure/preview", { method: "POST", body: JSON.stringify({ op, ...extra }) });
      await refresh();
    } catch (e) {
      failOp(e, "预览失败");
    }
  }, [refresh, failOp]);

  const confirmChange = useCallback(async (choice: string) => {
    try {
      await api("/api/structure/confirm", { method: "POST", body: JSON.stringify({ choice }) });
      const pendingPlan = pendingPlanRef.current;
      pendingPlanRef.current = null;
      await refresh();
      if (pendingPlan && choice !== "cancel") {
        try {
          await api("/api/plan-apply", {
            method: "POST",
            body: JSON.stringify({
              goal_id: pendingPlan.goalId,
              mode: "mid",
              bones: pendingPlan.bones,
              structure_confirmed: true,
            }),
          });
          setToast("已落成预场草稿，须一场一场写入正史");
          setPlanBones([]);
          await refresh();
        } catch (e) {
          setPlanNotice(e instanceof Error ? e.message : "落下失败");
        }
      } else {
        setToast("已改时间结构");
      }
    } catch (e) {
      failOp(e, "确认变更失败");
    }
  }, [refresh, failOp]);

  const cancelChange = useCallback(async () => {
    pendingPlanRef.current = null;
    try {
      await api("/api/structure/cancel", { method: "POST", body: "{}" });
      await refresh();
    } catch {
      /* 没开书或没有待确认的改动 */
    }
  }, [refresh]);

  const invade = useCallback(async (columnId: string, clockTo: number) => {
    await preview("invade", { column_id: columnId, clock_to: clockTo });
  }, [preview]);

  const jumpTooth = useCallback(async (i: number) => {
    await setWindow({ start: i });
  }, [setWindow]);

  const resolveAllClocks = useCallback(async () => {
    const all = [...(state?.committed || []).map(asScene), ...(state?.drafts || []).map(asDraftScene)];
    const book = state?.book || "";
    const after = resolveDependencyClocks(
      all.map((s) => ({ id: s.id, clock_from: s.clock_from, clock_to: s.clock_to, cause_beat: s.cause_beat })),
      loadConstraints(book),
    );
    const diffs = clockDiffs(
      all.map((s) => ({ id: s.id, clock_from: s.clock_from, clock_to: s.clock_to })),
      after,
    );
    if (!diffs.length) return;
    const snaps = diffs.map((d) => {
      const sc = all.find((x) => x.id === d.id)!;
      return { id: sc.id, draft: sc.draft, clock_from: sc.clock_from, clock_to: sc.clock_to };
    });
    pushUndo({ kind: "clocks", payload: snaps });
    for (const d of diffs) {
      const sc = all.find((x) => x.id === d.id);
      if (!sc) continue;
      await api("/api/clocks", {
        method: "POST",
        body: JSON.stringify({ id: d.id, draft: sc.draft, clock_from: d.from, clock_to: d.to, follow: false }),
      });
    }
    setToast(`已按依赖排好 ${diffs.length} 场`);
    await refresh();
  }, [state, refresh]);

  const writeClock = useCallback(async (id: string, draft: boolean, clockFrom: number, clockTo: number, follow = false) => {
    try {
      await api("/api/clocks", {
        method: "POST",
        body: JSON.stringify({ id, draft, clock_from: clockFrom, clock_to: clockTo, follow }),
      });
      return "clocks" as const;
    } catch {
      if (!draft) throw new Error("改钟没写上");
      await api("/api/drafts/patch", {
        method: "POST",
        body: JSON.stringify({ id, clock_from: clockFrom, clock_to: clockTo }),
      });
      return "patch" as const;
    }
  }, []);

  const shiftSceneClock = useCallback(async (id: string, draft: boolean, clockFrom: number, clockTo: number) => {
    if (!draft) {
      await preview("set_clocks", {
        beat_id: id,
        clock_from: clockFrom,
        clock_to: clockTo,
        follow: followDependents,
      });
      return;
    }
    const all = [...(state?.committed || []).map(asScene), ...(state?.drafts || []).map(asDraftScene)];
    const sc = all.find((x) => x.id === id);
    if (sc) {
      const snaps = [{ id: sc.id, draft: sc.draft, clock_from: sc.clock_from, clock_to: sc.clock_to }];
      if (followDependents) {
        for (const x of all) {
          if (x.id !== id && x.clock_from >= sc.clock_to) {
            snaps.push({ id: x.id, draft: x.draft, clock_from: x.clock_from, clock_to: x.clock_to });
          }
        }
      }
      pushUndo({ kind: "clocks", payload: snaps });
    }
    try {
      const via = await writeClock(id, draft, clockFrom, clockTo, followDependents);
      if (via === "patch" && followDependents && sc) {
        const dlt = clockFrom - sc.clock_from;
        if (dlt) {
          for (const x of all) {
            if (x.id === id || !x.draft || x.clock_from < sc.clock_to) continue;
            await writeClock(x.id, true, x.clock_from + dlt, x.clock_to + dlt, false);
          }
        }
      }
    } catch (e) {
      failOp(e, "改钟没写上");
      return;
    }
    const moved = followDependents ? all.filter((x) => x.id !== id && x.clock_from >= (sc?.clock_to ?? 0)).length : 0;
    setToast(moved > 0 ? `已改钟，带着 ${moved} 场` : "已改钟");
    await refresh();
  }, [refresh, state, followDependents, writeClock, preview, failOp]);

  const createNear = useCallback(async (id: string, where: "copy" | "above" | "below") => {
    const all = [...(state?.committed || []).map(asScene), ...(state?.drafts || []).map(asDraftScene)];
    const sc = all.find((x) => x.id === id);
    const dur = Math.max(30, (sc?.clock_to ?? 60) - (sc?.clock_from ?? 0));
    const label = where === "copy" ? `${sc?.intent || "新场"}（副本）` : (sc?.intent || "新场");
    const t = where === "above"
      ? Math.max(0, (sc?.clock_from ?? 0) - dur)
      : where === "below"
        ? (sc?.clock_to ?? 0)
        : (sc?.clock_from ?? 0);
    const r = await api<{ id?: string }>("/api/write-next", {
      method: "POST",
      body: JSON.stringify({ intent: label, place_id: sc?.place_id || placeId || undefined }),
    });
    if (r.id) {
      await writeClock(r.id, true, t, t + dur, false);
      await api("/api/select", { method: "POST", body: JSON.stringify({ draft_id: r.id }) });
    }
    await refresh();
    setToast("已插一场草稿");
  }, [state, placeId, refresh, writeClock]);

  const createAtClock = useCallback(async (t: number) => {
    const label = intent.trim() || "新场";
    const r = await api<{ id?: string }>("/api/write-next", {
      method: "POST",
      body: JSON.stringify({ intent: label, place_id: placeId || undefined }),
    });
    if (r.id) {
      const from = Math.max(0, t);
      await writeClock(r.id, true, from, from + 60, false);
      await api("/api/select", { method: "POST", body: JSON.stringify({ draft_id: r.id }) });
    }
    await refresh();
    return r.id;
  }, [intent, placeId, refresh, writeClock]);

  const reorderTelling = useCallback(async (fromId: string, toIndex: number) => {
    const draft = (state?.drafts || []).some((d) => d.id === fromId);
    const ord = toIndex + 1;
    if (draft) {
      await api("/api/drafts/patch", { method: "POST", body: JSON.stringify({ id: fromId, telling_ord: ord }) });
    } else {
      await api("/api/telling", { method: "POST", body: JSON.stringify({ beat_id: fromId, telling_ord: ord }) });
    }
    await refresh();
  }, [refresh, state?.drafts]);

  const batchTelling = useCallback(async (ids: string[]) => {
    const all = [...(state?.committed || []).map(asScene), ...(state?.drafts || []).map(asDraftScene)];
    const snaps = ids.map((id) => {
      const sc = all.find((x) => x.id === id);
      return { id, draft: !!sc?.draft, telling_ord: sc?.telling_ord ?? null as number | null };
    });
    if (!snaps.length) return;
    pushUndo({ kind: "telling-batch", payload: snaps });
    for (let i = 0; i < ids.length; i++) {
      const sc = all.find((x) => x.id === ids[i]);
      if (!sc) continue;
      const ord = i + 1;
      if (sc.draft) {
        await api("/api/drafts/patch", { method: "POST", body: JSON.stringify({ id: sc.id, telling_ord: ord }) });
      } else {
        await api("/api/telling", { method: "POST", body: JSON.stringify({ beat_id: sc.id, telling_ord: ord }) });
      }
    }
    setToast("已改读序");
    await refresh();
  }, [refresh, state]);

  const search = useCallback(async () => {
    if (!searchQ.trim()) return;
    try {
      const r = await api<{ hits?: Entity[] } | Entity[]>(`/api/search?q=${encodeURIComponent(searchQ)}`);
      const hits = Array.isArray(r) ? r : r.hits || [];
      setSearchHits(hits);
      setSearchEmpty(hits.length === 0);
    } catch {
      setSearchHits([]);
      setSearchEmpty(true);
    }
  }, [searchQ]);

  const openDossier = useCallback(async (name: string) => {
    setDossierName(name);
    setDossierPayload(null);
    setDossierRels([]);
    setDossierLoading(true);
    setDossierOpen(true);
    try {
      const d = await api<DossierPayload & {
        relations?: SetupRel[];
        rels?: SetupRel[];
      }>(`/api/dossier/${encodeURIComponent(name)}`);
      setDossierPayload(d);
      const setup = (d.relations_setup || []).map((r) => ({
        id: r.id || `${r.kind}-${r.other}`,
        kind: r.kind,
        from: r.direction === "in" ? (r.other_name || r.other || "") : name,
        to: r.direction === "in" ? name : (r.other_name || r.other || ""),
        note: "",
      }));
      setDossierRels(setup.length ? setup : (d.relations || d.rels || []));
    } catch (e) {
      setDossierPayload(null);
      setDossierRels([]);
      failOp(e, "档案打不开");
    } finally {
      setDossierLoading(false);
    }
  }, [failOp]);

  const saveDossier = useCallback(async (fields: Record<string, string>) => {
    await api(`/api/dossier/${encodeURIComponent(dossierName)}`, {
      method: "POST",
      body: JSON.stringify({ profile: fields }),
    });
    await refresh();
  }, [dossierName, refresh]);

  const addRel = useCallback(async (kind: string, target: string) => {
    await api(`/api/entities/${encodeURIComponent(dossierName)}/relations`, {
      method: "POST",
      body: JSON.stringify({ kind, target }),
    });
    await openDossier(dossierName);
  }, [dossierName, openDossier]);

  const saveCraft = useCallback(async (craft: BookCraft) => {
    await api("/api/craft", { method: "POST", body: JSON.stringify(craft) });
    setCraftMsg("已写入书页");
    await refresh();
  }, [refresh]);

  const composeChapter = useCallback(async (chapter?: string, polish = true) => {
    setComposeBusy(true);
    setComposeMsg("正在拼章…");
    try {
      const r = await api<{
        export_md?: string;
        hanzi?: number;
        auto_canon?: boolean;
        fact_check?: { ok?: boolean };
      }>("/api/compose-chapter", {
        method: "POST",
        body: JSON.stringify({ chapter: chapter || "", polish }),
      });
      setComposeOut(r.export_md || "");
      const ok = r.fact_check?.ok ? "事实集一致" : "事实集有出入，稿未写回正史";
      setComposeMsg(`已拼 ${r.hanzi || 0} 字，${ok}。未写入正史。`);
    } catch (e) {
      failOp(e, "拼章失败");
      setComposeMsg("拼章失败");
    } finally {
      setComposeBusy(false);
    }
  }, [failOp]);

  const setTelling = useCallback(async () => {
    const id = state?.selected_canon || state?.committed[0]?.id;
    const ord = Number(tellingOrd);
    if (!id || Number.isNaN(ord)) return;
    await api("/api/telling", { method: "POST", body: JSON.stringify({ beat_id: id, telling_ord: ord }) });
    await refresh();
  }, [state, tellingOrd, refresh]);

  const toggleReadingOrder = useCallback(async () => {
    await api("/api/reading-order", { method: "POST", body: "{}" });
    await refresh();
  }, [refresh]);

  const loadExport = useCallback(async (includeDrafts: boolean) => {
    const qs = includeDrafts ? "" : "?canon_only=1";
    const md = await apiText(`/api/export${qs}`);
    setExportOut(md);
  }, []);

  const runPaste = useCallback(async () => {
    const draftId = state?.selected || lastDraftId.current || state?.drafts.at(-1)?.id;
    await api("/api/paste", { method: "POST", body: JSON.stringify({ text: pasteText }) });
    await refresh();
    if (draftId) {
      lastDraftId.current = draftId;
      await api("/api/select", { method: "POST", body: JSON.stringify({ draft_id: draftId }) });
      await refresh();
    }
  }, [pasteText, refresh, state?.selected, state?.drafts]);

  const applyPaste = useCallback(async (id: string) => {
    await api("/api/paste/apply", { method: "POST", body: JSON.stringify({ id }) });
    await refresh();
  }, [refresh]);

  const deleteCanon = useCallback(async () => {
    const id = state?.selected_canon;
    if (!id) return;
    await preview("delete_canon", { beat_id: id });
  }, [state?.selected_canon, preview]);

  const makeEllipsis = useCallback(async () => {
    const id = state?.selected;
    if (!id) {
      setSidebar("没有选中的草稿，不能标省略场");
      return;
    }
    await api("/api/ellipsis", { method: "POST", body: JSON.stringify({ id, intent: intent || "省略" }) });
    await refresh();
  }, [state?.selected, intent, refresh]);

  const undo = useCallback(async () => {
    const stack = undoStackRef.current;
    const last = stack[stack.length - 1];
    if (!last) return;
    const rest = stack.slice(0, -1);
    undoStackRef.current = rest;
    setUndoStack(rest);
    try {
      if (last.kind === "clocks") {
        const snaps = last.payload as Array<{ id: string; draft: boolean; clock_from: number; clock_to: number }>;
        for (const p of snaps) {
          await writeClock(p.id, p.draft, p.clock_from, p.clock_to, false);
        }
        await refresh();
        return;
      }
      if (last.kind === "clock") {
        const p = last.payload as { id: string; draft: boolean; clock_from: number; clock_to: number };
        await writeClock(p.id, p.draft, p.clock_from, p.clock_to, false);
        await refresh();
        return;
      }
      if (last.kind === "telling" || last.kind === "telling-batch") {
        const rows = last.kind === "telling"
          ? [last.payload as { id: string; draft: boolean; telling_ord: number | null }]
          : last.payload as Array<{ id: string; draft: boolean; telling_ord: number | null }>;
        for (const p of rows) {
          if (p.draft) {
            await api("/api/drafts/patch", { method: "POST", body: JSON.stringify({ id: p.id, telling_ord: p.telling_ord }) });
          } else if (p.telling_ord != null) {
            await api("/api/telling", { method: "POST", body: JSON.stringify({ beat_id: p.id, telling_ord: p.telling_ord }) });
          }
        }
        await refresh();
        return;
      }
      if (last.kind === "delta") {
        const p = last.payload as { id: string; deltas: unknown };
        const draft = !!(state?.drafts || []).some((d) => d.id === p.id);
        if (draft) {
          await api("/api/drafts/patch", { method: "POST", body: JSON.stringify({ id: p.id, deltas: p.deltas }) });
        } else {
          await api(`/api/beats/${encodeURIComponent(p.id)}/revise`, {
            method: "POST",
            body: JSON.stringify({ deltas: p.deltas }),
          });
        }
        await refresh();
      }
    } catch {
      undoStackRef.current = stack;
      setUndoStack(stack);
    }
  }, [refresh, state, writeClock]);
  const undoRef = useRef(undo);
  undoRef.current = undo;

  useEffect(() => {
    const onUndoKey = (e: KeyboardEvent) => {
      if (e.shiftKey || e.repeat) return;
      const z = e.key === "z" || e.key === "Z" || e.code === "KeyZ";
      if (!(e.metaKey || e.ctrlKey) || !z) return;
      if (!undoStackRef.current.length) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      void undoRef.current();
    };
    window.addEventListener("keydown", onUndoKey, true);
    document.addEventListener("keydown", onUndoKey, true);
    return () => {
      window.removeEventListener("keydown", onUndoKey, true);
      document.removeEventListener("keydown", onUndoKey, true);
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === "z" || e.key === "Z" || e.code === "KeyZ") && !e.shiftKey) {
        if (undoStackRef.current.length) {
          e.preventDefault();
          void undoRef.current();
        }
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCmdOpen((v) => !v);
        return;
      }
      if (cmdOpen && e.key !== "Escape") return;
      const modal = document.querySelector(".dialog-back, dialog[open]");
      const typing = ["INPUT", "TEXTAREA", "SELECT"].includes((e.target as HTMLElement)?.tagName);
      if (modal && !typing && e.key !== "Escape") return;
      if (e.altKey && e.key >= "1" && e.key <= "6") {
        e.preventDefault();
        setWindow({ n: Number(e.key) });
        return;
      }
      if (!typing && e.key === "[") setWindow({ start: Math.max(0, (state?.window_start || 0) - 1) });
      if (!typing && e.key === "]") setWindow({ start: (state?.window_start || 0) + 1 });
      if (e.key === "Escape" && !typing) {
        if (cmdOpen) { setCmdOpen(false); return; }
        if (exportOpen) { setExportOpen(false); return; }
        if (pasteOpen) { setPasteOpen(false); return; }
        if (craftOpen) { setCraftOpen(false); return; }
        if (deleteDraftAsk) { setDeleteDraftAsk(null); return; }
        if (delBookOpen) { setDelBookOpen(false); return; }
        if (dossierOpen) { setDossierOpen(false); return; }
        if (state?.pending) { void cancelChange(); return; }
        if (route.kind === "scene" || q.open === "full") setOpen("side");
        else if (q.open === "side") setOpen(null);
        else if (q.look) setLook(null);
        else if (q.line) setLine(null);
      }
      if (!typing && !cmdOpen && (e.key === "ArrowRight" || e.key === "ArrowLeft")) {
        e.preventDefault();
        const list = [...(state?.committed || []).map((b) => ({ id: b.id, draft: false, col: b.column_id, t: b.clock_from, seq: b.commit_seq })),
          ...(state?.drafts || []).map((d) => ({ id: d.id, draft: true, col: d.draft.column_id, t: d.draft.clock_from, seq: 0 }))]
          .sort((a, b) => a.t - b.t || a.seq - b.seq);
        const cur = state?.selected || state?.selected_canon;
        const i = Math.max(0, list.findIndex((x) => x.id === cur));
        const next = e.key === "ArrowRight" ? list[Math.min(list.length - 1, i + 1)] : list[Math.max(0, i - 1)];
        if (next) void selectScene(next.id, next.draft);
      }
      if (e.key === " " && !["INPUT", "TEXTAREA", "SELECT", "BUTTON", "SUMMARY"].includes((e.target as HTMLElement)?.tagName)) {
        e.preventDefault();
        setOpen(q.open === "side" ? "full" : "side");
      }
      if (e.key.toLowerCase() === "l" && !["INPUT", "TEXTAREA", "SELECT"].includes((e.target as HTMLElement)?.tagName)) {
        document.getElementById("thread-strip")?.focus();
      }
      if (e.key.toLowerCase() === "n" && !["INPUT", "TEXTAREA", "SELECT"].includes((e.target as HTMLElement)?.tagName)) {
        document.querySelector<HTMLInputElement>("[data-testid=intent]")?.focus();
      }
      if (e.key.toLowerCase() === "a" && !["INPUT", "TEXTAREA", "SELECT"].includes((e.target as HTMLElement)?.tagName)) {
        setPresencePicker("open");
      }
      if (e.key.toLowerCase() === "t" && !["INPUT", "TEXTAREA", "SELECT"].includes((e.target as HTMLElement)?.tagName)) {
        setLook("时间轴");
      }
      if (e.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes((e.target as HTMLElement)?.tagName)) {
        e.preventDefault();
        setCmdOpen(true);
      }
      if (!typing && e.key === "Delete" && selectedChip) {
        e.preventDefault();
        void removePresence(selectedChip.entityId, selectedChip.sceneId, selectedChip.draft);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, setWindow, state, q.line, q.look, q.open, route.kind, setLine, setLook, setOpen, dossierOpen, cmdOpen, exportOpen, pasteOpen, craftOpen, deleteDraftAsk, delBookOpen, cancelChange, selectScene, selectedChip, removePresence]);

  const scenes = useMemo<SceneCard[]>(() => {
    const committed = (state?.committed || []).map(asScene);
    const drafts = (state?.drafts || []).map(asDraftScene);
    return [...committed, ...drafts];
  }, [state]);

  const selectedScene = useMemo(() => {
    const id = state?.selected || state?.selected_canon;
    return scenes.find((s) => s.id === id) || null;
  }, [scenes, state?.selected, state?.selected_canon]);

  const currentColId = state?.selected_col || selectedScene?.column_id || state?.columns[state.window_start]?.id || "";

  useEffect(() => {
    const id = state?.selected;
    if (!id) return;
    if (!state?.drafts?.some((d) => d.id === id)) return;
    if (craftOpen || exportOpen || cmdOpen) return;
    if (![...dirty.current].some((k) => ["do", "say", "think", "intent", "shift", "title", "cause"].includes(k))) return;
    const t = window.setTimeout(() => {
      const body: Record<string, unknown> = { id };
      if (dirty.current.has("do")) body.do_text = doText;
      if (dirty.current.has("say")) body.say_text = sayText;
      if (dirty.current.has("think")) body.think_text = thinkText;
      if (dirty.current.has("intent")) body.intent = intent;
      if (dirty.current.has("shift")) body.value_shift = valueShift;
      if (dirty.current.has("title")) body.title = sceneTitle;
      if (dirty.current.has("cause")) body.cause_beat = causeBeat || undefined;
      setSaveStatus("保存中");
      api("/api/drafts/patch", { method: "POST", body: JSON.stringify(body) })
        .then(() => setSaveStatus("已存"))
        .catch(() => setSaveStatus("没存上"));
    }, 800);
    return () => window.clearTimeout(t);
  }, [doText, sayText, thinkText, intent, valueShift, sceneTitle, causeBeat, state?.selected, state?.drafts, craftOpen, exportOpen, cmdOpen]);

  const value: Store = {
    route,
    q,
    books,
    state,
    banner,
    sidebar,
    sit,
    sitError,
    selectedChip,
    setSelectedChip,
    drawer,
    setDrawer,
    intent,
    placeId,
    sceneTitle,
    doText,
    sayText,
    thinkText,
    valueShift,
    causeBeat,
    tellingOrd,
    visPrivate,
    visibleTo,
    discussOpen,
    discussDraft,
    talkPending,
    fillPending,
    modelSuggest,
    opError,
    searchHits,
    searchEmpty,
    searchQ,
    undoStack,
    toast,
    look: q.look,
    workspaceTab: readTab(state?.book || "", loadStoredTab(state?.book || ""), q.look),
    splitTab: isWorkspaceTab(q.split) ? q.split : null,
    followDependents,
    tabFilter,
    splitFilter,
    splitLock,
    leftKind,
    line: q.line,
    sceneChrome: (route.kind === "scene" || q.open === "full" ? "full" : q.open === "side" ? "side" : "dock") as "dock" | "side" | "full",
    craftOpen,
    exportOpen,
    pasteOpen,
    pasteText,
    exportOut,
    exportIncludeDrafts,
    dossierOpen,
    dossierLoading,
    dossierName,
    dossierPayload,
    dossierRels,
    delBookOpen,
    delBookName,
    delBookType,
    causedBy,
    reviseMsg,
    craftMsg,
    mentionOpen,
    mentionQ,
    mentionField,
    slashField,
    cmd,
    saveStatus,
    committing,
    fillChunks,
    presencePicker,
    cmdOpen,
    setCmdOpen,
    writeBusy,
    fillLiveBusy,
    notice,
    setNotice,
    queuedPresence,
    appearNext,
    toggleComposePerson,
    plantPromise,
    fillLive,
    deleteDraftAsk,
    askDeleteDraft,
    confirmDeleteDraft,
    cancelDeleteDraft,
    editingCanon,
    setEditingCanon,
    planBones,
    planNotice,
    deleteEntity,
    planSuggest,
    planApply,
    planDetail,
    setIntent: (v) => { dirty.current.add("intent"); setIntent(v); },
    setPlaceId: (v) => { dirty.current.add("place"); setPlaceId(v); },
    setSceneTitle: (v) => { dirty.current.add("title"); setSceneTitle(v); },
    setDoText: (v) => {
      dirty.current.add("do");
      setDoText(v);
      const at = v.match(/@([^\s@]*)$/);
      if (at) { setMentionOpen(true); setMentionQ(at[1]); setMentionField("do_text"); }
      else if (mentionField === "do_text") setMentionOpen(false);
    },
    setSayText: (v) => {
      dirty.current.add("say");
      setSayText(v);
      const at = v.match(/@([^\s@]*)$/);
      if (at) { setMentionOpen(true); setMentionQ(at[1]); setMentionField("say_text"); }
      else if (mentionField === "say_text") setMentionOpen(false);
    },
    setThinkText: (v) => {
      dirty.current.add("think");
      setThinkText(v);
      const at = v.match(/@([^\s@]*)$/);
      if (at) { setMentionOpen(true); setMentionQ(at[1]); setMentionField("think_text"); }
      else if (mentionField === "think_text") setMentionOpen(false);
    },
    setValueShift: (v) => { dirty.current.add("shift"); setValueShift(v); },
    setCauseBeat: (v) => { dirty.current.add("cause"); setCauseBeat(v); },
    setTellingOrd: (v) => { dirty.current.add("telling"); setTellingOrd(v); },
    setVisPrivate,
    setVisibleTo,
    setSearchQ,
    setPasteText,
    setExportIncludeDrafts,
    setDelBookType,
    setLook,
    setSplit,
    setFollowDependents,
    setTabFilter,
    setSplitFilter,
    setSplitLock,
    setLeftKind,
    setLine,
    setWho,
    setOpen,
    goShelf,
    goNew,
    goBoard,
    goLibrary,
    goSettings,
    refreshBooks,
    refresh,
    createBook,
    openBook,
    openBookTo,
    deleteBook,
    writeNext,
    writeParallel,
    addColumn: () => preview("add_column", { column_id: currentColId }),
    removeColumn: () => preview("remove_column", { column_id: currentColId }),
    mergeColumns: () => preview("merge_columns"),
    swapColumns: () => preview("swap_columns"),
    setWindow,
    selectScene,
    selectColumn,
    requestCanonEdit,
    addEntity,
    addPresence,
    removePresence,
    patchScene,
    patchSceneField,
    commit,
    revise,
    createThread,
    attachThread,
    runTalk,
    writeBox,
    fillFake,
    addDelta,
    addKnow,
    addPromiseOp,
    applyFillPart,
    setSlashField,
    setCmd,
    clearMention: () => { setMentionOpen(false); setMentionQ(""); setMentionField(null); },
    preview,
    confirmChange,
    cancelChange,
    invade,
    jumpTooth,
    shiftSceneClock,
    createAtClock,
    createNear,
    resolveAllClocks,
    reorderTelling,
    batchTelling,
    search,
    openDossier,
    saveDossier,
    addRel,
    saveCraft,
    composeBusy,
    composeOut,
    composeMsg,
    composeChapter,
    setTelling,
    toggleReadingOrder,
    loadExport,
    runPaste,
    applyPaste,
    deleteCanon,
    makeEllipsis,
    undo,
    setCraftOpen,
    setExportOpen,
    setPasteOpen,
    setDossierOpen,
    setDelBookOpen: (name) => {
      if (name) {
        setDelBookName(name);
        setDelBookOpen(true);
        setDelBookType("");
      } else setDelBookOpen(false);
    },
    setSidebar,
    scenes,
    selectedScene,
    currentColId,
  };

  useEffect(() => {
    const w = window as Window & { jump?: (i: number) => void };
    w.jump = (i: number) => { void setWindow({ start: i }); };
    return () => { delete w.jump; };
  }, [setWindow]);

  useEffect(() => {
    if (route.kind === "dossier") openDossier(route.entity).catch(() => {});
  }, [route, openDossier]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore");
  return s;
}

export type { Beat, UiDraft, BookCard };
