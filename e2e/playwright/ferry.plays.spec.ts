import { test, expect, Page } from "@playwright/test";

test("渡口六条戏能在分场条上点出来", async ({ page }) => {
  test.setTimeout(180000);
  const book = "渡口戏-" + Date.now();
  await page.goto("/");
  await page.getByTestId("book-name").fill(book);
  await page.getByTestId("create-book").click();
  await expect(page.getByTestId("book-label")).toHaveText(book);

  await addEntity(page, "person", "阿福");
  await addEntity(page, "person", "阿莲");
  await addEntity(page, "person", "阿禾");
  await addEntity(page, "place", "渡口");
  await addEntity(page, "place", "城里");
  await addEntity(page, "thing", "刀");
  await addEntity(page, "thing", "铜牌");

  await page.getByTestId("place-id").fill("渡口");
  await commitScene(page, {
    intent: "有人把刀放进抽屉",
    people: ["阿福"],
    doText: "把刀推进抽屉",
    shift: "刀入屉",
    deltas: [{ entity_id: "刀", attr: "place", value: "抽屉" }],
  });
  const putId = await lastCanonId(page);

  await page.getByTestId("density-mid").click();
  await expect(page.getByTestId("col-count")).toHaveText("4");

  await commitScene(page, {
    intent: "阿福发现刀",
    people: ["阿福"],
    doText: "阿福打开抽屉看见刀",
    shift: "刀被阿福看见",
    cause: putId,
    knows: [{ person_id: "阿福", fact: "刀在抽屉", certainty: "knows" }],
    deltas: [{ entity_id: "刀", attr: "holder", value: "阿福" }],
  });

  await commitScene(page, {
    intent: "阿福把刀藏进仓",
    people: ["阿福"],
    doText: "阿福把刀藏进仓",
    shift: "刀入仓",
    deltas: [{ entity_id: "刀", attr: "place", value: "仓" }],
  });

  // 1. 阿莲以为铜牌在柜面；读者知道刀在仓；阿福撒谎
  await page.getByTestId("intent").fill("阿莲翻柜面");
  await page.getByTestId("place-id").fill("渡口");
  await page.getByTestId("write-next").click();
  await page.locator(".card.draft").first().waitFor();
  await page.locator('[data-testid="ent-阿福"]').dragTo(page.locator(".card.draft").first());
  await page.locator('[data-testid="ent-阿莲"]').dragTo(page.locator(".card.draft").first());
  await page.getByTestId("do-text").fill("阿莲翻柜面，翻不到铜牌");
  await page.getByTestId("say-text").fill("阿福：没看见。");
  await page.getByTestId("think-text").fill("阿莲：铜牌该在柜面。");
  await page.getByTestId("value-shift").fill("以为有→没有");
  await page.getByTestId("know-who").fill("阿莲");
  await page.getByTestId("know-fact").fill("铜牌在柜面");
  await page.getByTestId("know-cert").selectOption("wrong");
  await page.getByTestId("know-truth").fill("铜牌仍不知所终");
  await page.getByTestId("add-know").click();
  const sit1 = await page.evaluate(async () => await (await fetch("/api/circumstances")).json());
  const pkt1 = sit1.packet || sit1;
  expect(JSON.stringify(pkt1.reader_irony || []) + JSON.stringify(pkt1.reader_knows || [])).toMatch(/刀|仓/);
  const commit1 = page.waitForResponse((r) => r.url().includes("/api/commit") && r.request().method() === "POST");
  await page.getByTestId("commit").click();
  const body1 = await (await commit1).json();
  expect((body1.warnings || []).join("；")).toContain("撒谎");
  await page.getByTestId("intent").fill("阿莲还在翻");
  await page.getByTestId("place-id").fill("渡口");
  await page.getByTestId("write-next").click();
  await page.locator(".card.draft").first().waitFor();
  await page.locator('[data-testid="ent-阿莲"]').dragTo(page.locator(".card.draft").first());
  const sit1b = await page.evaluate(async () => await (await fetch("/api/circumstances")).json());
  const pkt1b = sit1b.packet || sit1b;
  expect(JSON.stringify(pkt1b.wrong_beliefs || [])).toMatch(/铜牌在柜面/);
  await page.evaluate(async () => {
    const st = await (await fetch("/api/state")).json();
    for (const d of st.drafts || []) {
      await fetch("/api/delete-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: d.id, confirm: true }),
      });
    }
  });

  // 2. 阿禾在城里等到铜牌三日将尽；细条欠账色
  await commitScene(page, {
    intent: "阿禾在城里等到铜牌三日将尽",
    people: ["阿禾"],
    place: "城里",
    doText: "阿禾在城里干等",
    shift: "期限将尽",
  });
  await page.evaluate(async () => {
    const st = await (await fetch("/api/state")).json();
    const last = (st.committed || []).slice(-1)[0];
    await fetch("/api/promises", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: "token_due",
        name: "铜牌三日",
        related: ["阿禾", "铜牌", "阿莲"],
        deadline_clock: last.clock_from,
        plant_clock: 0,
      }),
    });
  });
  await page.reload();
  await expect(page.getByTestId("book-label")).toHaveText(book);
  await expect(page.locator(".tooth.debt").first()).toBeVisible();

  // 3. 删「把刀放进抽屉」，列出阿福发现刀的因果缺口
  await page.evaluate(async (id) => {
    await fetch("/api/select", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ canon_id: id }),
    });
  }, putId);
  await page.reload();
  await expect(page.getByTestId("book-label")).toHaveText(book);
  const st = await page.evaluate(async () => (await (await fetch("/api/state")).json()));
  const putBeat = (st.committed || []).find((b: { id: string }) => b.id === putId);
  expect(putBeat).toBeTruthy();
  await page.evaluate(async (id) => {
    await fetch("/api/delete-canon", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
  }, putId);
  await page.reload();
  await expect(page.getByTestId("confirm-change")).toBeVisible();
  await expect(page.getByTestId("impact-list")).toContainText("因果缺口");
  await expect(page.getByTestId("impact-list")).toContainText("阿福发现刀");
  await page.getByTestId("suggest-leave_hole").click();
  await page.getByTestId("confirm-ok").click();
  await expect(page.getByTestId("confirm-change")).toBeHidden({ timeout: 15000 });

  // 4. 阿莲被阿福告知「铜牌在城里」（谎）
  await commitScene(page, {
    intent: "阿福谎称铜牌在城里",
    people: ["阿福", "阿莲"],
    doText: "阿福把阿莲支去城里",
    sayText: "铜牌在城里。",
    shift: "阿莲信错",
    knows: [
      {
        person_id: "阿莲",
        fact: "铜牌在城里",
        certainty: "wrong",
        truth_value: "铜牌仍不知所终",
        method: "told",
        source_person: "阿福",
      },
    ],
  });
  await page.locator(".card.canon").last().click();
  const sit4 = await page.evaluate(async () => {
    const st = await (await fetch("/api/state")).json();
    const last = (st.committed || []).slice(-1)[0];
    await fetch("/api/select", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ canon_id: last.id, column_id: last.column_id }),
    });
    await fetch("/api/write-next", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ intent: "阿莲按谎去翻", place_id: "渡口" }),
    });
    const st2 = await (await fetch("/api/state")).json();
    const draft = (st2.drafts || [])[0];
    if (draft) {
      await fetch("/api/presence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draft_id: draft.id, entity_id: "阿莲", action: "add" }),
      });
      await fetch("/api/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draft_id: draft.id, column_id: draft.draft.column_id }),
      });
    }
    return await (await fetch("/api/circumstances")).json();
  });
  const pkt4 = sit4.packet || sit4;
  expect(JSON.stringify(pkt4.wrong_beliefs || [])).toMatch(/铜牌在城里/);

  // 5. 人物透镜看阿莲：人物账不知刀在仓；世界上刀仍在；仍能写「阿莲来找刀」
  await page.getByTestId("person-lens").selectOption("阿莲");
  await page.waitForTimeout(200);
  const lens = await page.evaluate(async () => {
    const sit = await (await fetch("/api/circumstances")).json();
    const world = await (await fetch("/api/world?t=10")).json();
    return { sit, world };
  });
  const gaps = JSON.stringify((lens.sit.packet || lens.sit).knowledge_gaps || []);
  expect(gaps).toMatch(/阿莲 不知道/);
  expect(JSON.stringify(lens.world)).toMatch(/仓|刀/);
  expect(JSON.stringify(lens.world)).not.toContain("premise");
  await page.getByTestId("intent").fill("阿莲来找刀");
  await expect(page.getByTestId("write-next")).toBeEnabled();

  // 6. 官方只读能列出已正史场；POST 官方表被拒，不当写入正史
  const bridge = await page.evaluate(async () => await (await fetch("/api/bridge")).json());
  expect(JSON.stringify(bridge.scenes || [])).toMatch(/阿福发现刀|阿莲翻柜面/);
  const refuse = await page.evaluate(async () => {
    const r = await fetch("/api/bridge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ intent: "官方CLI冒充" }),
    });
    return { status: r.status, text: await r.text() };
  });
  expect(refuse.status).toBeGreaterThanOrEqual(400);
  expect(refuse.text).toContain("不能冒充写入正史");
  const after = await page.evaluate(async () => (await (await fetch("/api/state")).json()));
  expect((after.committed || []).some((b: { intent: string }) => b.intent.includes("官方CLI"))).toBeFalsy();
});

