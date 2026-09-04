//! SurrealDB 3.x shims for 2.x call sites.
//!
//! v3 `RecordId` has public `table`/`key` fields and `ToSql`, not `Display` or
//! `.key()`. Query `.take()` now requires `SurrealValue` (see models).

use std::fmt;

use surrealdb::types::{RecordId, RecordIdKey, ToSql};

/// v2 SDK name. v3 renamed the query result type to `IndexedResults`.
pub type Response = surrealdb::IndexedResults;

/// Display wrapper so `id.key().to_string()` and `format!("{}", id.key())`
/// keep producing the bare key (e.g. `alice`, not `String("alice")`).
pub struct RecordIdKeyDisplay<'a>(pub &'a RecordIdKey);

impl fmt::Display for RecordIdKeyDisplay<'_> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self.0 {
            RecordIdKey::String(s) => f.write_str(s),
            RecordIdKey::Number(n) => write!(f, "{n}"),
            other => f.write_str(&other.to_sql()),
        }
    }
}

/// 2.x `Thing`/`RecordId` methods used across narra.
pub trait RecordIdExt {
    fn key(&self) -> RecordIdKeyDisplay<'_>;
    fn to_string(&self) -> String;
}

impl RecordIdExt for RecordId {
    fn key(&self) -> RecordIdKeyDisplay<'_> {
        RecordIdKeyDisplay(&self.key)
    }

    fn to_string(&self) -> String {
        ToSql::to_sql(self)
    }
}
