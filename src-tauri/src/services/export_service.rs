use serde_json::Value;

/// Convert query result columns and rows to CSV format.
pub fn to_csv(columns: &[Value], rows: &[Value]) -> String {
    let header = columns
        .iter()
        .map(|c| escape_csv(c["name"].as_str().unwrap_or("")))
        .collect::<Vec<_>>()
        .join(",");

    let lines: Vec<String> = rows
        .iter()
        .map(|row| {
            columns
                .iter()
                .map(|c| {
                    let col_name = c["name"].as_str().unwrap_or("");
                    let cell = match &row[col_name] {
                        Value::Null => String::new(),
                        Value::String(s) => s.clone(),
                        Value::Number(n) => n.to_string(),
                        Value::Bool(b) => b.to_string(),
                        other => other.to_string(),
                    };
                    escape_csv(&cell)
                })
                .collect::<Vec<_>>()
                .join(",")
        })
        .collect();

    let mut result = header;
    for line in lines {
        result.push('\n');
        result.push_str(&line);
    }
    result
}

/// Escape a CSV field value: wrap in double quotes if it contains commas, quotes, or newlines.
fn escape_csv(value: &str) -> String {
    if value.contains(',') || value.contains('"') || value.contains('\n') {
        format!("\"{}\"", value.replace('"', "\"\""))
    } else {
        value.to_string()
    }
}

/// Convert rows to pretty-printed JSON.
pub fn to_json(rows: &[Value]) -> String {
    serde_json::to_string_pretty(rows).unwrap_or_else(|_| "[]".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn csv_basic() {
        let columns = vec![
            serde_json::json!({"name": "id", "type": "number"}),
            serde_json::json!({"name": "name", "type": "string"}),
        ];
        let rows = vec![
            serde_json::json!({"id": 1, "name": "Alice"}),
            serde_json::json!({"id": 2, "name": "Bob"}),
        ];
        let csv = to_csv(&columns, &rows);
        assert_eq!(csv, "id,name\n1,Alice\n2,Bob");
    }

    #[test]
    fn csv_escapes_commas() {
        let columns = vec![serde_json::json!({"name": "val"})];
        let rows = vec![serde_json::json!({"val": "a,b"})];
        let csv = to_csv(&columns, &rows);
        assert!(csv.contains("\"a,b\""));
    }

    #[test]
    fn csv_escapes_quotes() {
        let columns = vec![serde_json::json!({"name": "val"})];
        let rows = vec![serde_json::json!({"val": "say \"hello\""})];
        let csv = to_csv(&columns, &rows);
        assert!(csv.contains("\"say \"\"hello\"\"\""));
    }

    #[test]
    fn csv_null_values() {
        let columns = vec![serde_json::json!({"name": "val"})];
        let rows = vec![serde_json::json!({"val": null})];
        let csv = to_csv(&columns, &rows);
        assert_eq!(csv, "val\n");
    }

    #[test]
    fn json_output() {
        let rows = vec![
            serde_json::json!({"id": 1}),
            serde_json::json!({"id": 2}),
        ];
        let json = to_json(&rows);
        assert!(json.contains("\"id\": 1"));
        assert!(json.contains("\"id\": 2"));
    }

    #[test]
    fn json_empty() {
        let json = to_json(&[]);
        assert_eq!(json, "[]");
    }
}
