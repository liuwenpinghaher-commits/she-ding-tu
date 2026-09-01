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
  Entity,
  SceneCard,
  SetupRel,
  UiDraft,
  UiState,
} from "../canon/types";
import { asDraftScene, asScene } from "../canon/types";
import { boardHash, parseHash, writeHash, type BoardQuery, type Route } from "../shell/hash";

type TalkPending = { field: string; text: string } | null;

export interface Store {
  route: Route;
  q: BoardQuery;
  books: BookList;
  state: UiState | null;
  banner: string;
  sidebar: string;
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
  dossierRels: SetupRel[];
  delBookOpen: boolean;
  delBookName: string;
  delBookType: string;
  causedBy: string;
  reviseMsg: string;
  craftMsg: string;
  mentionOpen: boolean;
  mentionQ: string;
  presencePicker: string | null;
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
  goShelf: () => void;
  goNew: () => void;
  goBoard: (book?: string, extra?: Partial<BoardQuery>) => void;
  goLibrary: () => void;
  goSettings: () => void;
  refreshBooks: () => Promise<void>;
  refresh: () => Promise<void>;
  createBook: (name: string, extra?: { premise?: string; clock?: string }) => Promise<void>;
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
  patchScene: (body: Record<string, unknown>) => Promise<void>;
  commit: () => Promise<void>;
  revise: () => Promise<void>;
  createThread: (name: string, type?: string) => Promise<void>;
  attachThread: (nameOrId: string, role?: string) => Promise<void>;
  runTalk: (field: string, text: string) => Promise<void>;
  writeBox: () => Promise<void>;
  fillFake: () => Promise<void>;
  addDelta: (entity_id: string, attr: string, value: string, clock_from?: number) => Promise<void>;
  addKnow: (who: string, fact: string, cert?: string, truth?: string) => Promise<void>;
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
  const [dossierRels, setDossierRels] = useState<SetupRel[]>([]);
  const [delBookOpen, setDelBookOpen] = useState(false);
  const [delBookName, setDelBookName] = useState("");
  const [delBookType, setDelBookType] = useState("");
  const [causedBy, setCausedBy] = useState("");
  const [reviseMsg, setReviseMsg] = useState("");
  const [craftMsg, setCraftMsg] = useState("");
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQ, setMentionQ] = useState("");
  const [presencePicker, setPresencePicker] = useState<string | null>(null);
  const refreshGen = useRef(0);
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
    const list = await api<BookList>("/api/books");
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
          last_value_shift?: string | null;
          knowledge_gaps?: string[];
          stakes?: string[];
          open_promises?: { name: string }[];
          wrong_beliefs?: string[];
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
    } catch {
      /* 未选草稿时接口可空 */
    }
  }, []);

  const refresh = useCallback(async () => {
    const mine = ++refreshGen.current;
    try {
      const st = await api<UiState>("/api/state");
      if (mine !== refreshGen.current) return;
      applyState(st);
      setBanner("");
      if (st.selected) {
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
        .then(() => refresh())
        .catch((e) => setBanner(String(e.message || e)));
    }
  }, [route, refresh, state?.book]);

  const goShelf = useCallback(() => {
    writeHash("#/");
  }, []);
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

  const createBook = useCallback(async (name: string, extra?: { premise?: string; clock?: string }) => {
    const body: Record<string, unknown> = { name };
    if (extra?.premise) body.premise = extra.premise;
    if (extra?.clock) body.clock_origin_label = extra.clock;
    await api("/api/books", { method: "POST", body: JSON.stringify(body) });
    await refreshBooks();
    writeHash(boardHash(name, { n: 1, start: 0 }));
    await refresh();
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
    if (!intent.trim()) return;
    await api("/api/write-next", {
      method: "POST",
      body: JSON.stringify({ intent, place_id: placeId || undefined }),
    });
    await refresh();
  }, [intent, placeId, refresh]);

  const writeParallel = useCallback(async () => {
    const col = state?.selected_col || state?.columns[state.window_start]?.id;
    const c = (state?.columns || []).find((x) => x.id === col);
    await api("/api/write-parallel", {
      method: "POST",
      body: JSON.stringify({
        intent,
        column_id: col,
        place_id: placeId || undefined,
        clock_from: c?.clock_from,
        clock_to: c?.clock_to,
      }),
    });
    await refresh();
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
    await refresh();
  }, [refresh, state?.selected]);

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
    const body: Record<string, unknown> = {
      id,
      intent,
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
    try {
      await api("/api/drafts/patch", { method: "POST", body: JSON.stringify(body) });
      await api("/api/commit", { method: "POST", body: JSON.stringify({ id }) });
      setToast("已写入正史");
      await refresh();
    } catch (e) {
      setSidebar(e instanceof Error ? e.message : "写入正史失败");
    }
  }, [state?.selected, intent, doText, sayText, thinkText, valueShift, placeId, sceneTitle, causeBeat, visPrivate, visibleTo, refresh]);

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
    const id = state?.selected;
    if (id) {
      const d = state?.drafts.find((x) => x.id === id);
      const cur = [...(d?.draft.story_threads || [])];
      if (!cur.some((x) => x.id === t.id)) cur.push({ id: t.id, role });
      await api("/api/drafts/patch", { method: "POST", body: JSON.stringify({ id, story_threads: cur }) });
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
    else setDoText(text);
    const patch: Record<string, unknown> = { id };
    if (field === "intent") patch.intent = text;
    else if (field === "value_shift") patch.value_shift = text;
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
    if (!id) return;
    const r = await api<{ do_text?: string; say_text?: string; think_text?: string }>("/api/fill-fake", {
      method: "POST",
      body: JSON.stringify({ id }),
    });
    const lines = [
      r.do_text ? `动作：${r.do_text}` : "动作：",
      r.say_text ? `对白：${r.say_text}` : "",
      r.think_text ? `内心：${r.think_text}` : "",
    ].filter(Boolean);
    setDiscussDraft(lines.join("\n") || "动作：");
    setDiscussOpen(true);
    setFillPending(true);
  }, [state?.selected]);

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

  const addKnow = useCallback(async (who: string, fact: string, cert = "knows", truth?: string) => {
    const id = state?.selected || state?.selected_canon;
    if (!id) return;
    const row = { person_id: who, fact, certainty: cert, truth_value: truth || null };
    const scene = state?.drafts.find((d) => d.id === id);
    const canon = state?.committed.find((b) => b.id === id);
    if (scene) {
      await api("/api/drafts/patch", {
        method: "POST",
        body: JSON.stringify({ id, knowledge_writes: [...(scene.draft.knowledge_writes || []), row] }),
      });
    } else if (canon) {
      await api(`/api/beats/${encodeURIComponent(id)}/revise`, {
        method: "POST",
        body: JSON.stringify({ knowledge_writes: [...(canon.knowledge_writes || []), row] }),
      });
    }
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
      const d = await api<{
        relations?: SetupRel[];
        rels?: SetupRel[];
        relations_setup?: Array<{ id?: string; kind: string; other_name?: string; other?: string; direction?: string }>;
      }>(`/api/dossier/${encodeURIComponent(name)}`);
      const setup = (d.relations_setup || []).map((r) => ({
        id: r.id || `${r.kind}-${r.other}`,
        kind: r.kind,
        from: r.direction === "in" ? (r.other_name || r.other || "") : name,
        to: r.direction === "in" ? name : (r.other_name || r.other || ""),
        note: "",
      }));
      setDossierRels(setup.length ? setup : (d.relations || d.rels || []));
    } catch {
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
      if (e.altKey && e.key >= "1" && e.key <= "6") {
        e.preventDefault();
        setWindow({ n: Number(e.key) });
        return;
      }
      if (e.key === "[" ) setWindow({ start: Math.max(0, (state?.window_start || 0) - 1) });
      if (e.key === "]" ) setWindow({ start: (state?.window_start || 0) + 1 });
      if (e.key === "Escape" && !["INPUT", "TEXTAREA", "SELECT"].includes((e.target as HTMLElement)?.tagName)) {
        if (q.line) setLine(null);
        else if (q.look) setLook(null);
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
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, setWindow, state?.window_start, q.line, q.look, setLine, setLook]);

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

  const value: Store = {
    route,
    q,
    books,
    state,
    banner,
    sidebar,
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
    craftOpen,
    exportOpen,
    pasteOpen,
    pasteText,
    exportOut,
    exportIncludeDrafts,
    dossierOpen,
    dossierName,
    dossierRels,
    delBookOpen,
    delBookName,
    delBookType,
    causedBy,
    reviseMsg,
    craftMsg,
    mentionOpen,
    mentionQ,
    presencePicker,
    setIntent: (v) => { dirty.current.add("intent"); setIntent(v); },
    setPlaceId: (v) => { dirty.current.add("place"); setPlaceId(v); },
    setSceneTitle: (v) => { dirty.current.add("title"); setSceneTitle(v); },
    setDoText: (v) => {
      dirty.current.add("do");
      setDoText(v);
      const at = v.match(/@([^\s@]*)$/);
      if (at) {
        setMentionOpen(true);
        setMentionQ(at[1]);
      } else setMentionOpen(false);
    },
    setSayText: (v) => { dirty.current.add("say"); setSayText(v); },
    setThinkText: (v) => { dirty.current.add("think"); setThinkText(v); },
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
    goShelf,
    goNew,
    goBoard,
    goLibrary,
    goSettings,
    refreshBooks,
    refresh,
    createBook,
    openBook,
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

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore");
  return s;
}

export type { Beat, UiDraft, BookCard };
