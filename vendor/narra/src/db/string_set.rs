//! v3 `set<string>` 绑定：`Vec<String>` 会变成 `Value::Array`，而 Array 不能 coerce 进 `Kind::Set`。

use serde::{Deserialize, Serialize};
use std::ops::{Deref, DerefMut};
use surrealdb::types::{Error, Kind, Set, SurrealValue, Value};

/// 正史序号：拒绝 v3 空表 `math::max` 的 `-inf`/`NaN`、以及 constrain 的 `i64::MAX` 哨兵。
pub fn value_as_i64(value: Value) -> Option<i64> {
    match value {
        Value::Number(n) => {
            if n.to_f64().is_some_and(|f| !f.is_finite()) {
                return None;
            }
            n.to_int().filter(|&i| (0..i64::MAX).contains(&i))
        }
        Value::None | Value::Null => None,
        _ => None,
    }
}

/// 把字符串列表编成 SurrealDB 原生 `Set`（写入 `TYPE set<string>` 字段用）。
pub fn string_set(items: impl IntoIterator<Item = impl Into<String>>) -> Set {
    Set::from(
        items
            .into_iter()
            .map(|s| Value::String(s.into()))
            .collect::<Vec<Value>>(),
    )
}

/// 从 `set` 或 `array` 读出 `Vec<String>`（官方表读路径）。
pub fn vec_from_set_value(value: Value) -> Result<Vec<String>, Error> {
    match value {
        Value::Set(s) => s.into_iter().map(String::from_value).collect(),
        Value::Array(a) => a.into_iter().map(String::from_value).collect(),
        Value::None | Value::Null => Ok(Vec::new()),
        other => Err(Error::internal(format!(
            "expected set<string> or array<string>, got {other:?}"
        ))),
    }
}

/// 读写 `set<string>` 的字段类型：写入 `Value::Set`，读取接受 Set 或 Array。
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(transparent)]
pub struct StringSet(pub Vec<String>);

impl StringSet {
    pub fn new() -> Self {
        Self(Vec::new())
    }
}

impl Deref for StringSet {
    type Target = Vec<String>;
    fn deref(&self) -> &Vec<String> {
        &self.0
    }
}

impl DerefMut for StringSet {
    fn deref_mut(&mut self) -> &mut Vec<String> {
        &mut self.0
    }
}

impl AsRef<[String]> for StringSet {
    fn as_ref(&self) -> &[String] {
        &self.0
    }
}

impl From<Vec<String>> for StringSet {
    fn from(v: Vec<String>) -> Self {
        Self(v)
    }
}

impl From<StringSet> for Vec<String> {
    fn from(s: StringSet) -> Self {
        s.0
    }
}

impl FromIterator<String> for StringSet {
    fn from_iter<I: IntoIterator<Item = String>>(iter: I) -> Self {
        Self(iter.into_iter().collect())
    }
}

impl IntoIterator for StringSet {
    type Item = String;
    type IntoIter = std::vec::IntoIter<String>;
    fn into_iter(self) -> Self::IntoIter {
        self.0.into_iter()
    }
}

impl<'a> IntoIterator for &'a StringSet {
    type Item = &'a String;
    type IntoIter = std::slice::Iter<'a, String>;
    fn into_iter(self) -> Self::IntoIter {
        self.0.iter()
    }
}

impl PartialEq<Vec<String>> for StringSet {
    fn eq(&self, other: &Vec<String>) -> bool {
        &self.0 == other
    }
}

impl PartialEq<StringSet> for Vec<String> {
    fn eq(&self, other: &StringSet) -> bool {
        self == &other.0
    }
}

impl SurrealValue for StringSet {
    fn kind_of() -> Kind {
        Kind::Set(Box::new(Kind::String), None)
    }

    fn is_value(value: &Value) -> bool {
        matches!(
            value,
            Value::Set(_) | Value::Array(_) | Value::None | Value::Null
        )
    }

    fn into_value(self) -> Value {
        Value::Set(string_set(self.0))
    }

    fn from_value(value: Value) -> Result<Self, Error> {
        vec_from_set_value(value).map(StringSet)
    }
}
