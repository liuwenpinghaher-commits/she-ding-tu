import { useEffect, useState } from "react";
import { useStore } from "../state/store";
import {
  currentStep,
  findGuideAnchor,
  finishGuide,
  GUIDE_MAIN,
  loadGuide,
  nextGuide,
  prevGuide,
  skipGuide,
  startGuide,
  subscribeGuide,
} from "./guide";

type Spot = { top: number; left: number; width: number; height: number };
type Box = { top?: number; left?: number; right?: number; bottom?: number };

function layout(el: HTMLElement | null): { spot: Spot | null; bubble: Box } {
  if (!el) return { spot: null, bubble: { right: 16, bottom: 16 } };
  const r = el.getBoundingClientRect();
  const spot = { top: r.top - 6, left: r.left - 6, width: r.width + 12, height: r.height + 12 };
  const bw = 320;
  const bh = 200;
  let top = r.bottom + 10;
  let left = r.left;
  if (top + bh > window.innerHeight - 8) top = Math.max(8, r.top - bh - 10);
  if (left + bw > window.innerWidth - 8) left = Math.max(8, window.innerWidth - bw - 8);
  if (left < 8) left = 8;
  return { spot, bubble: { top, left } };
}

export function GuideTour() {
  const s = useStore();
  const [, setTick] = useState(0);
  const bump = () => setTick((n) => n + 1);
  useEffect(() => subscribeGuide(bump), []);

  const persist = loadGuide();
  const step = currentStep();
  const running = persist.status === "running" && !!step;

  useEffect(() => {
    if (!running) return;
    const on = () => bump();
    window.addEventListener("resize", on);
    window.addEventListener("scroll", on, true);
    const t = window.setInterval(on, 400);
    return () => {
      window.removeEventListener("resize", on);
      window.removeEventListener("scroll", on, true);
      window.clearInterval(t);
    };
  }, [running, persist.index]);

  useEffect(() => {
    if (persist.status !== "running" || !step) return;
    if (step.id === "G0" && s.route.kind === "new") nextGuide();
    if (step.id === "G1" && (s.route.kind === "board" || s.route.kind === "scene")) nextGuide();
  }, [persist.status, persist.index, step?.id, s.route.kind]);

  useEffect(() => {
    if (!step) return;
    const el = findGuideAnchor(step.anchor);
    try { el?.scrollIntoView({ block: "nearest", inline: "nearest" }); } catch { /* ignore */ }
  }, [step?.id, persist.index]);

  if (!step || persist.status !== "running") return null;

  const anchor = findGuideAnchor(step.anchor);
  const { spot, bubble } = layout(anchor);
  const last = persist.index >= GUIDE_MAIN.length - 1;
  const atStart = persist.index <= 0;

  return (
    <>
      {spot && (
        <div
          className="guide-spot"
          data-testid="guide-spot"
          aria-hidden="true"
          style={{ top: spot.top, left: spot.left, width: spot.width, height: spot.height }}
        />
      )}
      <aside
        className="guide-bubble"
        data-testid="guide-bubble"
        role="status"
        style={bubble}
      >
        <p className="guide-kicker" data-testid="guide-step">{step.id} · {step.title}</p>
        <p className="guide-body">{step.bubble}</p>
        {!anchor && <p className="muted">这一步的钉子这页没有，先看这句话，或点下一步。</p>}
        <p className="muted" data-testid="guide-progress">{persist.index + 1} / {GUIDE_MAIN.length}</p>
        <div className="guide-actions">
          <button type="button" data-testid="guide-prev" disabled={atStart} onClick={prevGuide}>上一步</button>
          <button type="button" className="primary" data-testid="guide-next" onClick={last ? finishGuide : nextGuide}>
            {last ? "完成" : "下一步"}
          </button>
          <button type="button" data-testid="guide-skip" onClick={skipGuide}>跳过引导</button>
        </div>
      </aside>
    </>
  );
}

export function GuideStartButton({ testid, label }: { testid: string; label: string }) {
  return (
    <button
      type="button"
      className="icon-btn"
      data-testid={testid}
      title="快速使用引导，可随时跳过"
      onClick={() => startGuide()}
    >{label}</button>
  );
}