async function addEntity(page: Page, kind: string, name: string) {
  await page.getByTestId("ent-kind").selectOption(kind);
  await page.getByTestId("ent-name").fill(name);
  await page.getByTestId("new-entity").click();
  await expect(page.getByTestId("ent-" + name)).toBeVisible();
}

async function lastCanonId(page: Page): Promise<string> {
  const st = await page.evaluate(async () => (await (await fetch("/api/state")).json()));
  const committed = st.committed || [];
  expect(committed.length).toBeGreaterThan(0);
  return committed[committed.length - 1].id;
}

async function commitScene(
  page: Page,
  opts: {
    intent: string;
    people: string[];
    doText: string;
    shift: string;
    place?: string;
    sayText?: string;
    cause?: string;
    deltas?: { entity_id: string; attr: string; value: string }[];
    knows?: Record<string, string>[];
  },
) {
  await page.getByTestId("intent").fill(opts.intent);
  await page.getByTestId("place-id").fill(opts.place || "渡口");
  await page.getByTestId("write-next").click();
  await page.locator(".card.draft").first().waitFor();
  for (const name of opts.people) {
    await page.locator(`[data-testid="ent-${name}"]`).dragTo(page.locator(".card.draft").first());
  }
  await page.getByTestId("do-text").fill(opts.doText);
  if (opts.sayText) await page.getByTestId("say-text").fill(opts.sayText);
  await page.getByTestId("value-shift").fill(opts.shift);
  if (opts.cause) await page.getByTestId("cause-beat").fill(opts.cause);
  for (const d of opts.deltas || []) {
    await page.getByTestId("delta-ent").fill(d.entity_id);
    await page.getByTestId("delta-attr").fill(d.attr);
    await page.getByTestId("delta-val").fill(d.value);
    await page.getByTestId("add-delta").click();
  }
  const r = await page.evaluate(async (opts) => {
    const st = await (await fetch("/api/state")).json();
    const d = (st.drafts || [])[0];
    if (!d) throw new Error("无草稿");
    const patch = {
      id: d.id,
      intent: opts.intent,
      do_text: opts.doText,
      say_text: opts.sayText || "",
      think_text: "",
      value_shift: opts.shift,
      place_id: opts.place || "渡口",
      deltas: (opts.deltas || []).map((x: { entity_id: string; attr: string; value: string }) => ({
        entity_id: x.entity_id,
        attr: x.attr,
        value: x.value,
        clock_from: d.draft.clock_from,
        clock_to: null,
      })),
      knowledge_writes: opts.knows || [],
      cause_beat: opts.cause || "",
    };
    const p = await fetch("/api/drafts/patch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!p.ok) throw new Error(await p.text());
    const c = await fetch("/api/commit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: d.id }),
    });
    const text = await c.text();
    if (!c.ok) throw new Error(text);
    return text;
  }, opts);
  expect(r).toContain("\"ok\":true");
  await page.reload();
}
