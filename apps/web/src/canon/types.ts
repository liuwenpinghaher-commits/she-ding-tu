export type EntityKind = "person" | "place" | "thing" | "faction" | "rule" | "promise";

export interface Entity {
  id: string;
  kind: string;
  name: string;
  profile?: Record<string, string>;
}

export interface Column {
  id: string;
  clock_from: number;
  clock_to: number;
  display_ord: number;
}

export interface Presence {
  entity_id: string;
  beat_id: string;
  role: string;
}

export interface Delta {
  entity_id: string;
  attr: string;
  value: string;
  clock_from: number;
  clock_to?: number | null;
}

export interface KnowledgeWrite {
  person_id: string;
  fact: string;
  certainty?: string;
  truth_value?: string | null;
  method?: string | null;
  source_person?: string | null;
}

export interface PromiseOp {
  promise_id: string;
  op: string;
}

export interface PromiseItem {
  id: string;
  name: string;
  status: string;
  related?: string[];
  plant_clock?: number | null;
  deadline_clock?: number | null;
  red_herring?: boolean;
}

export interface PersonTrack {
  person_id: string;
  do_text?: string | null;
  say_text?: string | null;
  think_text?: string | null;
}

export interface BeatThread {
  id: string;
  role?: string;
}

export interface StoryThread {
  id: string;
  name: string;
  color?: number;
  type: string;
  description?: string;
}

export interface BeatDraft {
  id?: string | null;
  kind: string;
  column_id: string;
  intent: string;
  value_shift?: string | null;
  do_text?: string | null;
  say_text?: string | null;
  think_text?: string | null;
  clock_from: number;
  clock_to: number;
  place_id?: string | null;
  telling_ord?: number | null;
  cause_beat?: string | null;
  visible_to?: string[] | null;
  deltas?: Delta[];
  knowledge_writes?: KnowledgeWrite[];
  promise_ops?: PromiseOp[];
  presences?: Presence[];
  tracks?: PersonTrack[];
  story_threads?: BeatThread[];
}

export interface Beat {
  id: string;
  kind: string;
  column_id: string;
  status: string;
  commit_seq: number;
  intent: string;
  value_shift?: string | null;
  do_text?: string | null;
  say_text?: string | null;
  think_text?: string | null;
  clock_from: number;
  clock_to: number;
  place_id?: string | null;
  telling_ord?: number | null;
  cause_beat?: string | null;
  visible_to?: string[] | null;
  deltas?: Delta[];
  knowledge_writes?: KnowledgeWrite[];
  promise_ops?: PromiseOp[];
  presences?: Presence[];
  tracks?: PersonTrack[];
  story_threads?: BeatThread[];
}

export interface UiDraft {
  id: string;
  title: string;
  draft: BeatDraft;
  stale_world?: boolean;
  filled?: boolean;
}

export interface Suggestion {
  id: string;
  label: string;
}

export interface Pending {
  op: string;
  suggestions: Suggestion[];
  original_columns?: Column[];
  proposed_columns?: Column[] | null;
  target_beat?: string | null;
  target_entity?: string | null;
  target_column?: string | null;
  proposed_clock_to?: number | null;
  impacts?: string[];
}

export interface BookCraft {
  premise?: string;
  chapters?: { title: string; start_column: string }[];
  clock_origin_label?: string;
  clock_origin_minute?: number;
  minutes_per_tick?: number;
  clock_format?: string;
  export_include_draft?: boolean;
  export_order?: string;
  export_extras?: string;
}

export interface BookCard {
  name: string;
  premise: string;
  columns: number;
  committed: number;
  drafts: number;
  opened_at: number;
}

export interface BookList {
  books: string[];
  items?: BookCard[];
  current?: string | null;
}

export interface ColCoverage {
  column_id: string;
  place: boolean;
  person: boolean;
  thing: boolean;
  faction: boolean;
  promise: boolean;
}

export interface BeatWarning {
  beat_id: string;
  code: string;
  message: string;
}

export interface World {
  t: number;
  as_of?: number | null;
  nodes?: Entity[];
  states?: unknown[];
  where?: Record<string, string>;
  covering?: string[];
  knows?: Record<string, string[]>;
  beliefs?: unknown[];
  promises?: PromiseItem[];
  edges?: Presence[];
  playing?: string[];
}

export interface UiState {
  book?: string | null;
  n: number;
  window_start: number;
  reading_order: boolean;
  columns: Column[];
  entities: Entity[];
  committed: Beat[];
  drafts: UiDraft[];
  world?: World | null;
  pending?: Pending | null;
  selected?: string | null;
  selected_canon?: string | null;
  selected_col?: string | null;
  coverage?: ColCoverage[];
  warnings?: BeatWarning[];
  paste_suggestions?: PasteSuggest[];
  fill_pending?: BeatDraft | null;
  lens_person?: string | null;
  people?: Entity[];
  craft?: BookCraft;
  talk_log?: unknown[];
  all_entities?: Entity[];
  promises?: PromiseItem[];
  threads?: StoryThread[];
}

export interface PasteSuggest {
  id: string;
  field: string;
  text: string;
  applied?: boolean;
  skipped?: boolean;
  target_draft?: string | null;
  target_label?: string;
}

export interface SetupRel {
  id: string;
  kind: string;
  from: string;
  to: string;
  note?: string;
}

export type SceneCard = {
  id: string;
  draft: boolean;
  column_id: string;
  intent: string;
  title?: string;
  kind: string;
  status: string;
  commit_seq?: number;
  do_text?: string | null;
  say_text?: string | null;
  think_text?: string | null;
  value_shift?: string | null;
  place_id?: string | null;
  clock_from: number;
  clock_to: number;
  telling_ord?: number | null;
  cause_beat?: string | null;
  presences: Presence[];
  story_threads: BeatThread[];
  tracks?: PersonTrack[];
  deltas?: Delta[];
  knowledge_writes?: KnowledgeWrite[];
  visible_to?: string[] | null;
};

export function asScene(b: Beat): SceneCard {
  return {
    id: b.id,
    draft: false,
    column_id: b.column_id,
    intent: b.intent,
    title: "",
    kind: b.kind,
    status: b.status,
    commit_seq: b.commit_seq,
    do_text: b.do_text,
    say_text: b.say_text,
    think_text: b.think_text,
    value_shift: b.value_shift,
    place_id: b.place_id,
    clock_from: b.clock_from,
    clock_to: b.clock_to,
    telling_ord: b.telling_ord,
    cause_beat: b.cause_beat,
    presences: b.presences || [],
    story_threads: b.story_threads || [],
    tracks: b.tracks,
    deltas: b.deltas,
    knowledge_writes: b.knowledge_writes,
    visible_to: b.visible_to,
  };
}

export function asDraftScene(d: UiDraft): SceneCard {
  const b = d.draft;
  return {
    id: d.id,
    draft: true,
    column_id: b.column_id,
    intent: b.intent,
    title: d.title,
    kind: b.kind || "scene",
    status: "draft",
    do_text: b.do_text,
    say_text: b.say_text,
    think_text: b.think_text,
    value_shift: b.value_shift,
    place_id: b.place_id,
    clock_from: b.clock_from,
    clock_to: b.clock_to,
    telling_ord: b.telling_ord,
    cause_beat: b.cause_beat,
    presences: b.presences || [],
    story_threads: b.story_threads || [],
    tracks: b.tracks,
    deltas: b.deltas,
    knowledge_writes: b.knowledge_writes,
    visible_to: b.visible_to,
  };
}
