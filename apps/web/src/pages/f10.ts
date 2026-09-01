/** 档案 F10：界面中文，代码键英文。以完整方案 5.5 为准。 */

export const KIND_LABEL: Record<string, string> = {
  person: "人物",
  place: "地点",
  thing: "道具",
  faction: "组织",
  rule: "规则",
  promise: "伏笔",
};

export type F10Key = { key: string; label: string; always?: boolean };

export const F10: Record<string, F10Key[]> = {
  person: [
    { key: "setup", label: "小传" },
    { key: "aliases", label: "别称" },
    { key: "role", label: "身份" },
    { key: "appearance", label: "外观" },
    { key: "voice", label: "说话方式", always: true },
    { key: "desire", label: "欲望", always: true },
    { key: "need", label: "深层需要" },
    { key: "wound", label: "创伤" },
    { key: "fear", label: "恐惧" },
    { key: "secret", label: "秘密", always: true },
    { key: "limit", label: "底线" },
    { key: "contradiction", label: "矛盾" },
    { key: "ties", label: "关系摘要" },
    { key: "capability", label: "能力与限制" },
  ],
  place: [
    { key: "setup", label: "小传" },
    { key: "aliases", label: "别称" },
    { key: "place_kind", label: "种类" },
    { key: "parent", label: "上级地点" },
    { key: "atmosphere", label: "氛围" },
    { key: "senses", label: "感官" },
    { key: "function", label: "功能" },
    { key: "access", label: "进出" },
  ],
  thing: [
    { key: "setup", label: "小传" },
    { key: "aliases", label: "别称" },
    { key: "appearance", label: "外形" },
    { key: "function", label: "功能" },
    { key: "owner_setup", label: "默认归属" },
    { key: "place_setup", label: "默认所在" },
    { key: "capability", label: "能力" },
    { key: "limit", label: "限制" },
    { key: "symbol", label: "象征" },
  ],
  faction: [
    { key: "setup", label: "小传" },
    { key: "aliases", label: "别称" },
    { key: "creed", label: "宗旨" },
    { key: "public_face", label: "明面" },
    { key: "private_line", label: "暗线" },
    { key: "hierarchy", label: "层级" },
    { key: "leader_setup", label: "默认首领" },
    { key: "membership_rule", label: "成员资格" },
    { key: "ties", label: "对外关系摘要" },
  ],
  rule: [
    { key: "setup", label: "小传" },
    { key: "aliases", label: "别称" },
    { key: "capability", label: "能力" },
    { key: "cost", label: "代价" },
    { key: "limit", label: "限制" },
    { key: "exception", label: "例外" },
    { key: "scope", label: "生效范围" },
    { key: "enforcement", label: "检查分级" },
  ],
  promise: [
    { key: "debt", label: "欠读者什么" },
    { key: "promise_kind", label: "种类" },
    { key: "deadline", label: "期限" },
    { key: "related", label: "关联" },
  ],
};

export function keysFor(kind: string): F10Key[] {
  return F10[kind] || F10.person;
}

export function testIdFor(key: string): string {
  if (key === "voice") return "dossier-speech";
  return `dossier-${key}`;
}
