/**
 * TimelineView · 作者工具 F-02 · 时间线泳道(vis-timeline 重写,波A)
 *
 * 根治三痛点(替代原手搓 SVG 网格):
 *   1. 信息叠加 —— 同章多事件交给 vis-timeline groups 内的自动堆叠(stack),不再 left+=idx*5。
 *   2. 节点不可点看详情 —— select 事件 → 右侧详情面板展示该 item 完整字段;双击/按钮再跳章。
 *   3. 千万字横向无虚拟化 —— vis-timeline 原生窗口化(只渲染可视区间)+ 滚轮缩放 + 拖动。
 *
 * 章号轴:scribe3 以「章号」(整数)为时间轴。vis-timeline 偏好 Date,故把
 *   第 N 章 映射为合成时间 chapterToDate(N) = 2000-01-01 + (N-1) 天;
 *   反向 dateToChapter 用于 select/缩放窗口。轴标签经 format.minorLabels 显示「第N章」。
 *
 * 泳道(groups,可切换):
 *   - kind(默认):事件 / 伏笔 / 弧光 / 关系 四类各一道。
 *   - char:按焦点角色(参与/见证)分道 + 固定「伏笔」道。
 *   - type:按事件类型分道(仅事件)。
 * item:
 *   - 事件 / 弧光 / 伏笔收点 / 关系失效 → 点类型(type:'point' / 'box')。
 *   - 伏笔(setup→payoff)、关系(since→until)→ 区间(type:'range',带 start+end)。
 *     未收 / 未失效 → end = 全书末章(开口区间)。
 *
 * 数据源:api.timeline(from,to,axis) → /timeline(store.timeline)。
 * 对外接口不变:<TimelineView onJumpChapter={fn} />(DetailPane 在用)。
 * spec: docs/系统文档/作者工具/02-时间线视图.md
 */
import { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import { Timeline } from 'vis-timeline/esnext'
import { DataSet } from 'vis-data/esnext'
import 'vis-timeline/styles/vis-timeline-graph2d.css'
import { Clock, RefreshCw, AlertTriangle } from 'lucide-react'
import { api } from '../api'
import { relColor, relLabel } from '../lib/relColors'
import { hasNarrativeData } from '../lib/timelineAxis'
import { causalArcsFromItems, jumpWindowForChapter, relatedVisIds, withHighlightClass } from '../lib/timelineCraft'
import { bootWindowForChapter, catOfKind, timelineEmptyCopy, timelineEmptyKind } from '../lib/timelineReadable.js'
import { prefersReducedMotion } from '../lib/utils'
import { useSelection } from '../selectionContext'
import { liveTouchesTable } from '../lib/liveRefresh.js'
import { TimelineEventList } from './timeline/TimelineEventList.jsx'
import { TimelineDetailPanel } from './timeline/TimelineDetailPanel.jsx'
import {
  palette, evColor, arcColor, PROMISE_COLOR, PROMISE_HERRING, stripRole, esc,
} from './timeline/timelineTokens.js'

// ── 章号 ⇄ 合成时间 ─────────────────────────────────────────────────────────
// 第 N 章 → 2000-01-01 起第 (N-1) 天。一天一章,vis 缩放/堆叠按天粒度天然贴合。
const EPOCH = Date.UTC(2000, 0, 1)
const DAY = 86400000
const chToDate = (ch) => new Date(EPOCH + (ch - 1) * DAY)
const dateToCh = (d) => Math.round((new Date(d).getTime() - EPOCH) / DAY) + 1

/** 单次请求章窗口宽度（动态加载，非整书一次塞进 vis） */
const CH_WINDOW = 50
/** 声明 max_chapter 超过此值且 items 明显偏前时，视为烟雾/脏章污染 */
const MAX_CH_SANE = 5000

function itemsChapterMax(items) {
  let m = 0
  for (const it of items || []) {
    const c = Number(it?.chapter) || 0
    const s = Number(it?.story_chapter) || 0
    if (c > m) m = c
    if (s > m) m = s
  }
  return m
}

/**
 * 有效末章：避免 max_chapter 被测试章号（如 999902）污染后窗口落到空区间。
 * 优先信任已加载 items 的最高章；声明值合理时再取较大者。
 */
function effectiveMaxChapter(data) {
  if (!data) return 0
  const declared = Number(data.max_chapter) || 0
  const itemMax = itemsChapterMax(data.items)
  if (declared > MAX_CH_SANE && itemMax > 0 && itemMax < declared - 100) return itemMax
  if (declared > MAX_CH_SANE && itemMax === 0) return 0
  return Math.max(declared, itemMax)
}

function mergeTimelinePayload(prev, next) {
  if (!prev) return next
  if (!next) return prev
  const byKey = new Map()
  for (const it of prev.items || []) {
    byKey.set(`${it.kind}:${it.id}`, it)
  }
  for (const it of next.items || []) {
    byKey.set(`${it.kind}:${it.id}`, it)
  }
  const items = [...byKey.values()].sort((a, b) => (a.chapter || 0) - (b.chapter || 0))
  return {
    ...prev,
    ...next,
    from: Math.min(prev.from ?? next.from ?? 1, next.from ?? prev.from ?? 1),
    to: Math.max(prev.to ?? 0, next.to ?? 0),
    max_chapter: Math.max(prev.max_chapter || 0, next.max_chapter || 0),
    truncated: Boolean(prev.truncated || next.truncated),
    items,
  }
}

// 固定 group id(kind 模式 / char 模式的伏笔道)
const G_EVENT = '__event__'
const G_PROMISE = '__promise__'
const G_ARC = '__arc__'
const G_RELATION = '__relation__'
const G_FACTION = '__faction__'

// ── items / groups 构建 ─────────────────────────────────────────────────────
/**
 * 把 timeline items(后端结构)转成 vis DataSet 的 items + groups。
 * 返回 { items, groups }。每个 vis item 挂 `_raw`(原始 item)+ `_jump`(跳章号)
 * 供 select 详情面板与跳章使用。
 */
function buildVis(rawItems, laneMode, maxCh) {
  const groups = new Map()   // id → {id, content, _order}
  const items = []
  const endCh = maxCh || 1

  const ensureGroup = (id, content, order) => {
    if (!groups.has(id)) groups.set(id, { id, content, _order: order })
  }

  // 关系配对(start id 形如 "src->dst@sc";end id "src->dst@end{uc}")
  const relStarts = rawItems.filter((i) => i.kind === 'relation_start')
  const promSetups = rawItems.filter((i) => i.kind === 'promise_setup')
  const promPayoffs = rawItems.filter((i) => i.kind === 'promise_payoff')

  // 角色道排序辅助:char 模式下角色名稳定排序
  const charOrder = new Map()
  if (laneMode === 'char') {
    const chars = new Set()
    for (const it of rawItems) for (const lk of it.lane_keys || []) {
      if (lk !== G_PROMISE) chars.add(lk)
    }
    ;[...chars].sort().forEach((c, i) => charOrder.set(c, i))
  }

  // 给一个 item 决定它落到哪些 group(可多道)
  const groupsFor = (it) => {
    if (laneMode === 'kind') {
      if (it.kind === 'event') return [G_EVENT]
      if (it.kind === 'arc') return [G_ARC]
      if (it.kind === 'promise_setup' || it.kind === 'promise_payoff') return [G_PROMISE]
      if (it.kind === 'faction_event') return [G_FACTION]
      return [G_RELATION] // relation_start/end
    }
    if (laneMode === 'type') {
      if (it.kind !== 'event') return [] // type 模式只看事件
      return ['et:' + (it.event_type || '其他')]
    }
    // char 模式:伏笔进固定伏笔道;其余进各 lane_keys 角色道
    if (it.kind === 'promise_setup' || it.kind === 'promise_payoff') return [G_PROMISE]
    return (it.lane_keys || []).filter((k) => k !== G_PROMISE)
  }

  const registerGroupsFor = (it) => {
    for (const gid of groupsFor(it)) {
      if (laneMode === 'kind') {
        const content = gid === G_EVENT ? '事件' : gid === G_ARC ? '弧光'
          : gid === G_PROMISE ? '◇伏笔' : gid === G_FACTION ? '势力' : '关系'
        const order = gid === G_EVENT ? 0 : gid === G_ARC ? 1 : gid === G_PROMISE ? 2
          : gid === G_FACTION ? 4 : 3
        ensureGroup(gid, content, order)
      } else if (laneMode === 'type') {
        ensureGroup(gid, gid.slice(3), 0)
      } else {
        if (gid === G_PROMISE) ensureGroup(gid, '◇伏笔', 9999)
        else ensureGroup(gid, stripRole(gid), charOrder.get(gid) ?? 5000)
      }
    }
  }

  // 已配对的伏笔/关系 id,避免 payoff/end 重复出条
  const pairedPromise = new Set()
  const pairedRelation = new Set()

  // ── 事件 ──
  for (const ev of rawItems.filter((i) => i.kind === 'event')) {
    registerGroupsFor(ev)
    const color = evColor(ev.event_type)
    const sc = ev.story_chapter ?? ev.chapter
    const np = ev.narrative_position
    const isFlashback = np != null && np !== sc
    const subj = (ev.refs?.subj || []).map(stripRole).join('、') || '—'
    for (const gid of groupsFor(ev)) {
      items.push({
        id: 'ev:' + ev.id + ':' + gid,
        group: gid,
        start: chToDate(ev.chapter),
        type: 'box',
        // FE 双保险：label || goal || event_type（前后端乱序部署时仍可读）
        content: esc(ev.label || ev.goal || ev.event_type) + (isFlashback ? ' ⟲' : ''),
        title: `第${ev.chapter}章 · ${esc(ev.label || ev.goal || ev.event_type)}　主:${esc(subj)}`,
        style: `border-color:${color};box-shadow:inset 3px 0 0 ${color};`,
        _raw: ev, _jump: sc, _cat: 'event',
      })
    }
  }

  // ── 弧光(◆点) ──
  for (const a of rawItems.filter((i) => i.kind === 'arc')) {
    registerGroupsFor(a)
    const color = arcColor(a.refs?.change_type)
    for (const gid of groupsFor(a)) {
      items.push({
        id: 'arc:' + a.id + ':' + gid,
        group: gid,
        start: chToDate(a.chapter),
        type: 'point',
        content: '◆ ' + esc(a.refs?.arc_phase || a.label || ''),
        title: `第${a.chapter}章 弧光 · ${esc(a.refs?.arc_phase || '')}${a.label ? ' · ' + esc(a.label) : ''}`,
        style: `color:${color};border-color:${color};`,
        className: 'tl-arc',
        _raw: a, _jump: a.chapter, _cat: 'arc',
      })
    }
  }

  // ── 伏笔(setup→payoff 区间) ──
  const payoffById = new Map(promPayoffs.map((p) => [p.id, p]))
  for (const s of promSetups) {
    registerGroupsFor(s)
    pairedPromise.add(s.id)
    const payoff = payoffById.get(s.id)
    const isHerring = s.refs?.promise_kind === 'red_herring'
    const isOverdue = s.refs?.overdue && !payoff
    const color = isHerring ? PROMISE_HERRING() : PROMISE_COLOR()
    const sc = s.chapter
    const pc = payoff?.chapter ?? null
    const endChapter = pc != null ? pc : endCh
    for (const gid of groupsFor(s)) {
      items.push({
        id: 'pr:' + s.id + ':' + gid,
        group: gid,
        start: chToDate(sc),
        end: chToDate(Math.max(endChapter, sc + 0.4)),
        type: 'range',
        content: '◇ ' + esc(s.label?.length > 18 ? s.label.slice(0, 17) + '…' : s.label)
          + (isHerring ? ' (障)' : '') + (pc == null ? (isOverdue ? ' 超期未收' : ' …待收') : ''),
        title: `伏笔 ch${sc}${pc != null ? '→ch' + pc + ' 已收' : isOverdue ? ' · 超期未收' : ' · 待收'} · ${esc(s.label)}`,
        style: `background-color:${color}33;border-color:${color};color:var(--color-warn);`
          + (isHerring ? 'border-style:dashed;' : '') + (isOverdue ? 'border-color:var(--color-danger);' : ''),
        _raw: { ...s, _payoff: payoff }, _jump: sc, _cat: 'promise',
      })
    }
  }

  // ── 势力大事记 ──
  for (const f of rawItems.filter((i) => i.kind === 'faction_event')) {
    registerGroupsFor(f)
    const color = palette().irony
    for (const gid of groupsFor(f)) {
      items.push({
        id: 'fac:' + f.id + ':' + gid,
        group: gid,
        start: chToDate(f.chapter),
        type: 'point',
        content: '⚑ ' + esc((f.label || '').length > 16 ? f.label.slice(0, 15) + '…' : (f.label || '')),
        title: `势力 ${esc(f.refs?.faction || '')} · 第${f.chapter}章 · ${esc(f.label || '')}`,
        style: `color:${color};border-color:${color};`,
        className: 'tl-faction',
        _raw: f, _jump: f.chapter, _cat: 'faction',
      })
    }
  }

  // ── 关系(since→until 区间) ──
  const relEndByPrefix = new Map()
  for (const e of rawItems.filter((i) => i.kind === 'relation_end')) {
    relEndByPrefix.set(e.id.split('@')[0], e)
  }
  for (const r of relStarts) {
    registerGroupsFor(r)
    pairedRelation.add(r.id)
    const prefix = r.id.split('@')[0]
    const end = relEndByPrefix.get(prefix)
    const rel = r.refs?.relation || r.label
    const color = relColor(rel)
    const sc = r.chapter
    const uc = end?.chapter ?? r.refs?.until_chapter ?? null
    const endChapter = uc != null ? uc : endCh
    const srcName = r.refs?.src ? stripRole(r.refs.src) : ''
    const dstName = r.refs?.dst ? stripRole(r.refs.dst) : ''
    for (const gid of groupsFor(r)) {
      items.push({
        id: 'rel:' + r.id + ':' + gid,
        group: gid,
        start: chToDate(sc),
        end: chToDate(Math.max(endChapter, sc + 0.4)),
        type: 'range',
        content: esc(relLabel(rel)) + (srcName ? ` ${esc(srcName)}→${esc(dstName)}` : '')
          + (uc != null ? ' ✗' : ''),
        title: `关系 ${esc(relLabel(rel))} ${esc(srcName)}→${esc(dstName)} · ch${sc}${uc != null ? '→ch' + uc + ' 失效' : ' 起'}`,
        style: `background-color:${color}26;border-color:${color};border-style:dashed;color:${color};`,
        _raw: { ...r, _end: end }, _jump: sc, _cat: 'relation',
      })
    }
  }

  const groupArr = [...groups.values()].sort((a, b) => a._order - b._order)
    .map(({ id, content }) => ({ id, content }))
  return { items, groups: groupArr }
}

// 块三:时间线选中项 → 通用选中总线 focus(伏笔→promise;事件/弧光/关系→event,payload.cat 细分)。
function visItemFocus(it) {
  const raw = it._raw || {}
  const isPromise = it._cat === 'promise'
  return {
    type: isPromise ? 'promise' : 'event',
    id: String(raw.id || it.id),
    label: raw.label || raw.event_type || '',
    payload: isPromise
      ? {
          cat: it._cat,
          setup_chapter: raw.chapter,
          payoff_chapter: raw._payoff?.chapter ?? raw.refs?.payoff_chapter ?? null,
          overdue: !!(raw.refs?.overdue && !raw._payoff),
        }
      : { cat: it._cat, chapter: raw.chapter },
    origin: 'timeline',
  }
}

// ── 主组件 ────────────────────────────────────────────────────────────────────
export function TimelineView({ onJumpChapter, onNavigateToObject, chapter = null }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [laneMode, setLaneMode] = useState('kind')   // 'kind' | 'char' | 'type'
  const [axis, setAxis] = useState('story')            // 'story' | 'narrative'
  const [selected, setSelected] = useState(null)       // { raw, cat }
  const [jumpN, setJumpN] = useState('')

  const containerRef = useRef(null)
  const timelineRef = useRef(null)       // vis Timeline 实例
  const itemsDsRef = useRef(null)        // vis DataSet(items)
  const groupsDsRef = useRef(null)       // vis DataSet(groups)
  const onJumpRef = useRef(onJumpChapter)
  onJumpRef.current = onJumpChapter
  // 块三:选中事件/伏笔/弧光/关系 → 发通用 focus(主编聚焦);取消选中 → 清空(回退视图级话术)。
  // vis 事件处理器只注册一次,经 ref 取最新 setFocus/focus/suppressNextMirror。
  const { focus, setFocus, suppressNextMirror } = useSelection()
  const setFocusRef = useRef(setFocus)
  setFocusRef.current = setFocus
  const focusRef = useRef(focus)
  focusRef.current = focus
  const suppressRef = useRef(suppressNextMirror)
  suppressRef.current = suppressNextMirror
  // 跳章统一入口:跳前置一次性 suppress 标记——跳章引发的 sel 镜像被消费掉,
  // 保住刚选中的 event/promise 聚焦(与 InsightView 卡内跳章行为对齐)。
  const jumpKeepFocus = (ch) => { suppressRef.current(); onJumpRef.current?.(ch) }

  // 已加载章区间集合，避免 rangechange 重复请求
  const loadedRangesRef = useRef([]) // [{from,to}]
  const loadingRangeRef = useRef(false)
  const dataRef = useRef(null)
  dataRef.current = data

  const markRangeLoaded = (from, to) => {
    loadedRangesRef.current = [...loadedRangesRef.current, { from, to }]
  }
  const isRangeCovered = (from, to) => loadedRangesRef.current.some(
    (r) => r.from <= from && r.to >= to,
  )

  /** 拉取 [from,to] 并入 data（动态窗口，非整书一次加载） */
  const fetchRange = useCallback(async (from, to, ax = axis, { replace = false } = {}) => {
    const lo = Math.max(1, Math.floor(from))
    const hi = Math.max(lo, Math.floor(to))
    if (!replace && isRangeCovered(lo, hi)) return null
    const d = await api.timeline(lo, hi, ax, 800)
    markRangeLoaded(d.from ?? lo, d.to ?? hi)
    setData((prev) => (replace || !prev ? d : mergeTimelinePayload(prev, d)))
    return d
  }, [axis])

  /**
   * 首屏：有当前写作章则拉 N-5…N+5；否则探测 max 后拉末窗。
   * 脏 max 仍退回前 80 章。
   */
  const load = useCallback(async (ax = axis) => {
    setLoading(true)
    setError(null)
    loadedRangesRef.current = []
    try {
      const around = bootWindowForChapter(chapter)
      if (around) {
        const boot = await api.timeline(around.from, around.to, ax, 800)
        markRangeLoaded(boot.from ?? around.from, boot.to ?? around.to)
        setData(boot)
        return
      }
      const probe = await api.timeline(1, 1, ax, 50)
      const maxDecl = Number(probe.max_chapter) || 1
      let boot
      if (maxDecl > MAX_CH_SANE) {
        boot = await api.timeline(1, 80, ax, 800)
        markRangeLoaded(1, 80)
        const im = itemsChapterMax(boot.items)
        if (im > 80) {
          const lo = Math.max(1, im - CH_WINDOW + 1)
          const tail = await api.timeline(lo, im, ax, 800)
          markRangeLoaded(lo, im)
          boot = mergeTimelinePayload(boot, tail)
        }
        setData(boot)
      } else {
        const hi = Math.max(1, maxDecl)
        const lo = Math.max(1, hi - CH_WINDOW + 1)
        boot = await api.timeline(lo, hi, ax, 800)
        markRangeLoaded(lo, hi)
        setData({ ...boot, max_chapter: maxDecl })
      }
    } catch (e) {
      setError(e.message || '加载失败')
    } finally {
      setLoading(false)
    }
  }, [axis, chapter])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const onLive = (e) => {
      if (liveTouchesTable(e?.detail, [
        'event', 'promise', 'char_state', 'relation', 'chapter',
        'character_relation', 'character', 'faction',
      ])) {
        load()
      }
    }
    window.addEventListener('s3-live', onLive)
    return () => window.removeEventListener('s3-live', onLive)
  }, [load])

  const switchAxis = (ax) => { setAxis(ax); load(ax) }

  const maxCh = effectiveMaxChapter(data)

  const counts = useMemo(() => {
    if (!data) return { events: 0, promises: 0, arcs: 0, relations: 0, factions: 0 }
    const it = data.items || []
    return {
      events: it.filter((i) => i.kind === 'event').length,
      promises: it.filter((i) => i.kind === 'promise_setup').length,
      arcs: it.filter((i) => i.kind === 'arc').length,
      relations: it.filter((i) => i.kind === 'relation_start').length,
      factions: it.filter((i) => i.kind === 'faction_event').length,
    }
  }, [data])

  const { items, groups } = useMemo(
    () => (data ? buildVis(data.items || [], laneMode, maxCh) : { items: [], groups: [] }),
    [data, laneMode, maxCh]
  )
  const visItemsRef = useRef(items)
  visItemsRef.current = items

  const applyRelatedHighlight = useCallback((selectedRow) => {
    const ds = itemsDsRef.current
    const visItems = visItemsRef.current || []
    const related = new Set(relatedVisIds(selectedRow, visItems))
    const updates = []
    for (const it of visItems) {
      const next = withHighlightClass(it.className, related.has(it.id))
      if (next !== String(it.className || '')) {
        it.className = next
        updates.push({ id: it.id, className: next })
      }
    }
    if (updates.length && ds && typeof ds.update === 'function') {
      try { ds.update(updates) } catch { /* mock / vis 版本差 */ }
    }
  }, [])

  const drawCausalArrows = useCallback(() => {
    const tl = timelineRef.current
    const host = containerRef.current
    if (!tl || !host) return
    let svg = host.querySelector('svg.tl-causal')
    if (!svg) {
      svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
      svg.setAttribute('class', 'tl-causal')
      svg.setAttribute('data-testid', 'timeline-causal')
      svg.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:3;overflow:visible'
      host.appendChild(svg)
    }
    svg.setAttribute('role', 'img')
    svg.setAttribute('aria-label', '因果关系连线图')
    const w = typeof tl.getWindow === 'function' ? tl.getWindow() : null
    if (!w?.start || !w?.end) { svg.innerHTML = ''; return }
    const start = new Date(w.start).getTime()
    const end = new Date(w.end).getTime()
    const span = end - start || 1
    const width = host.clientWidth || 1
    const xOf = (ch) => ((chToDate(ch).getTime() - start) / span) * width
    const arcs = causalArcsFromItems(visItemsRef.current)
    const y = 22
    const paths = arcs.map(({ from, to }) => {
      const x1 = xOf(from)
      const x2 = xOf(to)
      const mid = (x1 + x2) / 2
      return `<path d="M ${x1} ${y} C ${mid} ${y - 16}, ${mid} ${y - 16}, ${x2} ${y}" fill="none" stroke="var(--color-brand)" stroke-width="1.2" marker-end="url(#tl-arrow)" opacity="0.75"/>`
    }).join('')
    svg.innerHTML = `<defs><marker id="tl-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="var(--color-brand)" /></marker></defs>${paths}`
  }, [])

  const jumpToChapter = useCallback((n) => {
    const win = jumpWindowForChapter(n)
    if (!win) return
    Promise.resolve(fetchRange(win.from, win.to)).finally(() => {
      const tl = timelineRef.current
      if (!tl) return
      tl.setWindow(chToDate(win.from), chToDate(win.to), { animation: !prefersReducedMotion() })
      requestAnimationFrame(() => drawCausalArrows())
    })
  }, [fetchRange, drawCausalArrows])

  const hasContent = items.length > 0 && groups.length > 0

  const listItems = useMemo(() => {
    const its = data?.items || []
    return its.map((it) => ({ raw: it, cat: catOfKind(it.kind) })).filter((x) => x.cat)
  }, [data])

  const pickFromList = useCallback((raw, cat) => {
    const row = { raw, cat, id: raw?.id }
    setSelected(row)
    setFocus(visItemFocus({ _raw: raw, _cat: cat, id: raw?.id }))
    applyRelatedHighlight(row)
  }, [setFocus, applyRelatedHighlight])

  // #74:仅当确有「叙事位 ≠ 故事章」的事件时,「叙事顺序」轴才有意义(否则两轴投影一致=空操作)。
  // 判定与 axis 无关(每事件恒带 story_chapter/narrative_position),默认 story 轴加载即可判。
  const canNarrative = useMemo(() => hasNarrativeData(data?.items || []), [data])
  // 防御:若因外部数据变更陷在无叙事数据的 narrative 轴,回落 story(正常经禁用按钮到不了此态)。
  useEffect(() => {
    if (data && !canNarrative && axis === 'narrative') switchAxis('story')
  }, [canNarrative, data])  // eslint-disable-line react-hooks/exhaustive-deps

  // ── 容器像素尺寸（始终观察；fallback 避免 height=0 整页空白）──
  const [boxSize, setBoxSize] = useState({ w: 0, h: 0 })
  const axisRef = useRef(axis)
  axisRef.current = axis
  useEffect(() => {
    const el = containerRef.current
    if (!el) return undefined
    const measure = () => {
      const r = el.getBoundingClientRect()
      let h = Math.round(r.height)
      let w = Math.round(r.width)
      // 父链未撑开时用 parent / 视口兜底，避免永远不建 vis
      if (h < 40) {
        const ph = el.parentElement?.clientHeight || 0
        h = ph > 40 ? ph : Math.max(360, Math.round(window.innerHeight * 0.45))
      }
      if (w < 40) w = el.parentElement?.clientWidth || 640
      setBoxSize((prev) => (prev.w === w && prev.h === h ? prev : { w, h }))
    }
    measure()
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure)
      return () => window.removeEventListener('resize', measure)
    }
    const ro = new ResizeObserver(() => measure())
    ro.observe(el)
    if (el.parentElement) ro.observe(el.parentElement)
    return () => ro.disconnect()
  }, [])

  // 把视野对准「当前 vis items 的真实章范围」（空白主因常是窗口跳到无数据区）
  const focusWindowOnItems = useCallback((tl, visItems) => {
    if (!tl) return
    let lo = Infinity
    let hi = -Infinity
    for (const it of visItems || []) {
      const raw = it._raw
      const c = Number(raw?.chapter ?? it._jump) || 0
      if (c > 0) {
        if (c < lo) lo = c
        if (c > hi) hi = c
      }
      // range 条目 end 也参与
      if (it.end instanceof Date) {
        const ce = dateToCh(it.end)
        if (Number.isFinite(ce) && ce > hi) hi = ce
      }
    }
    if (!Number.isFinite(lo) || lo === Infinity) {
      lo = 1
      hi = Math.max(1, maxCh || 10)
    }
    if (hi < lo) hi = lo
    // 左右留白半章，避免贴边看不见
    tl.setWindow(
      chToDate(Math.max(1, lo - 0.5)),
      chToDate(hi + 1.5),
      { animation: false },
    )
  }, [maxCh])

  // ── 初始化 / 更新 vis-timeline ────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || !hasContent) return
    // 优先用测量高度；禁止用会覆盖成 0 的 100% CSS
    const pxH = Math.max(
      320,
      boxSize.h > 40 ? boxSize.h : (containerRef.current.parentElement?.clientHeight || 0) || Math.round(window.innerHeight * 0.5),
    )

    if (!timelineRef.current) {
      itemsDsRef.current = new DataSet(items)
      groupsDsRef.current = new DataSet(groups)
      const tl = new Timeline(containerRef.current, itemsDsRef.current, groupsDsRef.current, {
        stack: true,
        stackSubgroups: true,
        orientation: { axis: 'top', item: 'top' },
        zoomable: true,
        moveable: true,
        selectable: true,
        // 竖滚开、横滚关：二者同开时 vis 常整页空白（已知坑）
        verticalScroll: true,
        horizontalScroll: false,
        zoomKey: 'ctrlKey',
        margin: { item: { horizontal: 4, vertical: 6 }, axis: 6 },
        groupHeightMode: 'auto',
        height: `${pxH}px`,
        maxHeight: `${pxH}px`,
        zoomMin: DAY * 2,
        zoomMax: DAY * 2000,
        format: {
          minorLabels: (date) => '第' + dateToCh(new Date(date)) + '章',
          majorLabels: () => '',
        },
        tooltip: { followMouse: true, overflowMethod: 'cap' },
      })

      tl.on('select', (props) => {
        const id = props.items?.[0]
        if (!id) {
          setSelected(null)
          setFocusRef.current(null)
          applyRelatedHighlight(null)
          return
        }
        const it = itemsDsRef.current.get(id)
        if (it) {
          const row = { raw: it._raw, cat: it._cat, id: it.id }
          setSelected(row)
          setFocusRef.current(visItemFocus(it))
          applyRelatedHighlight(row)
        }
      })
      // vis-timeline 的 afterDraw 等价事件：changed（每次重绘后）
      tl.on('changed', () => { drawCausalArrows() })
      const origRedraw = tl.redraw?.bind(tl)
      if (origRedraw) {
        tl.redraw = (...a) => {
          const r = origRedraw(...a)
          try { drawCausalArrows() } catch { /* */ }
          return r
        }
      }
      tl.on('doubleClick', (props) => {
        if (!props.item) return
        const it = itemsDsRef.current.get(props.item)
        if (it) jumpKeepFocus(it._jump ?? it._raw?.chapter)
      })
      // 拖动/缩放窗口 → 动态补载可见章区间
      tl.on('rangechanged', (props) => {
        if (loadingRangeRef.current) return
        try {
          const startCh = dateToCh(props.start)
          const endCh = dateToCh(props.end)
          if (!Number.isFinite(startCh) || !Number.isFinite(endCh)) return
          const pad = Math.ceil(CH_WINDOW / 2)
          const lo = Math.max(1, Math.min(startCh, endCh) - pad)
          const hi = Math.max(startCh, endCh) + pad
          if (isRangeCovered(lo, hi)) return
          loadingRangeRef.current = true
          fetchRange(lo, hi, axisRef.current || 'story')
            .catch(() => { /* 静默 */ })
            .finally(() => { loadingRangeRef.current = false })
        } catch { /* */ }
      })

      timelineRef.current = tl
      focusWindowOnItems(tl, items)
    } else {
      try {
        itemsDsRef.current.clear()
        itemsDsRef.current.add(items)
        groupsDsRef.current.clear()
        groupsDsRef.current.add(groups)
        timelineRef.current.setOptions({
          height: `${pxH}px`,
          maxHeight: `${pxH}px`,
          verticalScroll: true,
          horizontalScroll: false,
        })
        // 仅当当前窗口内几乎看不到条目时再拉回（避免动态加载时抢视野）
        const w = timelineRef.current.getWindow?.()
        if (w?.start && w?.end) {
          const a = dateToCh(w.start)
          const b = dateToCh(w.end)
          const inView = items.some((it) => {
            const c = Number(it._raw?.chapter || it._jump) || 0
            return c >= Math.min(a, b) - 1 && c <= Math.max(a, b) + 1
          })
          if (!inView) focusWindowOnItems(timelineRef.current, items)
        } else {
          focusWindowOnItems(timelineRef.current, items)
        }
      } catch { /* */ }
    }

    requestAnimationFrame(() => {
      try {
        timelineRef.current?.redraw()
      } catch { /* */ }
    })
  }, [items, groups, hasContent, maxCh, boxSize.h, fetchRange, focusWindowOnItems])

  // 卸载销毁
  useEffect(() => () => {
    if (timelineRef.current) { timelineRef.current.destroy(); timelineRef.current = null }
  }, [])

  // 无障碍:系统「减弱动态」时全览缩放不做动画。
  const fitAll = () => {
    const tl = timelineRef.current
    if (!tl) return
    // 全览前尽量拉齐「有效」全书窗（不请求脏 max）
    const hi = maxCh || 1
    if (hi > 0 && !isRangeCovered(1, Math.min(hi, CH_WINDOW))) {
      fetchRange(1, Math.min(hi, CH_WINDOW * 2)).finally(() => {
        tl.fit({ animation: !prefersReducedMotion() })
      })
      return
    }
    tl.fit({ animation: !prefersReducedMotion() })
  }

  return (
    <div className="h-full min-h-0 flex flex-col bg-canvas overflow-hidden" data-testid="timeline-view">
      {/* ── 顶栏:Upstream 胶囊切换 ── */}
      <div className="h-11 shrink-0 border-b border-line/60 bg-surface/95 backdrop-blur-sm flex items-center gap-2 px-4 overflow-x-auto">
        <Clock size={15} className="text-brand shrink-0" />
        <span className="text-f13 font-semibold tracking-tight text-ink shrink-0">时间线</span>
        {data && (
          <span className="text-meta text-faint tnum shrink-0">
            {counts.events}事件·{counts.promises}伏笔·{counts.arcs}弧光·{counts.relations}关系{counts.factions ? `·${counts.factions}势力` : ''}
            {maxCh > 0 && ` · 约至第${maxCh}章`}
            {data.from != null && data.to != null && (
              <span className="text-faint"> · 已载 ch{data.from}–{data.to}</span>
            )}
            {data.truncated && <span className="text-warn"> · 区间截断</span>}
            {(Number(data.max_chapter) || 0) > MAX_CH_SANE && (
              <span className="text-warn" title="库中存在异常大章号，已按实际条目估算窗口"> · 已忽略脏章号</span>
            )}
          </span>
        )}

        {/* 泳道切换 — 胶囊组 */}
        <div className="flex items-center gap-0.5 ml-1 shrink-0 rounded-md bg-soft/80 p-0.5">
          <span className="text-meta text-faint px-1.5">泳道</span>
          {[{ v: 'kind', l: '四类' }, { v: 'char', l: '角色' }, { v: 'type', l: '事件类型' }].map(({ v, l }) => (
            <button key={v}
              onClick={() => setLaneMode(v)}
              className={`h-6 px-2 rounded-lg text-meta font-medium transition-colors cursor-pointer
                ${laneMode === v ? 'bg-surface text-brand shadow-sm' : 'text-faint hover:text-ink'}`}
            >{l}</button>
          ))}
        </div>

        {/* 故事/叙事双轴 —— #74:无「叙事位≠故事章」事件时禁用「叙事顺序」 */}
        <div className="flex items-center gap-0.5 ml-1 shrink-0 rounded-md bg-soft/80 p-0.5">
          <span className="text-meta text-faint px-1.5">轴</span>
          {[{ v: 'story', l: '故事编年' }, { v: 'narrative', l: '叙事顺序' }].map(({ v, l }) => {
            const disabled = v === 'narrative' && !canNarrative
            return (
              <button key={v}
                onClick={() => { if (!disabled) switchAxis(v) }}
                disabled={disabled}
                title={disabled
                  ? '暂无倒叙/闪回事件(全部事件叙事位=故事章)——录入含「叙事位」的事件后可切叙事顺序轴'
                  : v === 'narrative' ? '叙事顺序:事件按被讲述的位置横铺,倒叙/闪回落到叙事位' : '故事编年:事件按实际发生章号横铺'}
                className={`h-6 px-2 rounded-lg text-meta font-medium transition-colors
                  ${disabled ? 'text-faint/40 cursor-not-allowed'
                    : axis === v ? 'bg-surface text-brand shadow-sm cursor-pointer' : 'text-faint hover:text-ink cursor-pointer'}`}
              >{l}</button>
            )
          })}
        </div>

        <form
          className="ml-1 flex items-center gap-1 shrink-0"
          data-testid="timeline-jump"
          onSubmit={(e) => { e.preventDefault(); jumpToChapter(jumpN) }}
        >
          <input
            type="number"
            min={1}
            className="w-16 h-6 px-1.5 text-meta border border-line rounded-md bg-canvas"
            placeholder="第N章"
            value={jumpN}
            onChange={(e) => setJumpN(e.target.value)}
            aria-label="跳到第N章"
          />
          <button type="submit"
            className="h-6 px-2 rounded-md text-meta font-medium bg-soft/80 text-faint hover:text-ink cursor-pointer"
          >跳到这章</button>
        </form>

        <button onClick={fitAll}
          className="ml-1 h-6 px-2.5 rounded-md text-meta font-medium bg-soft/80 text-faint hover:text-ink hover:bg-soft transition-colors cursor-pointer shrink-0"
          title="缩放至全书概览(滚轮按 Ctrl 缩放,拖动平移)"
        >全览</button>

        <div className="ml-auto shrink-0">
          <button onClick={() => load()} disabled={loading}
            className="w-7 h-7 grid place-items-center rounded-md text-faint hover:text-ink hover:bg-soft transition-colors cursor-pointer disabled:opacity-40">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* ── 主体：min-h-0 保证 flex 子项可滚动；左列表与画布各自 overflow ── */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        <TimelineEventList
          items={listItems}
          selectedId={selected?.raw?.id}
          onPick={pickFromList}
        />
        <div className="flex-1 min-w-0 min-h-0 flex flex-col relative overflow-hidden">
          {(() => {
            const kind = timelineEmptyKind({ data, hasContent, error, loading })
            if (!kind || kind === 'loading' && data) return null
            const copy = timelineEmptyCopy(kind === 'loading' ? 'loading' : kind)
            if (kind === 'error') {
              return (
                <div className="absolute inset-0 z-10 flex items-center justify-center p-4 pointer-events-none">
                  <div className="text-f13 text-red-500 bg-red-50 rounded-lg px-3 py-2 border border-red-200 pointer-events-auto">{error}</div>
                </div>
              )
            }
            if (kind === 'loading') {
              return (
                <div className="absolute inset-0 z-10 flex items-center justify-center text-f12 text-faint gap-2">
                  <RefreshCw size={14} className="animate-spin" />{copy.title}
                </div>
              )
            }
            return (
              <div className="absolute inset-0 z-10 flex items-center justify-center text-f13 text-faint pointer-events-none">
                <div className="text-center px-6" data-testid="timeline-empty">
                  <Clock size={32} className="mx-auto mb-2 opacity-30" />
                  <div className="text-ink">{copy.title}</div>
                  <div className="text-meta mt-1 opacity-60">{copy.body}</div>
                </div>
              </div>
            )
          })()}
          <div
            ref={containerRef}
            className="tl-vis flex-1 min-h-0 w-full"
            data-testid="timeline-canvas"
            style={{ minHeight: 360, height: boxSize.h > 40 ? boxSize.h : undefined }}
          />
        </div>

        {selected && (
          <TimelineDetailPanel
            raw={selected.raw}
            cat={selected.cat}
            onJump={jumpKeepFocus}
            onNavigate={onNavigateToObject}
            defaultChapter={maxCh || selected.raw?.chapter}
            onChanged={() => load()}
            onClose={() => { setSelected(null); if (focus?.origin === 'timeline') setFocus(null); timelineRef.current?.setSelection([]); applyRelatedHighlight(null) }}
          />
        )}
      </div>

      {/* 图例 + 操作提示 */}
      {hasContent && (
        <div className="shrink-0 flex items-center gap-3 px-4 py-1.5 border-t border-line bg-surface/50 overflow-x-auto text-meta text-faint">
          <span className="shrink-0 font-medium">图例:</span>
          <span className="shrink-0 inline-flex items-center gap-1">
            <i className="inline-block w-3 h-3 rounded border border-line bg-surface" style={{ boxShadow: `inset 3px 0 0 ${palette().secret}` }} />事件
          </span>
          <span className="shrink-0 inline-flex items-center gap-1">
            <i className="inline-block w-2.5 h-2.5 bg-purple-600" style={{ transform: 'rotate(45deg)' }} />弧光◆
          </span>
          <span className="shrink-0 inline-flex items-center gap-1">
            <i className="inline-block w-3 h-2 rounded bg-amber-400/25 border border-amber-400" />伏笔条◇
          </span>
          <span className="shrink-0 inline-flex items-center gap-1">
            <i className="inline-block w-3 h-2 rounded border border-dashed border-sky-500" />关系条
          </span>
          <span className="shrink-0 text-red-500 inline-flex items-center gap-1"><AlertTriangle size={11} />超期未收</span>
          <span className="shrink-0">✗ 失效</span>
          <span className="shrink-0 ml-auto opacity-70">单击看详情 · 双击跳章 · Ctrl+滚轮缩放 · 拖动平移</span>
        </div>
      )}

      {/* vis-timeline 主题微调 — 禁止 height:100%!important（会盖掉像素高→空白） */}
      <style>{`
        .tl-vis { touch-action: pan-x pan-y; position: relative; }
        .tl-vis .vis-timeline {
          border: none;
          font-family: inherit;
          /* 高度由 vis options.height 像素控制，勿写 100% !important */
        }
        .tl-vis .vis-panel.vis-left,
        .tl-vis .vis-panel.vis-center,
        .tl-vis .vis-panel.vis-top,
        .tl-vis .vis-panel.vis-bottom { border-color: var(--color-line); }
        .tl-vis .vis-labelset .vis-label,
        .tl-vis .vis-foreground .vis-group { border-color: var(--color-line); }
        .tl-vis .vis-labelset .vis-label { color: var(--color-faint); font-size: 11px; }
        .tl-vis .vis-labelset .vis-label .vis-inner { padding: 4px 8px; font-weight: 500; }
        .tl-vis .vis-time-axis .vis-text { color: var(--color-faint); font-size: 10px; }
        .tl-vis .vis-item {
          /* 保证条目对比度，避免 surface 上“有数据看不见” */
          opacity: 1 !important;
        }
        .tl-vis .vis-vertical-scroll { overflow-y: auto !important; }
        .tl-vis .vis-time-axis .vis-grid.vis-minor { border-color: color-mix(in srgb, var(--color-line) 60%, transparent); }
        .tl-vis .vis-item {
          border-radius: 6px; border-width: 1px;
          background-color: var(--color-surface); color: var(--color-ink);
          font-size: 11px;
        }
        .tl-vis .vis-item.vis-selected {
          box-shadow: 0 0 0 2px var(--color-brand); z-index: 5;
        }
        .tl-vis .vis-item.vis-highlighted,
        .tl-vis .vis-item.tl-related {
          box-shadow: 0 0 0 2px var(--color-irony); z-index: 4;
        }
        .tl-vis svg.tl-causal { pointer-events: none; }
        .tl-vis .vis-item.vis-box { padding: 2px 6px; }
        .tl-vis .vis-item.vis-dot { border-width: 5px; }
        .tl-vis .vis-item.tl-arc.vis-point .vis-item-content { font-weight: 600; }
        .tl-vis .vis-item .vis-item-content { padding: 1px 2px; white-space: nowrap; }
        .tl-vis .vis-current-time { background-color: var(--color-brand); }
        .tl-vis .vis-tooltip {
          background: var(--color-surface); color: var(--color-ink);
          border: 1px solid var(--color-line); border-radius: 6px;
          padding: 4px 8px; font-size: 11px; box-shadow: 0 2px 8px rgba(0,0,0,.12);
        }
      `}</style>
    </div>
  )
}
