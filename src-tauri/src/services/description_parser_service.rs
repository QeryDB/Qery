use regex::Regex;
use rusqlite::Connection;
use serde_json::Value;
use crate::repositories::{cached_schemas, parsed_descriptions};

// ────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct ParsedColumn {
    pub alias: String,
    pub source_expression: Option<String>,
    pub source_column_clean: Option<String>,
    pub description: Option<String>,
    pub flags: Vec<String>,
}

// ────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────

/// Parse all view/proc/function definitions from cached schema
/// and populate the parsed_column_descriptions table.
/// Returns (inserted, preserved) counts.
pub fn parse_and_store(
    db: &Connection,
    connection_id: &str,
    database_name: &str,
    default_schema: &str,
) -> Result<Value, String> {
    let cached_row = cached_schemas::get_cached_schema(db, connection_id, database_name)?;
    let schema: Value = match cached_row {
        Some(row) => {
            if let Some(schema_json_str) = row.get("schema_json").and_then(|v| v.as_str()) {
                serde_json::from_str(schema_json_str)
                    .map_err(|e| format!("Failed to parse cached schema: {}", e))?
            } else {
                return Ok(serde_json::json!({ "inserted": 0, "preserved": 0 }));
            }
        }
        None => {
            return Ok(serde_json::json!({ "inserted": 0, "preserved": 0 }));
        }
    };

    let mut rows: Vec<Value> = Vec::new();

    // Helper to build rows for an object type
    fn push_parsed_rows(
        rows: &mut Vec<Value>,
        connection_id: &str,
        database_name: &str,
        schema_name: &str,
        object_name: &str,
        object_type: &str,
        definition: &str,
    ) {
        let parsed = parse_definition(definition);
        for col in parsed {
            rows.push(serde_json::json!({
                "connection_id": connection_id,
                "database_name": database_name,
                "schema_name": schema_name,
                "object_name": object_name,
                "object_type": object_type,
                "column_alias": col.alias,
                "source_expression": col.source_expression,
                "source_column_clean": col.source_column_clean,
                "parsed_description": col.description,
                "flags": serde_json::to_string(&col.flags).unwrap_or_else(|_| "[]".to_string()),
            }));
        }
    }

    // Process views
    if let Some(views) = schema["views"].as_array() {
        for view in views {
            if let Some(definition) = view["definition"].as_str() {
                let schema_name = view["schema"].as_str().unwrap_or(default_schema);
                let object_name = view["name"].as_str().unwrap_or("");
                push_parsed_rows(&mut rows, connection_id, database_name, schema_name, object_name, "view", definition);
            }
        }
    }

    // Process procedures
    if let Some(procedures) = schema["procedures"].as_array() {
        for proc in procedures {
            if let Some(definition) = proc["definition"].as_str() {
                let schema_name = proc["schema"].as_str().unwrap_or(default_schema);
                let object_name = proc["name"].as_str().unwrap_or("");
                push_parsed_rows(&mut rows, connection_id, database_name, schema_name, object_name, "procedure", definition);
            }
        }
    }

    // Process functions
    if let Some(functions) = schema["functions"].as_array() {
        for func in functions {
            if let Some(definition) = func["definition"].as_str() {
                let schema_name = func["schema"].as_str().unwrap_or(default_schema);
                let object_name = func["name"].as_str().unwrap_or("");
                push_parsed_rows(&mut rows, connection_id, database_name, schema_name, object_name, "function", definition);
            }
        }
    }

    // Count confirmed (preserved) before bulk replace
    let stats_before = parsed_descriptions::get_description_stats(db, connection_id, database_name)?;
    let preserved = stats_before["confirmed"].as_i64().unwrap_or(0);

    let inserted = rows.len() as i64;
    parsed_descriptions::bulk_replace(db, connection_id, database_name, &rows)?;

    Ok(serde_json::json!({
        "inserted": inserted,
        "preserved": preserved,
    }))
}

// ────────────────────────────────────────────────────────
// Definition parser (3-pass regex extraction)
// ────────────────────────────────────────────────────────

