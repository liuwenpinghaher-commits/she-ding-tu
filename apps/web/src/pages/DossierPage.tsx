import { useState } from "react";
import { useStore } from "../state/store";

const PERSON = [
  ["setup", "小传"], ["aliases", "别称"], ["role", "身份"], ["appearance", "外观"],
  ["voice", "说话方式"], ["desire", "欲望"], ["need", "深层需要"], ["wound", "创伤"],
  ["fear", "恐惧"], ["secret", "秘密"], ["limit", "底线"], ["contradiction", "矛盾"],
  ["ties", "关系摘要"], ["capability", "能力与限制"],
];

export function DossierPage() {
  const s = useStore();
  const [fields, setFields] = useState<Record<string, string>>({});
  const [relKind, setRelKind] = useState("member");
  const [relTarget, setRelTarget] = useState("");
  if (!s.dossierOpen) return null;
  return (
    <div className="dialog-back">
      <div className="dialog" data-testid="dossier">
        <h2>{s.dossierName}</h2>
        <p className="muted">改这一场去分场条。不能在档案写入正史。</p>
        {PERSON.map(([k, lab]) => (
          <label key={k}>{lab}
            <input
              data-testid={`dossier-${k === "voice" ? "speech" : k}`}
              value={fields[k] || ""}
              onChange={(e) => setFields({ ...fields, [k]: e.target.value })}
            />
          </label>
        ))}
        <button data-testid="dossier-save" type="button" onClick={() => s.saveDossier({
          ...fields,
          speech: fields.voice || fields.speech || "",
          desire: fields.desire || "",
          secret: fields.secret || "",
        })}>存</button>
        <div>
          <select data-testid="rel-kind" value={relKind} onChange={(e) => setRelKind(e.target.value)}>
            <option value="related">和…有关系</option>
            <option value="member">属于</option>
            <option value="holds">拿着</option>
            <option value="contains">在…之内</option>
          </select>
          <input data-testid="rel-target" value={relTarget} onChange={(e) => setRelTarget(e.target.value)} />
          <button data-testid="rel-add" type="button" onClick={() => s.addRel(relKind, relTarget)}>加一条关系</button>
        </div>
        <div data-testid="dossier-rels">{s.dossierRels.map((r) => <div key={r.id}>{r.from} {r.kind} {r.to}</div>)}</div>
        <button data-testid="dossier-close" type="button" onClick={() => s.setDossierOpen(false)}>关闭</button>
      </div>
    </div>
  );
}
