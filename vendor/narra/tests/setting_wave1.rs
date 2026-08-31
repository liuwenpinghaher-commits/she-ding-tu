//! 波次 1：公共写入正史入口 + 算出这一刻。不是单测纯函数。

mod common;

use narra::services::canon::SettingBook;
use narra::services::ferry::{self, AFU, AHE, CITY, COL0, COL1, COL2, FERRY, GANG, KNIFE, LIAN, TOKEN};
use narra::services::world::{
    BeatDraft, Delta, KnowledgeWrite, Presence, ROLE_MENTIONED, ROLE_PRESENT, ATTR_HOLDS,
};
use std::sync::Arc;

use common::harness::TestHarness;

fn p(id: &str, role: &str) -> Presence {
    Presence {
        entity_id: id.into(),
        beat_id: String::new(),
        role: role.into(),
    }
}

fn afu_sees_knife() -> BeatDraft {
    BeatDraft {
        id: Some("b_knife".into()),
        kind: "scene".into(),
        column_id: COL0.into(),
        intent: "阿福发现刀".into(),
        value_shift: Some("刀被阿福看见".into()),
        do_text: Some("打开抽屉看见刀".into()),
        clock_from: 0,
        clock_to: 60,
        place_id: Some(FERRY.into()),
        presences: vec![p(AFU, ROLE_PRESENT), p(LIAN, ROLE_MENTIONED)],
        knowledge_writes: vec![KnowledgeWrite {
            person_id: AFU.into(),
            fact: "刀在抽屉".into(),
        }],
        deltas: vec![Delta {
            entity_id: KNIFE.into(),
            attr: "holder".into(),
            value: AFU.into(),
            clock_from: 0,
            clock_to: None,
        }],
        ..BeatDraft::default()
    }
}

async fn book() -> (TestHarness, SettingBook) {
    let harness = TestHarness::new().await;
    let book = SettingBook::new(Arc::clone(&harness.db));
    ferry::seed_cast(&book).await.expect("seed");
    (harness, book)
}

#[tokio::test]
async fn s1_1_draft_not_in_world_at() {
    let (_h, book) = book().await;
    let draft = afu_sees_knife();
    // 草稿只在内存，不调用 commit
    let world = book.world_at(10, None).await.expect("world_at");
    assert!(world.playing.is_empty());
    assert!(!world
        .knows
        .get(AFU)
        .map(|k| k.iter().any(|f| f.contains("刀在抽屉")))
        .unwrap_or(false));
    let _ = draft;
}

#[tokio::test]
async fn s1_2_commit_then_world_at_sees_and_seq() {
    let (_h, book) = book().await;
    let b1 = book.commit(afu_sees_knife()).await.expect("commit 1");
    assert_eq!(b1.commit_seq, 1);
    let world = book.world_at(10, None).await.expect("world_at");
    assert!(world.playing.contains(&"b_knife".into()), "{:?}", world.playing);
    assert!(
        world
            .knows
            .get(AFU)
            .map(|k| k.iter().any(|f| f.contains("刀在抽屉")))
            .unwrap_or(false),
        "阿福应知道刀在抽屉 {:?}",
        world.knows
    );

    let mut d2 = BeatDraft {
        id: Some("b_lian".into()),
        kind: "scene".into(),
        column_id: COL1.into(),
        intent: "阿莲来找东西".into(),
        value_shift: Some("阿莲进渡口".into()),
        do_text: Some("走进渡口".into()),
        clock_from: 60,
        clock_to: 120,
        place_id: Some(FERRY.into()),
        presences: vec![p(LIAN, ROLE_PRESENT)],
        ..BeatDraft::default()
    };
    let b2 = book.commit(d2.clone()).await.expect("commit 2");
    assert_eq!(b2.commit_seq, 2);

    let only_first = book.world_at(10, Some(1)).await.expect("as_of 1");
    assert!(
        !only_first.playing.contains(&"b_lian".into()),
        "只算到第一场不应看见阿莲 {:?}",
        only_first.playing
    );
    let _ = d2;
    let _ = ATTR_HOLDS;
}