/// Parse a SQL definition and extract column alias information.
/// Uses a 3-pass approach: block comments, line comments, then plain aliases.
pub fn parse_definition(definition: &str) -> Vec<ParsedColumn> {
    let mut results: Vec<ParsedColumn> = Vec::new();
    let mut seen: std::collections::HashSet<String> = std::collections::HashSet::new();

    // --- Pass 1: Aliases with block comments: AS [alias] /* comment */
    let block_comment_re =
        Regex::new(r"(?i)AS\s+\[([^\]]+)\]\s*,?\s*/\*\s*([^*]*?)\s*\*/").unwrap();
    for cap in block_comment_re.captures_iter(definition) {
        let alias = cap[1].trim().to_string();
        let comment = cap[2].trim().to_string();
        if !seen.contains(&alias) {
            seen.insert(alias.clone());
            results.push(build_column(
                &alias,
                if comment.is_empty() { None } else { Some(&comment) },
                definition,
            ));
        }
    }

    // --- Pass 2: Aliases with line comments: AS [alias] -- comment
    let line_comment_re = Regex::new(r"(?i)AS\s+\[([^\]]+)\]\s*,?\s*--\s*(.+)").unwrap();
    for cap in line_comment_re.captures_iter(definition) {
        let alias = cap[1].trim().to_string();
        let comment = cap[2].trim().to_string();
        if !seen.contains(&alias) {
            seen.insert(alias.clone());
            results.push(build_column(
                &alias,
                if comment.is_empty() { None } else { Some(&comment) },
                definition,
            ));
        }
    }

    // --- Pass 3: Aliases without any comment: AS [alias]
    let alias_only_re = Regex::new(r"(?i)AS\s+\[([^\]]+)\]").unwrap();
    for cap in alias_only_re.captures_iter(definition) {
        let alias = cap[1].trim().to_string();
        if !seen.contains(&alias) {
            seen.insert(alias.clone());
            results.push(build_column(&alias, None, definition));
        }
    }

    results
}

// ────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────

fn build_column(alias: &str, comment: Option<&str>, definition: &str) -> ParsedColumn {
    let source_expr = extract_source_expression(alias, definition);
    let source_clean = source_expr.as_deref().map(simplify_expression);

    let mut flags: Vec<String> = Vec::new();
    let msg_re = Regex::new(r"(?i)^#?msg[_A-Z]").unwrap();
    if msg_re.is_match(alias) {
        flags.push("has_msg_alias".to_string());
    }
    if comment.is_none() {
        flags.push("no_description".to_string());
    } else {
        flags.push("has_description".to_string());
    }
    if let Some(ref expr) = source_expr {
        if expr.contains('(') || expr.contains(')') {
            flags.push("complex_expression".to_string());
        }
    }

    ParsedColumn {
        alias: alias.to_string(),
        source_expression: source_expr,
        source_column_clean: source_clean,
        description: comment.map(|s| s.to_string()),
        flags,
    }
}

/// Find the source expression for a given alias by looking for `expr AS [alias]`.
fn extract_source_expression(alias: &str, definition: &str) -> Option<String> {
    // Strip comments for cleaner extraction
    let re_block = Regex::new(r"/\*[\s\S]*?\*/").unwrap();
    let re_line = Regex::new(r"--[^\n]*").unwrap();
    let no_comments = re_block.replace_all(definition, " ");
    let no_comments = re_line.replace_all(&no_comments, " ");

    // Escape special regex chars in alias
    let escaped = regex::escape(alias);

    // Try narrow match: word/bracket/operator characters before AS [alias]
    let narrow_pattern = format!(
        r"([\w\[\].(),' +*\-/]+?)\s+(?i)AS\s+\[{}\]",
        escaped
    );
    if let Ok(re) = Regex::new(&narrow_pattern) {
        if let Some(cap) = re.captures(&no_comments) {
            return Some(cap[1].trim().to_string());
        }
    }

    // Try broader match for complex expressions (CASE, ISNULL, etc.)
    let broad_pattern = format!(r"(.{{3,80}}?)\s+(?i)AS\s+\[{}\]", escaped);
    if let Ok(re) = Regex::new(&broad_pattern) {
        if let Some(cap) = re.captures(&no_comments) {
            let mut expr = cap[1].trim().to_string();
            // Trim leading comma from previous column
            if expr.starts_with(',') {
                expr = expr[1..].trim().to_string();
            }
            return Some(expr);
        }
    }

    None
}

