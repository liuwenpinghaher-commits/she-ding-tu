import { StoreProvider, useStore } from "./state/store";
import { Topbar } from "./shell/Topbar";
import { LeftRail } from "./shell/LeftRail";
import { Stripboard } from "./board/Stripboard";
import { ScenePage } from "./scene/ScenePage";
import { LookRail } from "./looks/LookRail";
import { ShelfPage } from "./pages/ShelfPage";
import { NewBookPage } from "./pages/NewBookPage";
import { LibraryPage } from "./pages/LibraryPage";
import { SettingsPage } from "./pages/SettingsPage";
import { Dialogs } from "./pages/Dialogs";

function Shell() {
  const s = useStore();
  const r = s.route;
  const fullPage = r.kind === "shelf" || r.kind === "new" || r.kind === "library" || r.kind === "settings" || r.kind === "export";
  const showBoard = r.kind === "board" || r.kind === "scene" || r.kind === "dossier" || (!fullPage && !!s.state?.book);

  return (
    <div className="app">
      <Topbar />
      {s.banner && <div className="banner">{s.banner}</div>}
      {(r.kind === "shelf" || !s.state?.book) && r.kind !== "new" && r.kind !== "library" && r.kind !== "settings" && <ShelfPage />}
      <div data-testid="new-book-page" className={r.kind === "new" ? "page show" : "page"} hidden={r.kind !== "new"}>
        <NewBookPage />
      </div>
      {r.kind === "library" && <LibraryPage />}
      {r.kind === "settings" && <SettingsPage />}
      {showBoard && s.state?.book && (
        <div className="work">
          <LeftRail />
          <div className="board-wrap">
            <Stripboard />
          </div>
          <ScenePage />
          <div className="look-host">
            <LookRail />
          </div>
        </div>
      )}
      <Dialogs />
    </div>
  );
}

export function App() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  );
}
