import { StoreProvider, useStore } from "./state/store";
import { Topbar } from "./shell/Topbar";
import { LeftRail } from "./shell/LeftRail";
import { Workspace } from "./board/Workspace";
import { ScenePage } from "./scene/ScenePage";
import { ShelfPage } from "./pages/ShelfPage";
import { NewBookPage } from "./pages/NewBookPage";
import { LibraryPage } from "./pages/LibraryPage";
import { SettingsPage } from "./pages/SettingsPage";
import { DossierPage } from "./pages/DossierPage";
import { Dialogs } from "./pages/Dialogs";
import { CommandPalette } from "./shell/CommandPalette";
import { GuideTour } from "./shell/GuideTour";

function Shell() {
  const s = useStore();
  const r = s.route;
  const fullPage = r.kind === "shelf" || r.kind === "new" || r.kind === "library" || r.kind === "settings" || r.kind === "export";
  const hall = r.kind === "shelf" || r.kind === "new" || r.kind === "library" || r.kind === "settings";
  const showBoard = r.kind === "board" || r.kind === "scene" || r.kind === "dossier" || (!fullPage && !!s.state?.book);
  const chrome = s.sceneChrome;

  return (
    <div className={`app chrome-${chrome}${hall ? " hall" : ""}`}>
      <Topbar />
      {s.banner && <div className="banner">{s.banner}</div>}
      {(r.kind === "shelf" || !s.state?.book) && r.kind !== "new" && r.kind !== "library" && r.kind !== "settings" && <ShelfPage />}
      <div data-testid="new-book-page" data-guide="g1" className={r.kind === "new" ? "page show" : "page"} hidden={r.kind !== "new"}>
        <NewBookPage />
      </div>
      {r.kind === "library" && <LibraryPage />}
      {r.kind === "settings" && <SettingsPage />}
      {r.kind === "dossier" && <DossierPage mode="full" />}
      {showBoard && s.state?.book && r.kind !== "dossier" && (
        <div className="work">
          <LeftRail />
          <Workspace />
          <ScenePage />
        </div>
      )}
      <CommandPalette open={s.cmdOpen} onClose={() => s.setCmdOpen(false)} />
      <Dialogs />
      <GuideTour />
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
