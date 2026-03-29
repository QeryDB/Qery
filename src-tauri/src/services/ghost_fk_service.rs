use std::collections::{HashMap, HashSet};
use serde::{Deserialize, Serialize};

// Columns ending with these suffixes are metadata, not real foreign keys
const BLACKLIST_SUFFIXES: &[&str] = &[
    "_guid", "_dbcno", "_specrecno", "_fileid",
    "_create_date", "_lastup_date", "_create_user", "_lastup_user",
    "_iptal", "_hidden", "_kilitli", "_degisti", "_checksum",
    "_special1", "_special2", "_special3",
];

// ────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GhostFKInfo {
    pub id: String,
    pub from_table: String,
    pub from_column: String,
    pub to_table: String,
    pub to_column: String,
    pub match_type: String, // "exact" | "suffix"
    pub confidence: f64,
    pub is_dismissed: bool,
    pub source: String, // "auto" | "manual"
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GhostFKResponse {
    pub ghost_fks: Vec<GhostFKInfo>,
    pub manual_fks: Vec<GhostFKInfo>,
    pub dismissed_count: i64,
}

#[derive(Debug, Clone)]
pub struct GhostFKCacheEntry {
    pub data: GhostFKResponse,
    pub timestamp: u128, // millis since epoch
}

// ────────────────────────────────────────────────────────
// Core matching helpers
// ────────────────────────────────────────────────────────

/// Column metadata for ghost FK detection
#[derive(Debug, Clone)]
pub struct ColMeta {
    pub name: String,
    pub is_pk: bool,
}

fn is_blacklisted(col: &str) -> bool {
    let lower = col.to_lowercase();
    BLACKLIST_SUFFIXES
        .iter()
        .any(|suffix| lower.ends_with(suffix))
}

fn make_ghost_key(from_table: &str, from_col: &str, to_table: &str, to_col: &str) -> String {
    format!(
        "{}|{}|{}|{}",
        from_table.to_lowercase(),
        from_col.to_lowercase(),
        to_table.to_lowercase(),
        to_col.to_lowercase(),
    )
}

/// Generic PK names that would match every table — skip for exact-name matching.
/// Convention matching (e.g. `user_id` → `users.id`) still works for these.
fn is_generic_pk_name(col: &str) -> bool {
    matches!(col.to_lowercase().as_str(), "id" | "pk" | "key" | "uuid" | "guid" | "oid")
}

/// Strip short table-abbreviation prefixes (2-4 chars + underscore).
/// e.g. "sth_RECno" → "RECno", "cari_kod" → "kod", "customer_id" → "customer_id" (too long)
fn strip_short_prefix(col: &str) -> &str {
    if let Some(pos) = col.find('_') {
        if pos >= 2 && pos <= 4 && pos + 1 < col.len() {
            return &col[pos + 1..];
        }
    }
    col
}

/// Extract bare table name from a potentially schema-qualified key (e.g., "public.users" → "users")
fn bare_name(qualified: &str) -> &str {
    qualified.rfind('.').map(|i| &qualified[i + 1..]).unwrap_or(qualified)
}

