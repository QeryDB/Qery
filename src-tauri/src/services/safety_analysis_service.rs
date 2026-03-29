use std::collections::HashSet;
use std::sync::OnceLock;
use regex::Regex;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use crate::drivers::traits::DatabaseDriver;
use crate::services::object_service;

// ────────────────────────────────────────────────────────
// Build compiled mutation regex patterns (compiled once)
// ────────────────────────────────────────────────────────

static MUTATION_PATTERNS: OnceLock<Vec<Regex>> = OnceLock::new();
static RE_LINE_COMMENT: OnceLock<Regex> = OnceLock::new();
static RE_BLOCK_COMMENT: OnceLock<Regex> = OnceLock::new();
static RE_STRING_LITERAL: OnceLock<Regex> = OnceLock::new();

fn get_mutation_patterns() -> &'static Vec<Regex> {
    MUTATION_PATTERNS.get_or_init(build_patterns)
}

fn get_line_comment_re() -> &'static Regex {
    RE_LINE_COMMENT.get_or_init(|| Regex::new(r"--[^\n]*").unwrap())
}

fn get_block_comment_re() -> &'static Regex {
    RE_BLOCK_COMMENT.get_or_init(|| Regex::new(r"/\*[\s\S]*?\*/").unwrap())
}

fn get_string_literal_re() -> &'static Regex {
    RE_STRING_LITERAL.get_or_init(|| Regex::new(r"'[^']*'").unwrap())
}

/// DML/DDL keywords that indicate non-read operations.
fn build_patterns() -> Vec<Regex> {
    let patterns = [
        r"(?i)\bINSERT\s+INTO\b",
        r"(?i)\bINSERT\s+\[",
        r"(?i)\bUPDATE\s+\[",
        r"(?i)\bUPDATE\s+\w+\.\w+",
        r"(?i)\bDELETE\s+FROM\b",
        r"(?i)\bDELETE\s+\[",
        r"(?i)\bTRUNCATE\s+TABLE\b",
        r"(?i)\bDROP\s+(TABLE|VIEW|PROCEDURE|FUNCTION|INDEX|TRIGGER)\b",
        r"(?i)\bALTER\s+(TABLE|VIEW|PROCEDURE|FUNCTION|TRIGGER)\b",
        r"(?i)\bCREATE\s+(TABLE|INDEX|TRIGGER)\b",
        r"(?i)\bMERGE\s+INTO\b",
        r"(?i)\bMERGE\s+\[",
        r"(?i)\bEXEC(UTE)?\s+sp_rename\b",
        r"(?i)\bDBCC\b",
        r"(?i)\bBULK\s+INSERT\b",
        r"(?i)\bWRITETEXT\b",
        r"(?i)\bUPDATETEXT\b",
    ];
    patterns
        .iter()
        .filter_map(|p| Regex::new(p).ok())
        .collect()
}

// ────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MutationHit {
    pub object: String,
    pub schema: String,
    pub pattern: String,
    pub depth: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SafetyAnalysis {
    pub is_readonly: bool,
    pub mutations: Vec<MutationHit>,
}

// ────────────────────────────────────────────────────────
// Internal helpers
// ────────────────────────────────────────────────────────

/// Check if the text after a mutation match targets a temp table (#name or [#name])
fn targets_temp_table(cleaned: &str, match_end: usize) -> bool {
    let rest = &cleaned[match_end..];
    let trimmed = rest.trim_start();
    trimmed.starts_with('#') || trimmed.starts_with("[#")
}

/// Detect mutation patterns in a SQL definition, stripping comments and string literals.
fn detect_mutations(
    definition: &str,
    object_name: &str,
    schema_name: &str,
    depth: i32,
    patterns: &[Regex],
) -> Vec<MutationHit> {
    let mut hits = Vec::new();

    // Strip comments and string literals to reduce false positives
    let cleaned = get_line_comment_re().replace_all(definition, "");
    let cleaned = get_block_comment_re().replace_all(&cleaned, "");
    let cleaned = get_string_literal_re().replace_all(&cleaned, "''");

    for pattern in patterns {
        if let Some(m) = pattern.find(&cleaned) {
            // Skip mutations targeting temp tables (#table or [#table])
            if targets_temp_table(&cleaned, m.end()) {
                continue;
            }
            hits.push(MutationHit {
                object: object_name.to_string(),
                schema: schema_name.to_string(),
                pattern: m.as_str().to_string(),
                depth,
            });
        }
    }

    hits
}

// ────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────

