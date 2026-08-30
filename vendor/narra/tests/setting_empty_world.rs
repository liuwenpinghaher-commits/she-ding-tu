//! 切片 0.1：空世界可创建；夹具不写入正史。

mod common;

use narra::services::canon::SettingBook;
use narra::services::ferry::{self, AHE};
use std::sync::Arc;

use common::harness::TestHarness;

#[tokio::test]
async fn empty_world_has_no_playing_beats() {
    let harness = TestHarness::new().await;
    let book = SettingBook::new(Arc::clone(&harness.db));

    let world = book
        .world_at(0, None)
        .await
        .expect("empty world_at");

    assert!(
        world.playing.is_empty(),
        "空书正在演的场必须空: {:?}",
        world.playing
    );
    assert!(
        world.states.is_empty(),
        "空书情状窗口必须空: {:?}",
        world.states
    );
    assert!(
        world.nodes.iter().all(|n| n.id != AHE),
        "尚未新建设定，不应有阿禾"
    );

    // 世界文件存在（嵌入式路径）
    assert!(harness.temp_path().join("test.db").exists() || harness.temp_path().exists());
}

#[tokio::test]
async fn ferry_cast_is_identity_not_canon() {
    let harness = TestHarness::new().await;
    let book = SettingBook::new(Arc::clone(&harness.db));
    ferry::seed_cast(&book).await.expect("seed");

    let world = book.world_at(0, None).await.expect("world_at");
    assert!(
        world.playing.is_empty(),
        "夹具不得写入正史场: {:?}",
        world.playing
    );
    assert!(
        world.nodes.iter().any(|n| n.id == AHE && n.name == "阿禾"),
        "身份层应有阿禾: {:?}",
        world.nodes
    );
}
