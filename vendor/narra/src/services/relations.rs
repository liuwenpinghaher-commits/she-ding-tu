//! 选中人后的连线。只读，不是第二份库。

use crate::services::world::{Canon, World, ROLE_PRESENT, STATUS_COMMITTED};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct RelNode {
    pub id: String,
    pub name: String,
    pub kind: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct RelEdge {
    pub from: String,
    pub to: String,
    pub rel: String,
    pub label: String,
}

pub fn relations_for(canon: &Canon, world: &World, person: &str) -> (Vec<RelNode>, Vec<RelEdge>) {
    let mut nodes: BTreeMap<String, RelNode> = BTreeMap::new();
    let mut edges: Vec<RelEdge> = Vec::new();
    let mut add_node = |id: &str| {
        if id.is_empty() || nodes.contains_key(id) {
            return;
        }
        if let Some(e) = canon.entity(id) {
            nodes.insert(
                id.to_string(),
                RelNode {
                    id: e.id.clone(),
                    name: e.name.clone(),
                    kind: e.kind.clone(),
                },
            );
        } else {
            nodes.insert(
                id.to_string(),
                RelNode {
                    id: id.to_string(),
                    name: id.to_string(),
                    kind: "unknown".into(),
                },
            );
        }
    };
    add_node(person);
    for b in canon.beats.iter().filter(|b| b.status == STATUS_COMMITTED) {
        let here = b
            .presences
            .iter()
            .any(|p| p.role == ROLE_PRESENT && p.entity_id == person);
        if !here {
            continue;
        }
        for p in b.presences.iter().filter(|p| p.role == ROLE_PRESENT && p.entity_id != person)
        {
            add_node(&p.entity_id);
            edges.push(RelEdge {
                from: person.into(),
                to: p.entity_id.clone(),
                rel: "同场".into(),
                label: b.intent.clone(),
            });
        }
        if let Some(place) = &b.place_id {
            add_node(place);
            edges.push(RelEdge {
                from: person.into(),
                to: place.clone(),
                rel: "在".into(),
                label: b.intent.clone(),
            });
        }
    }
    for s in &world.states {
        if s.attr == "holder" && s.value == person {
            add_node(&s.entity_id);
            edges.push(RelEdge {
                from: person.into(),
                to: s.entity_id.clone(),
                rel: "持有".into(),
                label: format!("{}.holder", s.entity_id),
            });
        }
        if s.attr == "where" && s.entity_id == person {
            add_node(&s.value);
            edges.push(RelEdge {
                from: person.into(),
                to: s.value.clone(),
                rel: "在".into(),
                label: format!("{}.where", s.entity_id),
            });
        }
    }
    edges.sort_by(|a, b| (a.from.clone(), a.to.clone(), a.rel.clone()).cmp(&(b.from.clone(), b.to.clone(), b.rel.clone())));
    edges.dedup_by(|a, b| a.from == b.from && a.to == b.to && a.rel == b.rel);
    (nodes.into_values().collect(), edges)
}