/// Recursively analyze a database object for mutation operations.
/// Walks up to `max_depth` levels into dependencies (procedures, functions, views).
pub async fn analyze_safety(
    db: &Connection,
    driver: &dyn DatabaseDriver,
    connection_id: &str,
    database_name: &str,
    object_name: &str,
    schema_name: &str,
    max_depth: i32,
) -> Result<Value, String> {
    let patterns = get_mutation_patterns();
    let mut all_mutations: Vec<MutationHit> = Vec::new();
    let mut visited: HashSet<String> = HashSet::new();

    // Use a stack-based approach to avoid deep recursion with async
    struct WalkItem {
        name: String,
        schema: String,
        depth: i32,
    }

    let mut stack = vec![WalkItem {
        name: object_name.to_string(),
        schema: schema_name.to_string(),
        depth: 0,
    }];

    while let Some(item) = stack.pop() {
        let key = format!("{}.{}", item.schema, item.name).to_lowercase();
        if visited.contains(&key) || item.depth > max_depth {
            continue;
        }
        visited.insert(key);

        // Get definition
        if let Ok(Some(def)) = object_service::get_definition(
            db, driver, connection_id, database_name, &item.name, &item.schema,
        )
        .await
        {
            let hits = detect_mutations(&def, &item.name, &item.schema, item.depth, patterns);
            all_mutations.extend(hits);
        }

        // Get dependencies and push callable ones onto the stack
        if item.depth < max_depth {
            if let Ok(deps) = object_service::get_dependencies(
                db, driver, connection_id, database_name, &item.name, &item.schema,
            )
            .await
            {
                if let Some(deps_arr) = deps.as_array() {
                    for dep in deps_arr {
                        let dep_type = dep["type"].as_str().unwrap_or("");
                        if dep_type.contains("PROCEDURE")
                            || dep_type.contains("FUNCTION")
                            || dep_type.contains("VIEW")
                        {
                            let dep_name = dep["name"].as_str().unwrap_or("").to_string();
                            let dep_schema =
                                dep["schema"].as_str().unwrap_or(driver.default_schema()).to_string();
                            stack.push(WalkItem {
                                name: dep_name,
                                schema: dep_schema,
                                depth: item.depth + 1,
                            });
                        }
                    }
                }
            }
        }
    }

    let analysis = SafetyAnalysis {
        is_readonly: all_mutations.is_empty(),
        mutations: all_mutations,
    };

    serde_json::to_value(&analysis).map_err(|e| format!("Serialize error: {}", e))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detect_insert() {
        let patterns = get_mutation_patterns();
        let hits = detect_mutations(
            "INSERT INTO dbo.MyTable (col1) VALUES (1)",
            "test_proc",
            "dbo",
            0,
            patterns,
        );
        assert!(!hits.is_empty());
        assert!(hits[0].pattern.contains("INSERT"));
    }

    #[test]
    fn detect_nothing_in_select() {
        let patterns = get_mutation_patterns();
        let hits = detect_mutations(
            "SELECT * FROM dbo.MyTable WHERE id = 1",
            "test_view",
            "dbo",
            0,
            patterns,
        );
        assert!(hits.is_empty());
    }

    #[test]
    fn comments_are_stripped() {
        let patterns = get_mutation_patterns();
        let hits = detect_mutations(
            "-- INSERT INTO dbo.MyTable (col1) VALUES (1)\nSELECT 1",
            "test_proc",
            "dbo",
            0,
            patterns,
        );
        assert!(hits.is_empty());
    }

    #[test]
    fn temp_tables_are_ignored() {
        let patterns = get_mutation_patterns();
        let hits = detect_mutations(
            "DROP TABLE #TempData\nSELECT * INTO #Results FROM dbo.Source\nINSERT INTO #Staging SELECT 1\nCREATE TABLE #Work (id int)",
            "test_proc",
            "dbo",
            0,
            patterns,
        );
        assert!(hits.is_empty(), "Temp table operations should not be flagged, got: {:?}", hits.iter().map(|h| &h.pattern).collect::<Vec<_>>());
    }

    #[test]
    fn real_tables_still_flagged() {
        let patterns = get_mutation_patterns();
        let hits = detect_mutations(
            "DROP TABLE #TempData\nINSERT INTO dbo.RealTable (col) VALUES (1)",
            "test_proc",
            "dbo",
            0,
            patterns,
        );
        assert_eq!(hits.len(), 1);
        assert!(hits[0].pattern.contains("INSERT"));
    }

    #[test]
    fn string_literals_are_stripped() {
        let patterns = get_mutation_patterns();
        let hits = detect_mutations(
            "SELECT 'INSERT INTO foo' AS msg",
            "test_proc",
            "dbo",
            0,
            patterns,
        );
        assert!(hits.is_empty());
    }
}