/// Simplify a source expression to its core column name where possible.
fn simplify_expression(expr: &str) -> String {
    let trimmed = expr.trim();

    // Simple column ref: [table].[column] or column
    let simple_re = Regex::new(r"^(?:\[?\w+\]?\.)*\[?(\w+)\]?$").unwrap();
    if let Some(cap) = simple_re.captures(trimmed) {
        return cap[1].to_string();
    }

    // ISNULL(expr, default)
    let isnull_re = Regex::new(r"(?i)^ISNULL\s*\(\s*(.+?)\s*,\s*.+\)$").unwrap();
    if let Some(cap) = isnull_re.captures(trimmed) {
        return simplify_expression(&cap[1]);
    }

    // COALESCE(expr, ...)
    let coalesce_re = Regex::new(r"(?i)^COALESCE\s*\(\s*(.+?)\s*,").unwrap();
    if let Some(cap) = coalesce_re.captures(trimmed) {
        return simplify_expression(&cap[1]);
    }

    // CAST(expr AS type)
    let cast_re = Regex::new(r"(?i)^CAST\s*\(\s*(.+?)\s+AS\s+\w+.*\)$").unwrap();
    if let Some(cap) = cast_re.captures(trimmed) {
        return simplify_expression(&cap[1]);
    }

    // CONVERT(type, expr)
    let convert_re =
        Regex::new(r"(?i)^CONVERT\s*\(\s*\w+(?:\([^)]*\))?\s*,\s*(.+?)\s*(?:,\s*\d+\s*)?\)$")
            .unwrap();
    if let Some(cap) = convert_re.captures(trimmed) {
        return simplify_expression(&cap[1]);
    }

    // RTRIM/LTRIM/TRIM
    let trim_re = Regex::new(r"(?i)^[RL]?TRIM\s*\(\s*(.+?)\s*\)$").unwrap();
    if let Some(cap) = trim_re.captures(trimmed) {
        return simplify_expression(&cap[1]);
    }

    // Truncate long expressions
    if trimmed.len() <= 40 {
        trimmed.to_string()
    } else {
        format!("{}...", &trimmed[..37])
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_alias_with_block_comment() {
        let sql = "SELECT col1 AS [MyAlias] /* This is a description */";
        let result = parse_definition(sql);
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].alias, "MyAlias");
        assert_eq!(result[0].description.as_deref(), Some("This is a description"));
    }

    #[test]
    fn parse_alias_with_line_comment() {
        let sql = "SELECT col1 AS [MyAlias] -- Description here";
        let result = parse_definition(sql);
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].alias, "MyAlias");
        assert_eq!(result[0].description.as_deref(), Some("Description here"));
    }

    #[test]
    fn parse_alias_no_comment() {
        let sql = "SELECT col1 AS [MyAlias]";
        let result = parse_definition(sql);
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].alias, "MyAlias");
        assert!(result[0].description.is_none());
        assert!(result[0].flags.contains(&"no_description".to_string()));
    }

    #[test]
    fn simplify_simple_column() {
        assert_eq!(simplify_expression("t.column_name"), "column_name");
        assert_eq!(simplify_expression("[dbo].[MyCol]"), "MyCol");
    }

    #[test]
    fn simplify_isnull() {
        assert_eq!(simplify_expression("ISNULL(t.col, 0)"), "col");
    }

    #[test]
    fn simplify_cast() {
        assert_eq!(simplify_expression("CAST(t.col AS VARCHAR(50))"), "col");
    }

    #[test]
    fn no_duplicates() {
        let sql = "SELECT col1 AS [Dup] /* desc */, col2 AS [Dup]";
        let result = parse_definition(sql);
        assert_eq!(result.len(), 1);
    }
}