#[tokio::test]
async fn s1_3_relate_fail_rolls_back() {
    let (_h, book) = book().await;
    let mut d = afu_sees_knife();
    d.id = Some("b_fail".into());
    d.fail_relate = true;
    let err = book.commit(d).await;
    assert!(err.is_err(), "RELATE 失败应返回错误");
    let world = book.world_at(10, None).await.expect("world_at");
    assert!(
        !world.playing.contains(&"b_fail".into()),
        "回滚后不应有正史场 {:?}",
        world.playing
    );
    assert_eq!(book.max_commit_seq().await.unwrap_or(0), 0);
}

#[tokio::test]
async fn s1_4_mentioned_is_not_witness() {
    let (_h, book) = book().await;
    book.commit(afu_sees_knife()).await.expect("commit");
    let world = book.world_at(10, None).await.expect("world_at");
    let lian_knows = world.knows.get(LIAN).cloned().unwrap_or_default();
    assert!(
        !lian_knows.iter().any(|f| f.contains("刀在抽屉") || f.contains("打开抽屉")),
        "被提及的阿莲不应目击 {:?}",
        lian_knows
    );
    assert!(
        world
            .edges
            .iter()
            .any(|e| e.entity_id == LIAN && e.role == ROLE_MENTIONED)
    );
}

#[tokio::test]
async fn s1_5_parallel_ok_same_person_two_places_blocked() {
    let (_h, book) = book().await;
    book.commit(afu_sees_knife()).await.expect("afu");
    let lian_city = BeatDraft {
        id: Some("b_city".into()),
        kind: "scene".into(),
        column_id: COL0.into(),
        intent: "阿莲在城里".into(),
        value_shift: Some("城里同时".into()),
        do_text: Some("走过街口".into()),
        clock_from: 0,
        clock_to: 60,
        place_id: Some(CITY.into()),
        presences: vec![p(LIAN, ROLE_PRESENT)],
        ..BeatDraft::default()
    };
    book.commit(lian_city).await.expect("parallel");

    let afu_city = BeatDraft {
        id: Some("b_afu_city".into()),
        kind: "scene".into(),
        column_id: COL0.into(),
        intent: "阿福也在城里".into(),
        value_shift: Some("错".into()),
        do_text: Some("出现在城里".into()),
        clock_from: 0,
        clock_to: 60,
        place_id: Some(CITY.into()),
        presences: vec![p(AFU, ROLE_PRESENT)],
        ..BeatDraft::default()
    };
    let err = book.commit(afu_city).await;
    assert!(err.is_err(), "同人两地应挡: {:?}", err.err());
}

