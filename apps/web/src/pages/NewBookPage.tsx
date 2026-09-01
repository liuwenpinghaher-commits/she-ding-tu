import { useState } from "react";
import { useStore } from "../state/store";

export function NewBookPage() {
  const s = useStore();
  const [name, setName] = useState("");
  const [premise, setPremise] = useState("");
  const [clock, setClock] = useState("第一天 20:00");
  const dup = s.books.books.includes(name.trim());
  return (
    <div className="page">
      <h1>新建书</h1>
      <div className="field">
        <label>书名 <input data-testid="nb-name" value={name} onChange={(e) => setName(e.target.value)} /></label>
        {dup && <p>这个名字已经有一本 <button type="button" onClick={() => s.openBook(name.trim())}>打开那一本</button></p>}
      </div>
      <div className="field">
        <label>一句主脑 <input data-testid="nb-premise" value={premise} onChange={(e) => setPremise(e.target.value)} /></label>
      </div>
      <div className="field">
        <label>故事时间起点 <input data-testid="nb-clock" value={clock} onChange={(e) => setClock(e.target.value)} /></label>
      </div>
      <button
        className="primary"
        type="button"
        data-testid="nb-create"
        disabled={!name.trim() || dup}
        onClick={() => s.createBook(name.trim(), { premise, clock })}
      >建这本书</button>
      <button type="button" onClick={s.goShelf}>取消</button>
    </div>
  );
}
