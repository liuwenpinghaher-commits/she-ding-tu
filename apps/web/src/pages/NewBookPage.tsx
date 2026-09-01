import { useState } from "react";
import { useStore } from "../state/store";

export function NewBookPage() {
  const s = useStore();
  const [name, setName] = useState("");
  const [premise, setPremise] = useState("");
  const [clock, setClock] = useState("第一天 20:00");
  const [minute, setMinute] = useState("0");
  const [tick, setTick] = useState("1");
  const [format, setFormat] = useState("day_clock");
  const [err, setErr] = useState("");
  const dup = s.books.books.includes(name.trim());
  return (
    <div className="page">
      <h1>新建书</h1>
      <div className="field">
        <label>书名 <input data-testid="nb-name" value={name} onChange={(e) => { setName(e.target.value); setErr(""); }} /></label>
        {dup && (
          <p className="err">
            这个名字已经有一本
            <button type="button" onClick={() => s.openBook(name.trim())}>打开那一本</button>
          </p>
        )}
      </div>
      <div className="field">
        <label>一句主脑 <input data-testid="nb-premise" value={premise} onChange={(e) => setPremise(e.target.value)} /></label>
      </div>
      <div className="field">
        <label>故事时间起点 <input data-testid="nb-clock" value={clock} onChange={(e) => setClock(e.target.value)} /></label>
        <label>起点对应分钟 <input data-testid="nb-minute" value={minute} onChange={(e) => setMinute(e.target.value)} /></label>
        <label>一格多少分钟 <input data-testid="nb-tick" value={tick} onChange={(e) => setTick(e.target.value)} /></label>
        <label>显示格式
          <select data-testid="nb-format" value={format} onChange={(e) => setFormat(e.target.value)}>
            <option value="day_clock">第几天几点</option>
            <option value="label">只显示标签</option>
            <option value="minutes">显示分钟数</option>
          </select>
        </label>
      </div>
      {err && <p className="err">{err}</p>}
      <button
        className="primary"
        type="button"
        data-testid="nb-create"
        disabled={!name.trim() || dup}
        onClick={() => {
          s.createBook(name.trim(), {
            premise,
            clock,
            minute: Number(minute) || 0,
            tick: Number(tick) || 1,
            format,
          }).catch((e: Error) => setErr(e.message || "建失败，表单还在"));
        }}
      >建这本书</button>
      <button type="button" onClick={s.goShelf}>取消</button>
    </div>
  );
}