#[tokio::test]
async fn s1_6_ellipsis_does_not_default_knowledge() {
    let (_h, book) = book().await;
    book.commit(afu_sees_knife()).await.unwrap();
    let ell = BeatDraft {
        id: Some("b_ell".into()),
        kind: "ellipsis".into(),
        column_id: COL1.into(),
        intent: "阿莲走到渡口".into(),
        clock_from: 60,
        clock_to: 120,
        place_id: Some(FERRY.into()),
        presences: vec![p(LIAN, ROLE_PRESENT)],
        ..BeatDraft::default()
    };
    book.commit(ell).await.unwrap();
    let w = book.world_at(90, None).await.unwrap();
    assert_eq!(w.r#where.get(LIAN).map(String::as_str), Some(FERRY));
    let lk = w.knows.get(LIAN).cloned().unwrap_or_default();
    assert!(
        !lk.iter().any(|f| f.contains("刀在抽屉") || f.contains("打开抽屉")),
        "省略场不得默认补知情 {lk:?}"
    );
}

#[tokio::test]
async fn s1_7_late_fact_projects_without_changing_old_dialogue() {
    let (_h, book) = book().await;
    book.commit(afu_sees_knife()).await.unwrap();
    let mut late = BeatDraft {
        id: Some("b_late".into()),
        kind: "scene".into(),
        column_id: COL2.into(),
        intent: "晚到：刀一直在".into(),
        value_shift: Some("补刀的位置".into()),
        do_text: Some("对账".into()),
        clock_from: 120,
        clock_to: 180,
        place_id: Some(FERRY.into()),
        presences: vec![p(AHE, ROLE_PRESENT)],
        deltas: vec![Delta {
            entity_id: KNIFE.into(),
            attr: "in_drawer".into(),
            value: "true".into(),
            clock_from: 0,
            clock_to: None,
        }],
        ..BeatDraft::default()
    };
    let b = book.commit(late).await.unwrap();
    assert!(b.commit_seq >= 2);
    let at_col0 = book.world_at(10, None).await.unwrap();
    assert!(at_col0.states.iter().any(|s| s.attr == "in_drawer" && s.value == "true"));
    let canon = book.load_canon().await.unwrap();
    let first = canon.beats.iter().find(|x| x.id == "b_knife").unwrap();
    assert_eq!(first.do_text.as_deref(), Some("打开抽屉看见刀"));
}

#[tokio::test]
async fn s1_8_supersede_hides_beat_keeps_seq() {
    let (_h, book) = book().await;
    book.commit(afu_sees_knife()).await.unwrap();
    let mut d2 = BeatDraft {
        id: Some("b2".into()),
        kind: "scene".into(),
        column_id: COL1.into(),
        intent: "阿莲来找".into(),
        value_shift: Some("来了".into()),
        do_text: Some("进门".into()),
        clock_from: 60,
        clock_to: 120,
        place_id: Some(FERRY.into()),
        presences: vec![p(LIAN, ROLE_PRESENT)],
        ..BeatDraft::default()
    };
    let b2 = book.commit(d2).await.unwrap();
    assert_eq!(b2.commit_seq, 2);
    book.supersede("b_knife").await.unwrap();
    let w = book.world_at(10, None).await.unwrap();
    assert!(!w.playing.contains(&"b_knife".into()));
    assert!(
        !w.knows
            .get(AFU)
            .map(|k| k.iter().any(|f| f.contains("刀在抽屉")))
            .unwrap_or(false),
        "删历史后这一刻不该还看见刀在抽屉：{:?}",
        w.knows
    );
    assert!(
        !w.states
            .iter()
            .any(|s| s.entity_id == KNIFE && s.source_beat == "b_knife"),
        "删历史后刀的情状窗口应随这场一起没了"
    );
    let canon = book.load_canon().await.unwrap();
    let s = canon.beats.iter().find(|b| b.id == "b_knife").unwrap();
    assert_eq!(s.status, "superseded");
    assert_eq!(s.commit_seq, 1);
    let b2b = canon.beats.iter().find(|b| b.id == "b2").unwrap();
    assert_eq!(b2b.commit_seq, 2);
}

#[tokio::test]
async fn s1_9_circumstances_omit_suggestion_and_rank_deadline() {
    use narra::services::world::Promise;
    let (_h, book) = book().await;
    book.commit(afu_sees_knife()).await.unwrap();
    book.upsert_promise(&Promise {
        id: "token_due".into(),
        name: "铜牌三日".into(),
        status: "open".into(),
        related: vec![FERRY.into(), LIAN.into()],
        plant_clock: Some(0),
        deadline_clock: Some(10),
        red_herring: false,
    })
    .await
    .unwrap();
    book.upsert_promise(&Promise {
        id: "idle".into(),
        name: "闲笔".into(),
        status: "open".into(),
        related: vec![FERRY.into()],
        plant_clock: Some(50),
        deadline_clock: Some(9999),
        red_herring: false,
    })
    .await
    .unwrap();
    let draft = BeatDraft {
        intent: "阿莲来找东西".into(),
        column_id: COL1.into(),
        clock_from: 60,
        clock_to: 120,
        place_id: Some(FERRY.into()),
        presences: vec![p(LIAN, ROLE_PRESENT)],
        ..BeatDraft::default()
    };
    let pkt = book.given_circumstances(&draft).await.unwrap();
    assert_eq!(pkt.intent, "阿莲来找东西");
    assert!(pkt.open_promises.len() <= 5);
    assert_eq!(pkt.open_promises[0].id, "token_due");
    let json = serde_json::to_string(&pkt).unwrap();
    assert!(!json.contains("建议一件"));
    assert!(!json.contains("promise_suggestion"));
    let _ = TOKEN;
}

#[tokio::test]
async fn s1_10_preview_does_not_mutate() {
    let (_h, book) = book().await;
    book.commit(afu_sees_knife()).await.unwrap();
    let before = book.load_canon().await.unwrap();
    let overlapping = vec![
        narra::services::world::Column {
            id: COL0.into(),
            clock_from: 0,
            clock_to: 80,
            display_ord: 0,
        },
        narra::services::world::Column {
            id: COL1.into(),
            clock_from: 60,
            clock_to: 120,
            display_ord: 1,
        },
    ];
    assert!(SettingBook::preview_columns(&overlapping).is_err());
    let after = book.load_canon().await.unwrap();
    assert_eq!(before.columns[0].clock_to, after.columns[0].clock_to);
}

#[tokio::test]
async fn s1_11_full_equals_cached() {
    let (_h, book) = book().await;
    book.commit(afu_sees_knife()).await.unwrap();
    let full = book.world_at_full(10, None).await.unwrap();
    let cached = book.world_at(10, None).await.unwrap();
    assert_eq!(full.playing, cached.playing);
    assert_eq!(full.knows.get(AFU), cached.knows.get(AFU));
}

#[tokio::test]
async fn s1_12_stale_materialize_dropped_after_supersede() {
    let (_h, book) = book().await;
    book.commit(afu_sees_knife()).await.unwrap();
    let _ = book.world_at(10, None).await.unwrap();
    book.supersede("b_knife").await.unwrap();
    let w = book.world_at(10, None).await.unwrap();
    assert!(!w.playing.contains(&"b_knife".into()));
}

#[tokio::test]
async fn s1_13_two_books_do_not_leak() {
    let h1 = TestHarness::new().await;
    let h2 = TestHarness::new().await;
    let a = SettingBook::new(Arc::clone(&h1.db));
    let b = SettingBook::new(Arc::clone(&h2.db));
    ferry::seed_cast(&a).await.unwrap();
    a.commit(afu_sees_knife()).await.unwrap();
    let wb = b.world_at(10, None).await.unwrap();
    assert!(wb.nodes.iter().all(|n| n.id != AFU));
    assert!(wb.playing.is_empty());
}

#[tokio::test]
async fn s1_14_confirm_rejects_overlap_accepts_shift() {
    let (_h, book) = book().await;
    let bad = vec![
        narra::services::world::Column {
            id: COL0.into(),
            clock_from: 0,
            clock_to: 80,
            display_ord: 0,
        },
        narra::services::world::Column {
            id: COL1.into(),
            clock_from: 60,
            clock_to: 120,
            display_ord: 1,
        },
    ];
    assert!(book.confirm_columns(bad).await.is_err());
    let ok = vec![
        narra::services::world::Column {
            id: COL0.into(),
            clock_from: 0,
            clock_to: 50,
            display_ord: 0,
        },
        narra::services::world::Column {
            id: COL1.into(),
            clock_from: 50,
            clock_to: 120,
            display_ord: 1,
        },
    ];
    book.confirm_columns(ok).await.unwrap();
    let c = book.load_canon().await.unwrap();
    assert_eq!(c.columns.iter().find(|x| x.id == COL0).unwrap().clock_to, 50);
}

#[tokio::test]
async fn s1_15_constrain_grades() {
    let (_h, book) = book().await;
    book.commit(afu_sees_knife()).await.unwrap();
    let empty_intent = BeatDraft {
        id: Some("x".into()),
        kind: "scene".into(),
        column_id: COL1.into(),
        intent: "".into(),
        do_text: Some("走".into()),
        clock_from: 60,
        clock_to: 120,
        place_id: Some(FERRY.into()),
        presences: vec![p(LIAN, ROLE_PRESENT)],
        ..BeatDraft::default()
    };
    assert!(book.commit(empty_intent).await.is_err());

    let leak = BeatDraft {
        id: Some("leak".into()),
        kind: "scene".into(),
        column_id: COL1.into(),
        intent: "阿莲说出刀".into(),
        value_shift: Some("说漏".into()),
        say_text: Some("刀在抽屉".into()),
        clock_from: 60,
        clock_to: 120,
        place_id: Some(FERRY.into()),
        presences: vec![p(LIAN, ROLE_PRESENT)],
        ..BeatDraft::default()
    };
    let report = book.constrain_draft(&leak).await.unwrap();
    assert!(report.findings.iter().any(|f| f.code == "knowledge_leak"));
    assert!(!report.blocks());
    book.commit(leak).await.expect("标黄仍可写");

    let empty_scene = BeatDraft {
        id: Some("empty".into()),
        kind: "scene".into(),
        column_id: COL1.into(),
        intent: "空场面".into(),
        clock_from: 60,
        clock_to: 120,
        place_id: Some(FERRY.into()),
        presences: vec![p(AHE, ROLE_PRESENT)],
        ..BeatDraft::default()
    };
    assert!(book.commit(empty_scene).await.is_err());
}

#[tokio::test]
async fn s1_16_item_handoff() {
    let (_h, book) = book().await;
    let mut first = afu_sees_knife();
    first.deltas = vec![Delta {
        entity_id: KNIFE.into(),
        attr: "holder".into(),
        value: AHE.into(),
        clock_from: 0,
        clock_to: None,
    }];
    book.commit(first).await.unwrap();
    let hand = BeatDraft {
        id: Some("hand".into()),
        kind: "scene".into(),
        column_id: COL1.into(),
        intent: "刀易手给阿福".into(),
        value_shift: Some("易手".into()),
        do_text: Some("把刀递给阿福".into()),
        clock_from: 60,
        clock_to: 120,
        place_id: Some(FERRY.into()),
        presences: vec![p(AHE, ROLE_PRESENT), p(AFU, ROLE_PRESENT)],
        deltas: vec![Delta {
            entity_id: KNIFE.into(),
            attr: "holder".into(),
            value: AFU.into(),
            clock_from: 60,
            clock_to: None,
        }],
        ..BeatDraft::default()
    };
    let draft_world = book.world_at(70, None).await.unwrap();
    assert!(
        draft_world
            .states
            .iter()
            .any(|s| s.entity_id == KNIFE && s.attr == "holder" && s.value == AHE)
    );
    book.commit(hand).await.unwrap();
    let after = book.world_at(70, None).await.unwrap();
    assert!(after
        .states
        .iter()
        .any(|s| s.entity_id == KNIFE && s.value == AFU));
    assert!(!after
        .states
        .iter()
        .any(|s| s.entity_id == KNIFE && s.attr == "holder" && s.value == AHE && s.clock_to.is_none()));
}

#[tokio::test]
async fn s1_17_faction_join_needs_beat() {
    let (_h, book) = book().await;
    let w0 = book.world_at(0, None).await.unwrap();
    assert!(!w0.states.iter().any(|s| s.attr == "member" && s.value == GANG));
    let join = BeatDraft {
        id: Some("join".into()),
        kind: "scene".into(),
        column_id: COL0.into(),
        intent: "阿福入伙".into(),
        value_shift: Some("入伙".into()),
        do_text: Some("拜码头".into()),
        clock_from: 0,
        clock_to: 60,
        place_id: Some(FERRY.into()),
        presences: vec![p(AFU, ROLE_PRESENT)],
        deltas: vec![Delta {
            entity_id: AFU.into(),
            attr: "member".into(),
            value: GANG.into(),
            clock_from: 0,
            clock_to: None,
        }],
        ..BeatDraft::default()
    };
    book.commit(join).await.unwrap();
    let w = book.world_at(10, None).await.unwrap();
    assert!(w.states.iter().any(|s| s.entity_id == AFU && s.value == GANG));
}

#[tokio::test]
async fn s1_18_rule_is_not_presence() {
    let (_h, book) = book().await;
    let canon = book.load_canon().await.unwrap();
    assert!(canon.entities.iter().any(|e| e.id == "night_rule" && e.kind == "rule"));
    let d = BeatDraft {
        id: Some("rulebeat".into()),
        kind: "scene".into(),
        column_id: COL0.into(),
        intent: "建场".into(),
        value_shift: Some("有场".into()),
        do_text: Some("靠岸".into()),
        clock_from: 0,
        clock_to: 60,
        place_id: Some(FERRY.into()),
        presences: vec![p(AFU, ROLE_PRESENT), p("night_rule", ROLE_PRESENT)],
        ..BeatDraft::default()
    };
    // 规则当在场：仍可写边，但算出 covering 不应把 rule 当人物目击；这里断言 kind=rule 实体存在且无戏可建。
    assert!(book.commit(d).await.is_err(), "规则不当在场");
    let w = book.world_at(0, None).await.unwrap();
    assert!(w.nodes.iter().any(|n| n.kind == "rule"));
}

#[tokio::test]
async fn s1_19_revise_keeps_commit_seq() {
    let (_h, book) = book().await;
    book.commit(afu_sees_knife()).await.unwrap();
    book.revise_delta(
        "b_knife",
        vec![Delta {
            entity_id: KNIFE.into(),
            attr: "holder".into(),
            value: AHE.into(),
            clock_from: 0,
            clock_to: None,
        }],
    )
    .await
    .unwrap();
    let c = book.load_canon().await.unwrap();
    let b = c.beats.iter().find(|x| x.id == "b_knife").unwrap();
    assert_eq!(b.commit_seq, 1);
    assert_eq!(b.do_text.as_deref(), Some("打开抽屉看见刀"));
}

#[tokio::test]
async fn s1_20_knows_at_matches_world() {
    let (_h, book) = book().await;
    book.commit(afu_sees_knife()).await.unwrap();
    let w = book.world_at(10, None).await.unwrap();
    let k = book.knows_at(10, AFU, None).await.unwrap();
    assert_eq!(k, w.knows.get(AFU).cloned().unwrap_or_default());
}

fn scene(id: &str, col: &str, intent: &str, from: i64, to: i64) -> BeatDraft {
    BeatDraft {
        id: Some(id.into()),
        kind: "scene".into(),
        column_id: col.into(),
        intent: intent.into(),
        value_shift: Some("转".into()),
        do_text: Some("走一步".into()),
        clock_from: from,
        clock_to: to,
        place_id: Some(FERRY.into()),
        presences: vec![p(AFU, ROLE_PRESENT)],
        ..BeatDraft::default()
    }
}

#[tokio::test]
async fn s_promise_illegal_jumps_blocked() {
    use narra::services::world::{Promise, PromiseOp};
    let (_h, book) = book().await;
    book.upsert_promise(&Promise {
        id: "token_due".into(),
        name: "铜牌三日".into(),
        status: "open".into(),
        related: vec![TOKEN.into()],
        plant_clock: Some(0),
        deadline_clock: Some(180),
        red_herring: false,
    })
    .await
    .unwrap();

    let mut never = scene("pay_none", COL0, "凭空兑现", 0, 60);
    never.promise_ops = vec![PromiseOp {
        promise_id: "ghost".into(),
        op: "payoff".into(),
    }];
    let r = book.constrain_draft(&never).await.unwrap();
    assert!(r.blocks());
    assert!(r.findings.iter().any(|f| f.code == "promise_payoff"));
    assert!(book.commit(never).await.is_err());

    let mut pay = scene("pay_ok", COL0, "兑现铜牌", 0, 60);
    pay.promise_ops = vec![PromiseOp {
        promise_id: "token_due".into(),
        op: "payoff".into(),
    }];
    book.commit(pay).await.expect("未收可以兑现");

    let mut replant = scene("replant", COL1, "再埋", 60, 120);
    replant.promise_ops = vec![PromiseOp {
        promise_id: "token_due".into(),
        op: "plant".into(),
    }];
    let r2 = book.constrain_draft(&replant).await.unwrap();
    assert!(r2.blocks());
    assert!(r2.findings.iter().any(|f| f.code == "promise_replant"));
    assert!(book.commit(replant).await.is_err());
}

