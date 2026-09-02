import { TabBar } from "../shell/TabBar";
import { Stripboard } from "./Stripboard";
import { TimelineView } from "./TimelineView";
import { LookRail } from "../looks/LookRail";
import { useStore } from "../state/store";
import { readExtraLook, WORKSPACE_TABS, type AnyLook, type TabFilter, type WorkspaceTab } from "../shell/workspaceTabs";
import { PaneCtx, type PaneId } from "./PaneCtx";

function PaneFilter({ paneId }: { paneId: PaneId }) {
  const s = useStore();
  const filter = paneId === "split" ? s.splitFilter : s.tabFilter;
  const set = paneId === "split" ? s.setSplitFilter : s.setTabFilter;
  const status = filter?.status || "all";
  const setStatus = (status: TabFilter["status"]) => set({ ...(filter || {}), status });
  return (
    <div className="look-toolbar pane-filter" data-testid={`pane-filter-${paneId}`}>
      <button type="button" data-testid={`pane-${paneId}-filter-all`} className={status === "all" ? "on" : ""} onClick={() => setStatus("all")}>全部</button>
      <button type="button" data-testid={`pane-${paneId}-filter-draft`} className={status === "draft" ? "on" : ""} onClick={() => setStatus("draft")}>草稿</button>
      <button type="button" data-testid={`pane-${paneId}-filter-canon`} className={status === "canon" ? "on" : ""} onClick={() => setStatus("canon")}>正史</button>
    </div>
  );
}

function Pane({ tab, paneId }: { tab: AnyLook; paneId: PaneId }) {
  const s = useStore();
  return (
    <PaneCtx.Provider value={paneId}>
      <div className="pane-chrome">
        {paneId === "split" && (
          <label className="pane-split-pick">
            右栏
            <select
              data-testid="split-kind"
              value={tab}
              onChange={(e) => s.setSplit(e.target.value as WorkspaceTab)}
            >
              {WORKSPACE_TABS.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          </label>
        )}
        <PaneFilter paneId={paneId} />
      </div>
      <div className="pane-body">
        {tab === "时间轴" ? <TimelineView /> : tab === "分场条" ? <Stripboard /> : <LookRail embedded tab={tab} />}
      </div>
    </PaneCtx.Provider>
  );
}

export function Workspace() {
  const s = useStore();
  const tab = s.workspaceTab;
  const split = s.splitTab;
  const extra = readExtraLook(s.q.look);
  return (
    <div className={`board-wrap${split ? " is-split" : ""}`} data-testid="board-wrap">
      <TabBar />
      <div className="split-panes">
        <div className="split-pane" data-testid="pane-main">
          <Pane tab={tab} paneId="main" />
        </div>
        {split && (
          <div className="split-pane" data-testid="pane-split">
            <Pane tab={split} paneId="split" />
          </div>
        )}
      </div>
      {extra && <LookRail />}
    </div>
  );
}
