import { TabBar } from "../shell/TabBar";
import { Stripboard } from "./Stripboard";
import { TimelineView } from "./TimelineView";
import { LookRail } from "../looks/LookRail";
import { useStore } from "../state/store";
import { readExtraLook, type AnyLook } from "../shell/workspaceTabs";

function Pane({ tab }: { tab: AnyLook }) {
  if (tab === "时间轴") return <TimelineView />;
  if (tab === "分场条") return <Stripboard />;
  return <LookRail embedded tab={tab} />;
}

export function Workspace() {
  const s = useStore();
  const tab = s.workspaceTab;
  const split = s.splitTab && s.splitTab !== tab ? s.splitTab : null;
  const extra = readExtraLook(s.q.look);
  return (
    <div className={`board-wrap${split ? " is-split" : ""}`} data-testid="board-wrap">
      <TabBar />
      <div className="split-panes">
        <div className="split-pane" data-testid="pane-main">
          <Pane tab={tab} />
        </div>
        {split && (
          <div className="split-pane" data-testid="pane-split">
            <Pane tab={split} />
          </div>
        )}
      </div>
      {extra && <LookRail />}
    </div>
  );
}