/// Industry-standard ghost FK detection using multiple strategies:
///
/// 1. **Exact name on PK** (confidence 1.0): Column has same name as another table's PK
/// 2. **Convention `table_id → table.pk`** (confidence 0.95): Column named `<table>_<pk>` or `<table>_id`
/// 3. **Suffix match on PK** (confidence 0.6): After stripping short prefix, matches another table's PK
/// + Reverse detection: find other tables whose columns reference target table's PKs
pub fn find_ghost_fks(
    target_table: &str,
    target_columns: &[ColMeta],
    all_columns_by_table: &HashMap<String, Vec<ColMeta>>,
) -> Vec<GhostFKInfo> {
    let mut results: Vec<GhostFKInfo> = Vec::new();
    let mut seen: HashSet<String> = HashSet::new();

    // Build PK lookup: table_name_lower → Vec<pk_column_name>
    let mut pk_by_table: HashMap<String, Vec<String>> = HashMap::new();
    for (tbl, cols) in all_columns_by_table {
        let pks: Vec<String> = cols.iter().filter(|c| c.is_pk).map(|c| c.name.clone()).collect();
        if !pks.is_empty() {
            pk_by_table.insert(tbl.to_lowercase(), pks);
        }
    }

    // Build table name lookup for convention matching
    // Maps both qualified ("public.users") and bare ("users", "user") → qualified key
    let mut table_name_lookup: HashMap<String, String> = HashMap::new();
    for tbl in all_columns_by_table.keys() {
        let lower = tbl.to_lowercase();
        table_name_lookup.insert(lower.clone(), tbl.clone());
        // Also index by bare table name (after dot) for convention matching
        if let Some(dot) = lower.rfind('.') {
            let bare = &lower[dot + 1..];
            table_name_lookup.entry(bare.to_string()).or_insert_with(|| tbl.clone());
            if bare.ends_with('s') && bare.len() > 3 {
                table_name_lookup.entry(bare[..bare.len() - 1].to_string()).or_insert_with(|| tbl.clone());
            }
        }
        if lower.ends_with('s') && lower.len() > 3 {
            table_name_lookup.entry(lower[..lower.len() - 1].to_string()).or_insert_with(|| tbl.clone());
        }
    }

    let target_lower = target_table.to_lowercase();
    // Bare target name for convention matching (e.g., "users" from "public.users")
    let target_bare = target_lower.rfind('.').map(|i| &target_lower[i + 1..]).unwrap_or(&target_lower);

    for col_meta in target_columns {
        if is_blacklisted(&col_meta.name) { continue; }
        let col_lower = col_meta.name.to_lowercase();
        let mut match_count = 0usize;

        // Skip generic PK names like "id" — they match every table
        if is_generic_pk_name(&col_meta.name) { continue; }

        // ── Strategy 1: Exact name match on PK ──
        for (other_table, other_cols) in all_columns_by_table {
            if other_table.to_lowercase() == target_lower { continue; }
            if let Some(pk_col) = other_cols.iter().find(|oc| oc.is_pk && oc.name.to_lowercase() == col_lower) {
                let key = make_ghost_key(target_table, &col_meta.name, other_table, &pk_col.name);
                if seen.insert(key.clone()) {
                    match_count += 1;
                    results.push(GhostFKInfo {
                        id: key, from_table: bare_name(target_table).to_string(), from_column: col_meta.name.clone(),
                        to_table: bare_name(other_table).to_string(), to_column: pk_col.name.clone(),
                        match_type: "exact".to_string(), confidence: 1.0,
                        is_dismissed: false, source: "auto".to_string(), description: None,
                    });
                }
            }
        }

        // ── Strategy 2: Convention — column_name → table.pk ──
        // Always runs — a column like `user_id` can match both `user_roles.user_id` (PK) and `users.id` (convention)
        if let Some(pos) = col_lower.rfind('_') {
            let table_part = &col_lower[..pos];
            let pk_part = &col_lower[pos + 1..];
            if pk_part.len() >= 1 && table_part.len() >= 2 {
                if let Some(real_table) = table_name_lookup.get(table_part) {
                    if real_table.to_lowercase() != target_lower {
                        if let Some(pks) = pk_by_table.get(&real_table.to_lowercase()) {
                            if let Some(pk_name) = pks.iter().find(|pk| pk.to_lowercase() == pk_part) {
                                let key = make_ghost_key(target_table, &col_meta.name, real_table, pk_name);
                                if seen.insert(key.clone()) {
                                    match_count += 1;
                                    results.push(GhostFKInfo {
                                        id: key, from_table: bare_name(target_table).to_string(), from_column: col_meta.name.clone(),
                                        to_table: bare_name(&real_table).to_string(), to_column: pk_name.clone(),
                                        match_type: "convention".to_string(), confidence: 0.95,
                                        is_dismissed: false, source: "auto".to_string(), description: None,
                                    });
                                }
                            }
                        }
                    }
                }
            }
        }

        // ── Strategy 3: Suffix match on PK ──
        // Strip short prefix from our column, check if it matches another table's PK
        let col_core = strip_short_prefix(&col_meta.name).to_lowercase();
        if col_core != col_lower && col_core.len() >= 3 {
            for (other_table, pks) in &pk_by_table {
                if *other_table == target_lower { continue; }
                for pk in pks {
                    if pk.to_lowercase() == col_core {
                        let real_table = all_columns_by_table.keys()
                            .find(|t| t.to_lowercase() == *other_table)
                            .cloned()
                            .unwrap_or_else(|| other_table.clone());
                        let key = make_ghost_key(target_table, &col_meta.name, &real_table, pk);
                        if seen.insert(key.clone()) {
                            match_count += 1;
                            results.push(GhostFKInfo {
                                id: key, from_table: bare_name(target_table).to_string(), from_column: col_meta.name.clone(),
                                to_table: bare_name(&real_table).to_string(), to_column: pk.clone(),
                                match_type: "suffix".to_string(), confidence: 0.6,
                                is_dismissed: false, source: "auto".to_string(), description: None,
                            });
                        }
                    }
                }
            }
        }

        // Reduce confidence for columns matching too many tables
        if match_count >= 20 {
            for r in results.iter_mut() {
                if r.from_column.to_lowercase() == col_lower {
                    r.confidence = r.confidence.min(0.3);
                }
            }
        }
    }

    // ── Reverse detection: find other tables' columns that reference target table's PKs ──
    // e.g. viewing "users" → find "posts.user_id" that conventions to "users.id"
    let target_pks: Vec<&str> = target_columns.iter()
        .filter(|c| c.is_pk)
        .map(|c| c.name.as_str())
        .collect();

    if !target_pks.is_empty() {
        // Reverse Strategy 1: Other table has a column with same name as our PK
        for (other_table, other_cols) in all_columns_by_table {
            if other_table.to_lowercase() == target_lower { continue; }
            for other_col in other_cols {
                if other_col.is_pk || is_blacklisted(&other_col.name) { continue; }
                let other_lower = other_col.name.to_lowercase();

                for &pk in &target_pks {
                    let pk_lower = pk.to_lowercase();

                    // Exact name match on our PK (skip generic names like "id")
                    if other_lower == pk_lower && !is_generic_pk_name(pk) {
                        let key = make_ghost_key(other_table, &other_col.name, target_table, pk);
                        if seen.insert(key.clone()) {
                            results.push(GhostFKInfo {
                                id: key, from_table: bare_name(other_table).to_string(), from_column: other_col.name.clone(),
                                to_table: bare_name(target_table).to_string(), to_column: pk.to_string(),
                                match_type: "exact".to_string(), confidence: 1.0,
                                is_dismissed: false, source: "auto".to_string(), description: None,
                            });
                        }
                        continue;
                    }

                    // Convention: other_col = "<target_table>_<pk>" (e.g. "user_id" for users.id)
                    if let Some(pos) = other_lower.rfind('_') {
                        let table_part = &other_lower[..pos];
                        let pk_part = &other_lower[pos + 1..];
                        if pk_part == pk_lower {
                            let target_matches = table_part == target_bare
                                || (target_bare.ends_with('s') && target_bare.len() > 3 && table_part == &target_bare[..target_bare.len() - 1]);
                            if target_matches {
                                let key = make_ghost_key(other_table, &other_col.name, target_table, pk);
                                if seen.insert(key.clone()) {
                                    results.push(GhostFKInfo {
                                        id: key, from_table: bare_name(other_table).to_string(), from_column: other_col.name.clone(),
                                        to_table: bare_name(target_table).to_string(), to_column: pk.to_string(),
                                        match_type: "convention".to_string(), confidence: 0.95,
                                        is_dismissed: false, source: "auto".to_string(), description: None,
                                    });
                                }
                            }
                        }
                    }

                    // Suffix: strip short prefix from other_col, match our PK
                    let other_core = strip_short_prefix(&other_col.name).to_lowercase();
                    if other_core != other_lower && other_core.len() >= 3 && other_core == pk_lower {
                        let key = make_ghost_key(other_table, &other_col.name, target_table, pk);
                        if seen.insert(key.clone()) {
                            results.push(GhostFKInfo {
                                id: key, from_table: bare_name(other_table).to_string(), from_column: other_col.name.clone(),
                                to_table: bare_name(target_table).to_string(), to_column: pk.to_string(),
                                match_type: "suffix".to_string(), confidence: 0.6,
                                is_dismissed: false, source: "auto".to_string(), description: None,
                            });
                        }
                    }
                }
            }
        }
    }

    // Filter out self-references (can happen with schema-qualified key dedup edge cases)
    results.retain(|r| r.from_table.to_lowercase() != r.to_table.to_lowercase());

    results
}

