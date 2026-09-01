//! 波次 1：公共写入正史入口 + 算出这一刻。不是单测纯函数。

mod common;

use narra::services::canon::{BeatPatch, SettingBook};
use narra::services::circumstances::{apply_person_lens, given_circumstances};
use narra::services::relations::relations_for;
use narra::services::ferry::{self, AFU, AHE, CITY, COL0, COL1, COL2, FERRY, GANG, KNIFE, LIAN, TOKEN, NIGHT_RULE};
use narra::services::constrain;
use narra::services::craft::{self, BookCraft, CraftChapter, ExportBeat};
use narra::services::world::{
    BeatDraft, BeatThread, Column, Delta, Entity, KnowledgeWrite, Presence, Promise, PromiseOp,
    ROLE_MENTIONED, ROLE_PRESENT, ATTR_HOLDS, CERT_WRONG, KIND_RULE,
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
            ..Default::default()
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
async fn story_threads_do_not_change_world_at() {
    let (_h, book) = book().await;
    let b1 = book.commit(afu_sees_knife()).await.expect("commit");
    let before = book.world_at(10, None).await.expect("world before");
    book.revise(
        &b1.id,
        BeatPatch {
            story_threads: Some(vec![BeatThread {
                id: "t_copper".into(),
                role: "推进".into(),
            }]),
            ..Default::default()
        },
    )
    .await
    .expect("贴线");
    let after = book.world_at(10, None).await.expect("world after");
    let loaded = book.load_canon().await.expect("load");
    let beat = loaded.beats.iter().find(|b| b.id == b1.id).expect("beat");
    assert_eq!(beat.story_threads.len(), 1);
    assert_eq!(beat.story_threads[0].id, "t_copper");
    assert_eq!(
        serde_json::to_string(&before).unwrap(),
        serde_json::to_string(&after).unwrap(),
        "贴线不得改变算出这一刻"
    );
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
    book.commit(afu_sees_knife()).await.unwrap();
    let pkt = book.given_circumstances(&draft).await.unwrap();
    assert_eq!(pkt.intent, "阿莲来找东西");
    assert!(pkt.open_promises.len() <= 5);
    assert_eq!(pkt.open_promises[0].id, "token_due");
    assert!(
        pkt.reader_knows.iter().any(|f| f.contains("刀在抽屉") || f.contains("holder")),
        "读者账应含刀 {0:?}",
        pkt.reader_knows
    );
    assert!(
        pkt.reader_irony.iter().any(|f| f.contains(LIAN) && f.contains("不知道")),
        "读者账应含阿莲不知道 {0:?}",
        pkt.reader_irony
    );
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

#[tokio::test]
async fn s2_dual_write_official_scene_and_alias_search() {
    let (_h, book) = book().await;
    book.commit(afu_sees_knife()).await.unwrap();
    book.sync_official().await.expect("sync official");
    book.sync_official().await.expect("sync 二次须幂等");

    #[derive(Debug, serde::Deserialize)]
    struct SceneRow {
        intent: Option<String>,
        title: Option<String>,
    }
    #[derive(Debug, serde::Deserialize)]
    struct CountRow {
        n: Option<i64>,
    }

    let mut q = book
        .db()
        .query("SELECT intent, title FROM scene")
        .await
        .expect("select scene");
    let rows: Vec<SceneRow> = q.take(0).unwrap_or_default();
    assert_eq!(rows.len(), 1, "二次回填不得复制 scene {rows:?}");
    assert!(
        rows.iter().any(|r| r
            .intent
            .as_deref()
            .or(r.title.as_deref())
            .map(|s| s.contains("刀"))
            .unwrap_or(false)),
        "官方 scene 应有发现刀 {rows:?}"
    );

    let world = book.world_at(10, None).await.expect("world_at 仍走 setting_*");
    assert!(
        world
            .states
            .iter()
            .any(|s| s.entity_id == KNIFE && s.attr == "holder" && s.value == AFU),
        "双写后算出这一刻仍须看见刀.holder=阿福 {:?}",
        world.states
    );
    assert!(
        world
            .knows
            .get(AFU)
            .map(|k| k.iter().any(|f| f.contains("刀在抽屉")))
            .unwrap_or(false),
        "双写后阿福知情不得丢 {:?}",
        world.knows
    );

    let mut kq = book
        .db()
        .query("SELECT count() AS n FROM knows GROUP ALL")
        .await
        .expect("count knows");
    let kn: Vec<CountRow> = kq.take(0).unwrap_or_default();
    assert!(
        kn.first().and_then(|r| r.n).unwrap_or(0) >= 1,
        "官方 knows 边应有阿福发现刀 {kn:?}"
    );

    let mut wq = book
        .db()
        .query("SELECT count() AS n FROM setting_window GROUP ALL")
        .await
        .expect("count window");
    let wn: Vec<CountRow> = wq.take(0).unwrap_or_default();
    assert!(
        wn.first().and_then(|r| r.n).unwrap_or(0) >= 1,
        "情状行应展开 {wn:?}"
    );

    let mut lian = book
        .load_canon()
        .await
        .unwrap()
        .entities
        .into_iter()
        .find(|e| e.id == LIAN)
        .expect("lian");
    lian.profile.insert("aliases".into(), "莲子".into());
    book.upsert_entity(&lian).await.unwrap();
    let hits = book.search_entities("莲子").await.unwrap();
    assert!(
        hits.iter().any(|e| e.id == LIAN),
        "别名应搜到阿莲 {hits:?}"
    );
}

#[tokio::test]
async fn s3_windows_and_knows_not_json_are_source() {
    let (_h, book) = book().await;
    book.commit(afu_sees_knife()).await.unwrap();
    book.db()
        .query("UPDATE setting_beat SET deltas_json = '[]', knowledge_json = '[]'")
        .await
        .expect("wipe json");
    let world = book.world_at(10, None).await.expect("world_at");
    assert!(
        world
            .states
            .iter()
            .any(|s| s.entity_id == KNIFE && s.attr == "holder" && s.value == AFU),
        "抹掉 JSON 袋后仍须从情状行折出刀.holder {:?}",
        world.states
    );
    assert!(
        world
            .knows
            .get(AFU)
            .map(|k| k.iter().any(|f| f.contains("刀在抽屉")))
            .unwrap_or(false),
        "抹掉 JSON 袋后阿福知情仍须从 knows 边来 {:?}",
        world.knows
    );
}

#[tokio::test]
async fn s3_wrong_belief_listed_and_recall_blocked() {
    let (_h, book) = book().await;
    book.commit(afu_sees_knife()).await.unwrap();
    let wrong = BeatDraft {
        id: Some("b_wrong".into()),
        kind: "scene".into(),
        column_id: COL1.into(),
        intent: "阿莲以为铜牌在柜面".into(),
        value_shift: Some("寻找→落空".into()),
        do_text: Some("翻柜面".into()),
        say_text: Some("阿莲：铜牌在柜面".into()),
        clock_from: 60,
        clock_to: 120,
        place_id: Some(FERRY.into()),
        presences: vec![p(LIAN, ROLE_PRESENT)],
        knowledge_writes: vec![KnowledgeWrite {
            person_id: LIAN.into(),
            fact: "铜牌在柜面".into(),
            certainty: CERT_WRONG.into(),
            truth_value: Some("铜牌下落不明".into()),
            ..Default::default()
        }],
        ..BeatDraft::default()
    };
    book.commit(wrong).await.unwrap();
    let draft = BeatDraft {
        intent: "阿莲再找".into(),
        column_id: COL1.into(),
        clock_from: 60,
        clock_to: 120,
        place_id: Some(FERRY.into()),
        presences: vec![p(LIAN, ROLE_PRESENT)],
        do_text: Some("再翻".into()),
        ..BeatDraft::default()
    };
    let pkt = book.given_circumstances(&draft).await.unwrap();
    assert!(
        pkt.wrong_beliefs
            .iter()
            .any(|s| s.contains("信错") && s.contains("铜牌在柜面")),
        "规定情境应列出信错 {:?}",
        pkt.wrong_beliefs
    );

    let recall = BeatDraft {
        id: Some("b_recall".into()),
        kind: "scene".into(),
        column_id: COL1.into(),
        intent: "阿莲想起刀".into(),
        value_shift: Some("发现".into()),
        think_text: Some("想起刀在抽屉".into()),
        do_text: Some("愣住".into()),
        clock_from: 60,
        clock_to: 120,
        place_id: Some(FERRY.into()),
        presences: vec![p(LIAN, ROLE_PRESENT)],
        ..BeatDraft::default()
    };
    let report = book.constrain_draft(&recall).await.unwrap();
    assert!(
        report.findings.iter().any(|f| f.code == "recall_truth" && f.grade == narra::services::constrain::Grade::Strict),
        "想起实际真值应挡 {:?}",
        report.findings
    );
    assert!(book.commit(recall).await.is_err());
}

#[tokio::test]
async fn s3_night_sail_blocked_when_rule_strict() {
    let (_h, book) = book().await;
    let mut rule = book
        .load_canon()
        .await
        .unwrap()
        .entities
        .into_iter()
        .find(|e| e.id == NIGHT_RULE)
        .unwrap_or_else(|| Entity {
            id: NIGHT_RULE.into(),
            kind: KIND_RULE.into(),
            name: "渡口夜间不得开船".into(),
            profile: Default::default(),
        });
    rule.profile.insert("enforcement".into(), "挡".into());
    rule.profile.insert("scope".into(), "渡口、入夜之后".into());
    book.upsert_entity(&rule).await.unwrap();
    let sail = BeatDraft {
        id: Some("b_sail".into()),
        kind: "scene".into(),
        column_id: COL0.into(),
        intent: "夜间开船".into(),
        value_shift: Some("违戒".into()),
        do_text: Some("解缆开船".into()),
        clock_from: 0,
        clock_to: 60,
        place_id: Some(FERRY.into()),
        presences: vec![p(AFU, ROLE_PRESENT)],
        ..BeatDraft::default()
    };
    let report = book.constrain_draft(&sail).await.unwrap();
    assert!(
        report.findings.iter().any(|f| f.code == "rule_block" && f.grade == narra::services::constrain::Grade::Strict),
        "夜间开船规则为挡则应挡 {:?}",
        report.findings
    );
    assert!(book.commit(sail).await.is_err());
    rule.profile.insert("enforcement".into(), "标黄".into());
    book.upsert_entity(&rule).await.unwrap();
    let warn = BeatDraft {
        id: Some("b_sail_warn".into()),
        kind: "scene".into(),
        column_id: COL0.into(),
        intent: "夜间开船".into(),
        value_shift: Some("破戒".into()),
        do_text: Some("解缆开船".into()),
        clock_from: 0,
        clock_to: 60,
        place_id: Some(FERRY.into()),
        presences: vec![p(AFU, ROLE_PRESENT)],
        ..BeatDraft::default()
    };
    let report = book.constrain_draft(&warn).await.unwrap();
    assert!(
        report.findings.iter().any(|f| f.code == "rule_warn"),
        "标黄应可见 {:?}",
        report.findings
    );
    assert!(!report.blocks());
}

#[tokio::test]
async fn s4_person_lens_keeps_world_and_filters_person_ledger() {
    let (_h, book) = book().await;
    book.commit(afu_sees_knife()).await.unwrap();
    let world = book.world_at(10, None).await.unwrap();
    let canon = book.load_canon().await.unwrap();
    let draft = BeatDraft {
        intent: "阿莲来找东西".into(),
        column_id: COL1.into(),
        clock_from: 10,
        clock_to: 60,
        place_id: Some(FERRY.into()),
        presences: vec![p(LIAN, ROLE_PRESENT)],
        ..BeatDraft::default()
    };
    let pkt = given_circumstances(&world, &canon, &draft);
    let lens = apply_person_lens(pkt, &world, LIAN);
    assert!(
        lens.stakes
            .iter()
            .any(|s| s.contains(KNIFE) && (s.contains("holder") || s.contains(AFU))),
        "人物透镜不得藏世界上的刀 {:?}",
        lens.stakes
    );
    assert!(
        lens.knowledge_gaps.iter().all(|s| s.contains(LIAN)),
        "人物账应变阿莲的 {:?}",
        lens.knowledge_gaps
    );
    assert!(
        lens.knowledge_gaps
            .iter()
            .any(|s| s.contains("不知道") && (s.contains(KNIFE) || s.contains("刀"))),
        "阿莲应不知道刀 {:?}",
        lens.knowledge_gaps
    );
}

#[tokio::test]
async fn s4_relations_afu_sees_knife_and_lian_readonly() {
    let (_h, book) = book().await;
    book.commit(afu_sees_knife()).await.unwrap();
    book.commit(BeatDraft {
        id: Some("b_meet".into()),
        kind: "scene".into(),
        column_id: COL1.into(),
        intent: "阿莲来找东西".into(),
        value_shift: Some("寻找→落空".into()),
        do_text: Some("进门".into()),
        clock_from: 60,
        clock_to: 120,
        place_id: Some(FERRY.into()),
        presences: vec![p(AFU, ROLE_PRESENT), p(LIAN, ROLE_PRESENT)],
        ..BeatDraft::default()
    })
    .await
    .unwrap();
    let world = book.world_at(70, None).await.unwrap();
    let canon = book.load_canon().await.unwrap();
    let (nodes, edges) = relations_for(&canon, &world, AFU);
    assert!(
        nodes.iter().any(|n| n.id == KNIFE),
        "应有刀节点 {nodes:?}"
    );
    assert!(
        nodes.iter().any(|n| n.id == LIAN),
        "应有阿莲节点 {nodes:?}"
    );
    assert!(
        edges.iter().any(|e| e.to == KNIFE && e.rel == "持有"),
        "阿福应有持有刀的边 {edges:?}"
    );
    assert!(
        edges.iter().any(|e| e.to == LIAN && e.rel == "同场"),
        "阿福应有与阿莲同场的边 {edges:?}"
    );
    assert!(
        world
            .states
            .iter()
            .any(|s| s.entity_id == KNIFE && s.attr == "holder" && s.value == AFU),
        "连线不得改正史 {:?}",
        world.states
    );
}

#[tokio::test]
async fn s5_export_premise_and_chapters_no_beat_advice() {
    let (_h, book) = book().await;
    book.commit(afu_sees_knife()).await.unwrap();
    let world = book.world_at(10, None).await.unwrap();
    let canon = book.load_canon().await.unwrap();
    let pkt = book
        .given_circumstances(&BeatDraft {
            intent: "阿莲来找东西".into(),
            column_id: COL1.into(),
            clock_from: 10,
            place_id: Some(FERRY.into()),
            presences: vec![p(LIAN, ROLE_PRESENT)],
            ..BeatDraft::default()
        })
        .await
        .unwrap();
    let pkt_json = serde_json::to_string(&pkt).unwrap();
    assert!(
        craft::forbids_beat_advice(&pkt_json),
        "规定情境不得出现节拍指令 {pkt_json}"
    );
    let fake = format!("（假模型）为「{}」走了一步", "阿莲来找东西");
    assert!(craft::forbids_beat_advice(&fake));
    assert!(!fake.contains("你现在应该写中点"));
    assert_eq!(world.t, 10);

    let craft = BookCraft {
        premise: "渡口夜里，铜牌三日，刀在抽屉。".into(),
        chapters: vec![
            CraftChapter {
                id: "ch1".into(),
                title: "抽屉".into(),
                start_column: COL0.into(),
            },
            CraftChapter {
                id: "ch2".into(),
                title: "来人".into(),
                start_column: COL1.into(),
            },
        ],
        ..Default::default()
    };
    let cols = vec![
        Column {
            id: COL0.into(),
            clock_from: 0,
            clock_to: 60,
            display_ord: 0,
        },
        Column {
            id: COL1.into(),
            clock_from: 60,
            clock_to: 120,
            display_ord: 1,
        },
    ];
    let md = craft::export_markdown(
        "渡口",
        &craft,
        &cols,
        vec![
            ExportBeat {
                column_id: COL0.into(),
                clock: 0,
                telling: 1,
                seq: 1,
                block: "## 场 · 阿福发现刀在抽屉\n状态：正史\n\n".into(),
            },
            ExportBeat {
                column_id: COL1.into(),
                clock: 60,
                telling: 2,
                seq: 2,
                block: "## 场 · 阿莲来找东西\n状态：正史\n\n".into(),
            },
        ],
        false,
    );
    assert!(md.contains("> 主脑：渡口夜里，铜牌三日，刀在抽屉。"), "{md}");
    assert!(md.contains("# 第1回 抽屉"), "{md}");
    assert!(md.contains("# 第2回 来人"), "{md}");
    assert!(md.contains("阿福发现刀在抽屉"));
    assert!(craft::forbids_beat_advice(&md));
    let _ = canon;
}

#[tokio::test]
async fn s6_lie_visible_warns_but_does_not_block() {
    let (_h, book) = book().await;
    book.commit(afu_sees_knife()).await.unwrap();
    let lie = BeatDraft {
        id: Some("b_lie".into()),
        kind: "scene".into(),
        column_id: COL1.into(),
        intent: "阿福说没看见".into(),
        value_shift: Some("隐瞒".into()),
        do_text: Some("摇头".into()),
        say_text: Some("阿福：没看见。".into()),
        clock_from: 60,
        clock_to: 120,
        place_id: Some(FERRY.into()),
        presences: vec![p(AFU, ROLE_PRESENT), p(LIAN, ROLE_PRESENT)],
        ..BeatDraft::default()
    };
    let report = book.constrain_draft(&lie).await.unwrap();
    assert!(
        report
            .findings
            .iter()
            .any(|f| f.code == "lie_visible" && f.grade == narra::services::constrain::Grade::Warn),
        "撒谎应标黄 {:?}",
        report.findings
    );
    assert!(!report.blocks());
}

#[tokio::test]
async fn s6_official_cli_scene_is_not_canon() {
    let (_h, book) = book().await;
    book.commit(afu_sees_knife()).await.unwrap();
    book.db()
        .query(
            "UPSERT event:cli_ghost SET title = 'ghost', sequence = 99, updated_at = time::now();
             UPSERT scene:cli_ghost SET title = '官方CLI冒充', event = event:cli_ghost, status = 'committed', intent = '官方CLI冒充', commit_seq = 99, updated_at = time::now();",
        )
        .await
        .expect("official cli scene");
    let canon = book.load_canon().await.unwrap();
    assert!(
        !canon.beats.iter().any(|b| b.id == "cli_ghost" || b.intent.contains("官方CLI")),
        "官方 CLI 新建场不得进正史 {:?}",
        canon.beats.iter().map(|b| &b.intent).collect::<Vec<_>>()
    );
    let world = book.world_at(10, None).await.unwrap();
    assert!(world.playing.contains(&"b_knife".into()));
    assert!(!world.playing.iter().any(|id| id.contains("ghost") || id.contains("cli")));
    let mut q = book
        .db()
        .query("SELECT intent, title FROM scene WHERE intent = '官方CLI冒充' OR title = '官方CLI冒充'")
        .await
        .expect("select ghost");
    #[derive(Debug, serde::Deserialize)]
    struct Row {
        intent: Option<String>,
        title: Option<String>,
    }
    let rows: Vec<Row> = q.take(0).unwrap_or_default();
    assert!(
        !rows.is_empty(),
        "官方表可以有这场，只是产品不当正史 {rows:?}"
    );
}

fn put_knife_in_drawer() -> BeatDraft {
    BeatDraft {
        id: Some("b_put".into()),
        kind: "scene".into(),
        column_id: COL0.into(),
        intent: "有人把刀放进抽屉".into(),
        value_shift: Some("刀入屉".into()),
        do_text: Some("把刀推进抽屉".into()),
        clock_from: 0,
        clock_to: 60,
        place_id: Some(FERRY.into()),
        presences: vec![p(AFU, ROLE_PRESENT)],
        deltas: vec![Delta {
            entity_id: KNIFE.into(),
            attr: "place".into(),
            value: "抽屉".into(),
            clock_from: 0,
            clock_to: None,
        }],
        ..BeatDraft::default()
    }
}

#[tokio::test]
async fn s6_delete_lists_causal_gap() {
    let (_h, book) = book().await;
    book.commit(put_knife_in_drawer()).await.unwrap();
    let mut found = afu_sees_knife();
    found.cause_beat = Some("b_put".into());
    book.commit(found).await.unwrap();
    let canon = book.load_canon().await.unwrap();
    let deps = constrain::causal_dependents(&canon, "b_put");
    assert!(
        deps.iter().any(|b| b.intent.contains("阿福发现刀")),
        "删刀入屉应列出阿福发现刀的因果缺口 {:?}",
        deps.iter().map(|b| &b.intent).collect::<Vec<_>>()
    );
    book.supersede("b_put").await.unwrap();
    let later = BeatDraft {
        id: Some("b_after".into()),
        kind: "scene".into(),
        column_id: COL1.into(),
        intent: "再指向已删场".into(),
        value_shift: Some("空".into()),
        do_text: Some("回头看屉".into()),
        clock_from: 60,
        clock_to: 120,
        place_id: Some(FERRY.into()),
        presences: vec![p(AFU, ROLE_PRESENT)],
        cause_beat: Some("b_put".into()),
        ..BeatDraft::default()
    };
    let report = book.constrain_draft(&later).await.unwrap();
    assert!(
        report
            .findings
            .iter()
            .any(|f| f.code == "cause_superseded" && f.grade == constrain::Grade::Strict),
        "指向已作废场应挡 {:?}",
        report.findings
    );
}

#[tokio::test]
async fn s7_load_canon_prefers_scene_over_setting_bag() {
    let (_h, book) = book().await;
    book.commit(afu_sees_knife()).await.unwrap();
    book.db()
        .query("UPDATE setting_beat:b_knife SET intent = '袋里被改'")
        .await
        .expect("tamper bag");
    let canon = book.load_canon().await.unwrap();
    let b = canon
        .beats
        .iter()
        .find(|b| b.id == "b_knife")
        .expect("beat");
    assert_eq!(b.intent, "阿福发现刀", "场骨架应以 scene 为准 {:?}", b.intent);
}

#[tokio::test]
async fn s7_rule_universe_fact_fills_empty_profile() {
    let (_h, book) = book().await;
    let mut profile = std::collections::BTreeMap::new();
    profile.insert("enforcement".into(), "挡".into());
    profile.insert("scope".into(), "渡口 夜".into());
    book.upsert_entity(&Entity {
        id: NIGHT_RULE.into(),
        kind: KIND_RULE.into(),
        name: "渡口夜间不得开船".into(),
        profile,
    })
    .await
    .unwrap();
    book.db()
        .query("UPDATE setting_entity:night_rule SET profile = '{}'")
        .await
        .expect("empty profile");
    let canon = book.load_canon().await.unwrap();
    let e = canon
        .entities
        .iter()
        .find(|e| e.id == NIGHT_RULE)
        .expect("rule");
    assert_eq!(
        e.profile.get("enforcement").map(String::as_str),
        Some("挡"),
        "空档案应从 universe_fact 补回 {:?}",
        e.profile
    );
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

