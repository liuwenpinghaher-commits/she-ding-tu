import { useEffect } from "react";
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

function demoteQaHooks(root: ParentNode) {
  root.querySelectorAll<HTMLElement>(".qa-hook, .qa-tray summary").forEach((el) => {
    if (el.tabIndex >= 0) el.tabIndex = -1;
  });
}

function Shell() {
  const s = useStore();
  useEffect(() => {
    const root = document.getElementById("root");
    if (!root) return;
    demoteQaHooks(root);
    const mo = new MutationObserver(() => demoteQaHooks(root));
    mo.observe(root, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, []);
  const r = s.route;
  const fullPage = r.kind === "shelf" || r.kind === "new" || r.kind === "library" || r.kind === "settings" || r.kind === "export";
  const hall = r.kind === "shelf" || r.kind === "new" || r.kind === "library" || r.kind === "settings";
  const showBoard = r.kind === "board" || r.kind === "scene" || r.kind === "dossier" || (!fullPage && !!s.state?.book);
  const chrome = s.sceneChrome;
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 900px)");
    const on = () => { if (!mq.matches) s.setDrawer(null); };
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [s.setDrawer]);

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
        <div className={`work${s.drawer === "left" ? " drawer-left" : ""}${s.drawer === "right" ? " drawer-right" : ""}`}>
          <button type="button" className="drawer-back" aria-label="关掉侧栏" onClick={() => s.setDrawer(null)} />
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
