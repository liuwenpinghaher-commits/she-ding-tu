//! 渡口夹具：阿禾 / 阿福 / 阿莲 / 渡口 / 铜牌 / 刀。不写入正史。

use crate::services::canon::SettingBook;
use crate::services::world::{
    Column, Entity, KIND_PERSON, KIND_PLACE, KIND_THING, KIND_FACTION, KIND_RULE, KIND_PROMISE,
};
use crate::NarraError;

pub const AHE: &str = "ahe";
pub const AFU: &str = "afu";
pub const LIAN: &str = "lian";
pub const FERRY: &str = "ferry";
pub const CITY: &str = "city";
pub const KNIFE: &str = "knife";
pub const TOKEN: &str = "token";
pub const GANG: &str = "gang";
pub const NIGHT_RULE: &str = "night_rule";
pub const COL0: &str = "col0";
pub const COL1: &str = "col1";
pub const COL2: &str = "col2";

pub fn person(id: &str, name: &str) -> Entity {
    Entity {
        id: id.into(),
        kind: KIND_PERSON.into(),
        name: name.into(),
        profile: Default::default(),
    }
}

pub fn place(id: &str, name: &str) -> Entity {
    Entity {
        id: id.into(),
        kind: KIND_PLACE.into(),
        name: name.into(),
        profile: Default::default(),
    }
}

pub fn thing(id: &str, name: &str) -> Entity {
    Entity {
        id: id.into(),
        kind: KIND_THING.into(),
        name: name.into(),
        profile: Default::default(),
    }
}

/// 写入设定（身份层），不写入正史。
pub async fn seed_cast(book: &SettingBook) -> Result<(), NarraError> {
    book.upsert_entity(&person(AHE, "阿禾")).await?;
    book.upsert_entity(&person(AFU, "阿福")).await?;
    book.upsert_entity(&person(LIAN, "阿莲")).await?;
    book.upsert_entity(&place(FERRY, "渡口")).await?;
    book.upsert_entity(&place(CITY, "城里")).await?;
    book.upsert_entity(&thing(KNIFE, "刀")).await?;
    book.upsert_entity(&thing(TOKEN, "铜牌")).await?;
    book.upsert_entity(&Entity {
        id: GANG.into(),
        kind: KIND_FACTION.into(),
        name: "渡口帮".into(),
        profile: Default::default(),
    })
    .await?;
    book.upsert_entity(&Entity {
        id: NIGHT_RULE.into(),
        kind: KIND_RULE.into(),
        name: "渡口夜间不得开船".into(),
        profile: Default::default(),
    })
    .await?;
    book.upsert_column(&Column {
        id: COL0.into(),
        clock_from: 0,
        clock_to: 60,
        display_ord: 0,
    })
    .await?;
    book.upsert_column(&Column {
        id: COL1.into(),
        clock_from: 60,
        clock_to: 120,
        display_ord: 1,
    })
    .await?;
    book.upsert_column(&Column {
        id: COL2.into(),
        clock_from: 120,
        clock_to: 180,
        display_ord: 2,
    })
    .await?;
    let _ = KIND_PROMISE;
    Ok(())
}