/// Invalidate the in-memory ghost FK cache for a connection/database/table.
pub async fn invalidate_cache(
    ghost_fk_cache: &tokio::sync::RwLock<HashMap<String, GhostFKCacheEntry>>,
    connection_id: &str,
    database_name: &str,
    table_name: Option<&str>,
) {
    let mut cache = ghost_fk_cache.write().await;
    if let Some(table) = table_name {
        let key = format!("{}:{}:{}", connection_id, database_name, table);
        cache.remove(&key);
    } else {
        // Invalidate all entries for this connection + db
        let prefix = format!("{}:{}:", connection_id, database_name);
        cache.retain(|k, _| !k.starts_with(&prefix));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn col(name: &str, is_pk: bool) -> ColMeta {
        ColMeta { name: name.to_string(), is_pk }
    }

    #[test]
    fn strip_prefix_short() {
        assert_eq!(strip_short_prefix("sth_RECno"), "RECno");
        assert_eq!(strip_short_prefix("cari_kod"), "kod");
        assert_eq!(strip_short_prefix("ab_test"), "test");
    }

    #[test]
    fn strip_prefix_long_keeps() {
        assert_eq!(strip_short_prefix("customer_id"), "customer_id");
        assert_eq!(strip_short_prefix("order_date"), "order_date");
    }

    #[test]
    fn is_blacklisted_guid() {
        assert!(is_blacklisted("sth_Guid"));
        assert!(is_blacklisted("SOME_CHECKSUM"));
    }

    #[test]
    fn is_not_blacklisted() {
        assert!(!is_blacklisted("sth_RECno"));
        assert!(!is_blacklisted("cari_kod"));
    }

    #[test]
    fn ghost_key_format() {
        let key = make_ghost_key("STOK", "sto_RECno", "STHAR", "sth_RECno");
        assert_eq!(key, "stok|sto_recno|sthar|sth_recno");
    }

    #[test]
    fn strategy1_exact_name_on_pk() {
        let mut cols = HashMap::new();
        cols.insert("orders".to_string(), vec![col("id", true), col("user_id", false)]);
        cols.insert("users".to_string(), vec![col("user_id", true), col("name", false)]);

        let target = vec![col("id", true), col("user_id", false)];
        let results = find_ghost_fks("orders", &target, &cols);

        assert_eq!(results.len(), 1);
        assert_eq!(results[0].match_type, "exact");
        assert_eq!(results[0].confidence, 1.0);
        assert_eq!(results[0].to_table, "users");
    }

    #[test]
    fn strategy2_convention_table_id() {
        let mut cols = HashMap::new();
        cols.insert("orders".to_string(), vec![col("id", true), col("user_id", false)]);
        cols.insert("users".to_string(), vec![col("id", true), col("name", false)]);

        let target = vec![col("id", true), col("user_id", false)];
        let results = find_ghost_fks("orders", &target, &cols);

        let conv = results.iter().find(|r| r.match_type == "convention");
        assert!(conv.is_some());
        assert_eq!(conv.unwrap().to_table, "users");
        assert_eq!(conv.unwrap().to_column, "id");
        assert!(conv.unwrap().confidence > 0.9);
    }

    #[test]
    fn no_match_on_common_non_pk_columns() {
        // "created_at" in both tables — should NOT match (no Strategy 3 anymore)
        let mut cols = HashMap::new();
        cols.insert("orders".to_string(), vec![col("id", true), col("created_at", false)]);
        cols.insert("users".to_string(), vec![col("id", true), col("created_at", false)]);

        let target = vec![col("id", true), col("created_at", false)];
        let results = find_ghost_fks("orders", &target, &cols);

        assert!(results.iter().all(|r| r.from_column != "created_at" && r.to_column != "created_at"),
            "created_at should not create ghost FK relationships");
    }

    #[test]
    fn strategy3_suffix_on_pk() {
        let mut cols = HashMap::new();
        cols.insert("STOK".to_string(), vec![col("sto_RECno", false)]);
        cols.insert("STHAR".to_string(), vec![col("RECno", true), col("sth_data", false)]);

        let target = vec![col("sto_RECno", false)];
        let results = find_ghost_fks("STOK", &target, &cols);

        assert_eq!(results.len(), 1);
        assert_eq!(results[0].match_type, "suffix");
        assert_eq!(results[0].confidence, 0.6);
        assert_eq!(results[0].to_table, "STHAR");
    }

    #[test]
    fn no_false_positive_on_generic_names() {
        // "kod" appears in many tables but none have it as PK → no suffix match
        let mut cols = HashMap::new();
        cols.insert("A".to_string(), vec![col("aa_kod", false), col("id", true)]);
        cols.insert("B".to_string(), vec![col("bb_kod", false), col("id", true)]);
        cols.insert("C".to_string(), vec![col("cc_kod", false), col("id", true)]);

        let target = vec![col("aa_kod", false), col("id", true)];
        let results = find_ghost_fks("A", &target, &cols);

        // Should NOT match B or C via suffix "kod" since it's not a PK anywhere
        let suffix_matches: Vec<_> = results.iter().filter(|r| r.match_type == "suffix").collect();
        assert_eq!(suffix_matches.len(), 0);
    }

    #[test]
    fn reverse_convention_detection() {
        // Viewing "users" table — should find that "posts.user_id" references "users.id"
        let mut cols = HashMap::new();
        cols.insert("users".to_string(), vec![col("id", true), col("name", false)]);
        cols.insert("posts".to_string(), vec![col("id", true), col("user_id", false), col("title", false)]);
        cols.insert("comments".to_string(), vec![col("id", true), col("user_id", false), col("post_id", false)]);

        let target = vec![col("id", true), col("name", false)];
        let results = find_ghost_fks("users", &target, &cols);

        // Should find posts.user_id → users.id AND comments.user_id → users.id
        assert!(results.len() >= 2, "Expected at least 2 reverse matches, got {}", results.len());
        assert!(results.iter().any(|r| r.from_table == "posts" && r.from_column == "user_id"));
        assert!(results.iter().any(|r| r.from_table == "comments" && r.from_column == "user_id"));
    }
}
