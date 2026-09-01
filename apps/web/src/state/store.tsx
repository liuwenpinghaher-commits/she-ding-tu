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
import { api, apiText } from "../api/client";
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

type TalkPending = { field: string; text: string } | null;

export type SitPacket = {
  intent: string;
  last_value_shift: string;
  stakes: string[];
  knowledge_gaps: string[];
  wrong_beliefs: string[];
  reader_knows: string[];
  reader_irony: string[];
  open_promises: { name: string }[];
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
};

export interface Store {
  route: Route;
  q: BoardQuery;
  books: BookList;
  state: UiState | null;
  banner: string;
  sidebar: string;
  sit: SitPacket;
  selectedChip: { entityId: string; sceneId: string; draft: boolean } | null;
  setSelectedChip: (c: { entityId: string; sceneId: string; draft: boolean } | null) => void;
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
  searchHits: Entity[];
  searchEmpty: boolean;
  searchQ: string;
  undoStack: Array<{ kind: string; payload: unknown }>;
  toast: string;
  look: string | null;
  line: string | null;
  craftOpen: boolean;
  exportOpen: boolean;
  pasteOpen: boolean;
  pasteText: string;
  exportOut: string;
  exportIncludeDrafts: boolean;
  dossierOpen: boolean;
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
  editingCanon: boolean;
  setEditingCanon: (v: boolean) => void;
  planBones: Array<{ serial?: boolean; intent: string; presence?: string[]; necessity?: string }>;
  planNotice: string;
  deleteEntity: (id: string) => Promise<void>;
  planSuggest: () => Promise<void>;
  planApply: (mode: "tail" | "mid") => Promise<void>;
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
  addEntity: (kind: string, name: string, profile?: Record<string, string>) => Promise<void>;
  addPresence: (entityId: string, sceneId?: string) => Promise<void>;
  removePresence: (entityId: string, sceneId?: string, draft?: boolean) => Promise<void>;
  patchScene: (body: Record<string, unknown>) => Promise<void>;
  commit: () => Promise<void>;
  revise: () => Promise<void>;
  createThread: (name: string, type?: string) => Promise<void>;
  attachThread: (nameOrId: string, role?: string) => Promise<void>;
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
  search: () => Promise<void>;
  openDossier: (name: string) => Promise<void>;
  saveDossier: (fields: Record<string, string>) => Promise<void>;
  addRel: (kind: string, target: string) => Promise<void>;
  saveCraft: (craft: BookCraft) => Promise<void>;
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
  const [searchHits, setSearchHits] = useState<Entity[]>([]);
  const [searchEmpty, setSearchEmpty] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const [undoStack, setUndoStack] = useState<Array<{ kind: string; payload: unknown }>>([]);
  const [toast, setToast] = useState("");
  const [craftOpen, setCraftOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [exportOut, setExportOut] = useState("");
  const [exportIncludeDrafts, setExportIncludeDrafts] = useState(true);
  const [dossierOpen, setDossierOpen] = useState(false);
  const [dossierName, setDossierName] = useState("");
  const [dossierPayload, setDossierPayload] = useState<DossierPayload | null>(null);
  const [dossierRels, setDossierRels] = useState<SetupRel[]>([]);
  const [delBookOpen, setDelBookOpen] = useState(false);
  const [delBookName, setDelBookName] = useState("");
  const [delBookType, setDelBookType] = useState("");
  const [causedBy, setCausedBy] = useState("");
  const [reviseMsg, setReviseMsg] = useState("");
  const [craftMsg, setCraftMsg] = useState("");
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
  const [editingCanon, setEditingCanon] = useState(false);
  const [planBones, setPlanBones] = useState<Array<{ serial?: boolean; intent: string; presence?: string[]; necessity?: string }>>([]);
  const [planNotice, setPlanNotice] = useState("");
  const [sit, setSit] = useState<SitPacket>(EMPTY_SIT);
  const [selectedChip, setSelectedChip] = useState<{ entityId: string; sceneId: string; draft: boolean } | null>(null);
  const refreshGen = useRef(0);
  const booksGen = useRef(0);
  const editorSel = useRef<string | null>(null);
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
    }
  }, []);

  const loadSit = useCallback(async (st?: UiState | null) => {
    try {
      const r = await api<{
        packet?: {
          intent?: string;
          last_value_shift?: string | null;
          knowledge_gaps?: string[];
          stakes?: string[];
          open_promises?: { name: string }[];
          wrong_beliefs?: string[];
          reader_knows?: string[];
          reader_irony?: string[];
        };
      }>("/api/circumstances");
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
      setSit({
        intent: pkt?.intent || "",
        last_value_shift: lastShift || "",
        stakes: pkt?.stakes || [],
        knowledge_gaps: pkt?.knowledge_gaps || [],
        wrong_beliefs: pkt?.wrong_beliefs || [],
        reader_knows: pkt?.reader_knows || [],
        reader_irony: pkt?.reader_irony || [],
        open_promises: (pkt?.open_promises || []).slice(0, 5),
      });
    } catch {
      /* 未选草稿时接口可空 */
    }
  }, []);

  const refresh = useCallback(async (opts?: { skipSit?: boolean }) => {
    const mine = ++refreshGen.current;
    try {
      const st = await api<UiState>("/api/state");
      if (mine !== refreshGen.current) return;
      applyState(st);
      setBanner("");
      if (st.selected && !opts?.skipSit) {
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
    writeHash(boardHash(name, { ...q, look, n: state.n, start: state.window_start, s: q.s || state.selected || state.selected_canon }));
  }, [state, q]);

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
    await refreshBooks();
    writeHash(boardHash(name, { n: 1, start: 0 }));
    await refresh();
  }, [refresh, refreshBooks]);

  const openBookTo = useCallback(async (name: string, dest: "board" | "settings" | "library" | "export") => {
    await api(`/api/books/${encodeURIComponent(name)}/open`, { method: "POST", body: "{}" });
    if (dest === "settings") writeHash(`#/b/${encodeURIComponent(name)}/settings`);
    else if (dest === "library") writeHash(`#/b/${encodeURIComponent(name)}/library`);
    else if (dest === "export") {
      writeHash(boardHash(name));
      setExportOpen(true);
    } else writeHash(boardHash(name));
    await refresh();
    await refreshBooks();
    if (dest === "export") {
      const md = await apiText("/api/export");
      setExportOut(md);
    }
  }, [refresh, refreshBooks]);

  const openBook = useCallback(async (name: string) => {
    await api(`/api/books/${encodeURIComponent(name)}/open`, { method: "POST", body: "{}" });
    writeHash(boardHash(name));
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
    const r = await api<{ id?: string }>("/api/write-next", {
      method: "POST",
      body: JSON.stringify({ intent: typed, place_id: placeId || undefined }),
    });
    await refresh();
    if (r.id) {
      await api("/api/select", { method: "POST", body: JSON.stringify({ draft_id: r.id }) });
      await refresh();
    }
  }, [intent, placeId, refresh]);

  const writeParallel = useCallback(async () => {
    const selectedId = state?.selected || state?.selected_canon;
    const fromScene = [...(state?.drafts || []).map((d) => ({ id: d.id, column_id: d.draft.column_id })), ...(state?.committed || []).map((b) => ({ id: b.id, column_id: b.column_id }))].find((x) => x.id === selectedId);
    const col = fromScene?.column_id || state?.selected_col || state?.columns[state.window_start]?.id;
    const c = (state?.columns || []).find((x) => x.id === col);
    const typed = (document.querySelector<HTMLInputElement>("[data-testid=intent]")?.value ?? intent).trim();
    const r = await api<{ id?: string }>("/api/write-parallel", {
      method: "POST",
      body: JSON.stringify({
        intent: typed || intent,
        column_id: col,
        place_id: placeId || undefined,
        clock_from: c?.clock_from,
        clock_to: c?.clock_to,
      }),
    });
    await refresh();
    if (r.id) {
      await api("/api/select", { method: "POST", body: JSON.stringify({ draft_id: r.id }) });
      await refresh();
    }
  }, [intent, placeId, refresh, state]);

  const setWindow = useCallback(async (patch: { n?: number; start?: number; density?: string }) => {
    await api("/api/window", { method: "POST", body: JSON.stringify(patch) });
    await refresh();
  }, [refresh]);

  const selectScene = useCallback(async (id: string, draft: boolean) => {
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
  }, [refresh]);

  const addEntity = useCallback(async (kind: string, name: string, profile?: Record<string, string>) => {
    await api("/api/entities", {
      method: "POST",
      body: JSON.stringify({ id: name, kind, name, profile }),
    });
    await refresh();
  }, [refresh]);

  const addPresence = useCallback(async (entityId: string, sceneId?: string) => {
    const id = sceneId || state?.selected;
    if (!id) return;
    await api("/api/presence", {
      method: "POST",
      body: JSON.stringify({ draft_id: id, entity_id: entityId, action: "add" }),
    });
    void refresh({ skipSit: true });
  }, [refresh, state?.selected]);

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
    try {
      await api("/api/drafts/patch", { method: "POST", body: JSON.stringify(body) });
      await api("/api/commit", { method: "POST", body: JSON.stringify({ id }) });
      setToast("已写入正史。不能撤销。接着写下一场。");
      dirty.current.clear();
      await refresh();
    } catch (e) {
      setSidebar(e instanceof Error ? e.message : "写入正史失败");
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
        bones?: Array<{ serial?: boolean; intent: string; presence?: string[]; necessity?: string }>;
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

  const planApply = useCallback(async (mode: "tail" | "mid") => {
    const id = state?.selected || state?.selected_canon;
    if (!id || !planBones.length) return;
    try {
      await api("/api/plan-apply", {
        method: "POST",
        body: JSON.stringify({
          goal_id: id,
          mode,
          bones: planBones,
          structure_confirmed: mode === "mid" ? false : undefined,
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

  const attachThread = useCallback(async (nameOrId: string, role = "推进") => {
    const t = (state?.threads || []).find((x) => x.id === nameOrId || x.name === nameOrId);
    if (!t) return;
    const apply = (cur: { id: string; role?: string }[]) => {
      const next = [...cur];
      const i = next.findIndex((x) => x.id === t.id);
      if (i >= 0) next[i] = { ...next[i], id: t.id, role };
      else next.push({ id: t.id, role });
      return next;
    };
    const id = state?.selected;
    if (id) {
      const d = state?.drafts.find((x) => x.id === id);
      const cur = apply(d?.draft.story_threads || []);
      await api("/api/drafts/patch", { method: "POST", body: JSON.stringify({ id, story_threads: cur }) });
    } else if (state?.selected_canon) {
      const b = state.committed.find((x) => x.id === state.selected_canon);
      const cur = apply(b?.story_threads || []);
      await api(`/api/beats/${encodeURIComponent(state.selected_canon)}/revise`, {
        method: "POST",
        body: JSON.stringify({ story_threads: cur }),
      });
    }
    await refresh();
  }, [state, refresh]);

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
    setToast("已写入此框，仍是草稿");
    await refresh();
  }, [state?.selected, fillPending, talkPending, intent, refresh]);

  const fillFake = useCallback(async () => {
    const id = state?.selected;
    if (!id || !intent.trim()) return;
    const r = await api<{ do_text?: string; say_text?: string; think_text?: string }>("/api/fill-fake", {
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
  }, [state?.selected, intent]);

  const applyFillPart = useCallback(async (field: "do_text" | "say_text" | "think_text") => {
    const id = state?.selected;
    const chunk = fillChunks?.[field];
    if (!id || !chunk) return;
    if (field === "do_text") setDoText(chunk);
    if (field === "say_text") setSayText(chunk);
    if (field === "think_text") setThinkText(chunk);
    await api("/api/drafts/patch", { method: "POST", body: JSON.stringify({ id, [field]: chunk }) });
    setToast("已写入此框，仍是草稿");
  }, [state?.selected, fillChunks]);

  const addDelta = useCallback(async (entity_id: string, attr: string, value: string, clock_from = 0) => {
    const id = state?.selected || state?.selected_canon;
    if (!id) return;
    const scene = state?.drafts.find((d) => d.id === id) || null;
    const canon = state?.committed.find((b) => b.id === id);
    const prev = [...((scene?.draft.deltas || canon?.deltas || []) as { entity_id: string }[])];
    const row = { entity_id, attr, value, clock_from, clock_to: null };
    setUndoStack((s) => [...s, { kind: "delta", payload: { id, deltas: prev } }]);
    if (scene) {
      await api("/api/drafts/patch", {
        method: "POST",
        body: JSON.stringify({ id, deltas: [...(scene.draft.deltas || []), row] }),
      });
    } else if (canon) {
      await api(`/api/beats/${encodeURIComponent(id)}/revise`, {
        method: "POST",
        body: JSON.stringify({ deltas: [...(canon.deltas || []), row] }),
      });
    }
    await refresh();
  }, [state, refresh]);

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
      await api(`/api/beats/${encodeURIComponent(id)}/revise`, {
        method: "POST",
        body: JSON.stringify({ knowledge_writes: [...(canonRow.knowledge_writes || []), row] }),
      });
    }
    await refresh();
  }, [state, refresh]);

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
    await api("/api/structure/preview", { method: "POST", body: JSON.stringify({ op, ...extra }) });
    await refresh();
  }, [refresh]);

  const confirmChange = useCallback(async (choice: string) => {
    await api("/api/structure/confirm", { method: "POST", body: JSON.stringify({ choice }) });
    await refresh();
  }, [refresh]);

  const cancelChange = useCallback(async () => {
    await api("/api/structure/cancel", { method: "POST", body: "{}" });
    await refresh();
  }, [refresh]);

  const invade = useCallback(async (columnId: string, clockTo: number) => {
    await preview("invade", { column_id: columnId, clock_to: clockTo });
  }, [preview]);

  const jumpTooth = useCallback(async (i: number) => {
    await setWindow({ start: i });
  }, [setWindow]);

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
    } catch {
      setDossierPayload(null);
      setDossierRels([]);
    }
  }, []);

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
    await api("/api/paste", { method: "POST", body: JSON.stringify({ text: pasteText }) });
    await refresh();
  }, [pasteText, refresh]);

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
    const last = undoStack[undoStack.length - 1];
    if (!last) return;
    setUndoStack((s) => s.slice(0, -1));
    if (last.kind === "delta") {
      const p = last.payload as { id: string; deltas: unknown };
      await api("/api/drafts/patch", { method: "POST", body: JSON.stringify({ id: p.id, deltas: p.deltas }) });
      await refresh();
    }
  }, [undoStack, refresh]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        undo();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCmdOpen((v) => !v);
        return;
      }
      if (cmdOpen) return;
      if (document.querySelector(".dialog-back, dialog[open]")) return;
      const typing = ["INPUT", "TEXTAREA", "SELECT"].includes((e.target as HTMLElement)?.tagName);
      if (e.altKey && e.key >= "1" && e.key <= "6") {
        e.preventDefault();
        setWindow({ n: Number(e.key) });
        return;
      }
      if (!typing && e.key === "[") setWindow({ start: Math.max(0, (state?.window_start || 0) - 1) });
      if (!typing && e.key === "]") setWindow({ start: (state?.window_start || 0) + 1 });
      if (e.key === "Escape" && !typing) {
        if (cmdOpen) { setCmdOpen(false); return; }
        if (route.kind === "scene" || q.open === "full") setOpen("side");
        else if (q.open === "side") setOpen(null);
        else if (q.look) setLook(null);
        else if (q.line) setLine(null);
        else if (dossierOpen) setDossierOpen(false);
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
        setLook(q.look === "时间轴" ? null : "时间轴");
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
  }, [undo, setWindow, state, q.line, q.look, q.open, route.kind, setLine, setLook, setOpen, dossierOpen, cmdOpen, selectScene, selectedChip, removePresence]);

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
    selectedChip,
    setSelectedChip,
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
    searchHits,
    searchEmpty,
    searchQ,
    undoStack,
    toast,
    look: q.look,
    line: q.line,
    sceneChrome: (route.kind === "scene" || q.open === "full" ? "full" : q.open === "side" ? "side" : "dock") as "dock" | "side" | "full",
    craftOpen,
    exportOpen,
    pasteOpen,
    pasteText,
    exportOut,
    exportIncludeDrafts,
    dossierOpen,
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
    editingCanon,
    setEditingCanon,
    planBones,
    planNotice,
    deleteEntity,
    planSuggest,
    planApply,
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
    addEntity,
    addPresence,
    removePresence,
    patchScene,
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
    search,
    openDossier,
    saveDossier,
    addRel,
    saveCraft,
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
