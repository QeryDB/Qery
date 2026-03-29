use serde::{Deserialize, Serialize};
use serde_json::Value;
use crate::drivers::traits::{ConnConfig, DatabaseDriver};


// ────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────

pub const DISCOVERY_MODE_QUICK: &str = "quick";
pub const DISCOVERY_MODE_EXTENDED: &str = "extended";
pub const DISCOVERY_MODE_FULL: &str = "full";

pub const VERIFICATION_L1: &str = "L1";
pub const VERIFICATION_L2: &str = "L2";
pub const VERIFICATION_L3: &str = "L3";

// ────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveredServer {
    pub id: String,
    pub display_name: String,
    pub hostname: String,
    pub original_hostname: String,
    pub ip: String,
    pub port: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub instance: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
    pub verification_level: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub response_time: Option<i64>,
    pub databases: Vec<String>,
    pub priority: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveryResult {
    pub success: bool,
    pub level: Option<String>,
    pub servers: Vec<DiscoveredServer>,
    pub scan_time: i64,
    pub message: String,
    pub auto_selected: bool,
    pub selected_server: Option<DiscoveredServer>,
    pub recommended_database: Option<String>,
}

pub struct DiscoverOptions {
    pub mode: String,
    pub verification_level: String,
    pub timeout: i64,
    pub include_databases: bool,
    pub auth: String,
    pub username: Option<String>,
    pub password: Option<String>,
    pub target_server: Option<String>,
}

impl Default for DiscoverOptions {
    fn default() -> Self {
        Self {
            mode: DISCOVERY_MODE_EXTENDED.to_string(),
            verification_level: VERIFICATION_L3.to_string(),
            timeout: 5000,
            include_databases: false,
            auth: "integrated".to_string(),
            username: None,
            password: None,
            target_server: None,
        }
    }
}

// ────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────

/// Discover SQL Servers using the driver's discovery capability.
pub async fn discover_sql_servers(
    driver: &dyn DatabaseDriver,
    options: &DiscoverOptions,
) -> Result<Value, String> {
    match options.mode.as_str() {
        DISCOVERY_MODE_QUICK | DISCOVERY_MODE_EXTENDED | DISCOVERY_MODE_FULL => {
            driver.discover_servers(
                options.target_server.as_deref(),
                options.mode == DISCOVERY_MODE_FULL,
                &options.auth,
                options.username.as_deref(),
                options.password.as_deref(),
            )
            .await
        }
        other => Err(format!("Invalid discovery mode: {}", other)),
    }
}

/// Format raw discovery results from the bridge into DiscoveredServer structs.
pub fn format_discovery_results(discovery_result: &Value) -> Vec<DiscoveredServer> {
    let mut servers: Vec<DiscoveredServer> = Vec::new();

    if let Some(endpoint) = discovery_result.get("endpoint").filter(|v| !v.is_null()) {
        servers.push(format_endpoint(endpoint));
    } else if let Some(endpoints) = discovery_result.get("endpoints").and_then(|v| v.as_array()) {
        for ep in endpoints {
            servers.push(format_endpoint(ep));
        }
    } else if let Some(server_list) = discovery_result.get("servers").and_then(|v| v.as_array()) {
        // DiscoverLocalhost response — camelCase fields
        for s in server_list {
            servers.push(DiscoveredServer {
                id: s["id"].as_str().unwrap_or("").to_string(),
                display_name: s["hostname"]
                    .as_str()
                    .or_else(|| s["ip"].as_str())
                    .unwrap_or("")
                    .to_string(),
                hostname: s["hostname"].as_str().unwrap_or("").to_string(),
                original_hostname: s["hostname"].as_str().unwrap_or("").to_string(),
                ip: s["ip"].as_str().unwrap_or("").to_string(),
                port: s["port"].as_i64().unwrap_or(1433),
                instance: s["instance"].as_str().map(|s| s.to_string()),
                version: s["version"].as_str().map(|s| s.to_string()),
                verification_level: "L3".to_string(),
                response_time: s["responseTime"].as_i64(),
                databases: s["databases"]
                    .as_array()
                    .map(|arr| {
                        arr.iter()
                            .filter_map(|v| v.as_str().map(|s| s.to_string()))
                            .collect()
                    })
                    .unwrap_or_default(),
                priority: s["priority"].as_i64().unwrap_or(0),
                error: s["error"].as_str().map(|s| s.to_string()),
            });
        }
    }

    servers.sort_by(|a, b| b.priority.cmp(&a.priority));
    servers
}

fn format_endpoint(ep: &Value) -> DiscoveredServer {
    // Bridge uses explicit [JsonPropertyName] with snake_case
    let hostname = ep["hostname"].as_str().unwrap_or("").to_string();
    let ip = ep["ip"].as_str().unwrap_or("").to_string();
    let port = ep["port"].as_i64().unwrap_or(1433);
    let id = if !ip.is_empty() {
        format!("{}:{}", ip, port)
    } else {
        format!("{}:{}", hostname, port)
    };
    DiscoveredServer {
        id,
        display_name: ep["original_hostname"]
            .as_str()
            .or_else(|| ep["hostname"].as_str())
            .or_else(|| ep["ip"].as_str())
            .unwrap_or("")
            .to_string(),
        hostname: hostname.clone(),
        original_hostname: ep["original_hostname"]
            .as_str()
            .or_else(|| ep["hostname"].as_str())
            .unwrap_or("")
            .to_string(),
        ip,
        port,
        instance: ep["instance"].as_str().map(|s| s.to_string()),
        version: ep["version"].as_str().map(|s| s.to_string()),
        verification_level: ep["verification_level"]
            .as_str()
            .unwrap_or("L3")
            .to_string(),
        response_time: ep["response_time_ms"].as_i64(),
        databases: ep["databases"]
            .as_array()
            .map(|arr| {
                arr.iter()
                    .filter_map(|v| v.as_str().map(|s| s.to_string()))
                    .collect()
            })
            .unwrap_or_default(),
        priority: ep["priority"].as_i64().unwrap_or(0),
        error: ep["error"].as_str().map(|s| s.to_string()),
    }
}

/// Get databases from a specific server.
pub async fn get_databases_from_server(
    driver: &dyn DatabaseDriver,
    config: &ConnConfig,
) -> Result<Value, String> {
    driver.list_databases(config).await
}

/// Progressive 3-step discovery: quick -> extended -> full.
/// Returns after each step if servers are found (or maxLevel is reached).
pub async fn progressive_discovery(
    driver: &dyn DatabaseDriver,
    auth: &str,
    username: Option<&str>,
    password: Option<&str>,
    max_level: &str,     // "quick" | "smart" | "full"
    _filter_mikro: bool,
    progressive: bool,
) -> Result<Value, String> {
    let mut results = DiscoveryResult {
        success: false,
        level: None,
        servers: Vec::new(),
        scan_time: 0,
        message: String::new(),
        auto_selected: false,
        selected_server: None,
        recommended_database: None,
    };

    let start = std::time::Instant::now();
    let mut errors: Vec<String> = Vec::new();

    // Step 1: Quick Local Discovery
    {
        let opts = DiscoverOptions {
            mode: DISCOVERY_MODE_QUICK.to_string(),
            verification_level: VERIFICATION_L3.to_string(),
            timeout: 2000,
            include_databases: true,
            auth: auth.to_string(),
            username: username.map(|s| s.to_string()),
            password: password.map(|s| s.to_string()),
            target_server: None,
        };

        match discover_sql_servers(driver, &opts).await {
            Err(e) => {
                errors.push(format!("Quick: {}", e));
            }
            Ok(local_result) => {
            let servers = format_discovery_results(&local_result);
            if !servers.is_empty() {
                results.level = Some("quick".to_string());
                results.servers = servers;
                results.scan_time = start.elapsed().as_millis() as i64;
                results.success = true;
                results.message = "Local SQL Server found".to_string();

                if results.servers.len() == 1 {
                    results.auto_selected = true;
                    results.selected_server = Some(results.servers[0].clone());
                }

                if progressive || max_level == "quick" {
                    return serde_json::to_value(&results)
                        .map_err(|e| format!("Serialize error: {}", e));
                }
            }
            }
        }
    }

    // Step 2: Smart/Extended Discovery
    if max_level == "smart" || max_level == "full" {
        let opts = DiscoverOptions {
            mode: DISCOVERY_MODE_EXTENDED.to_string(),
            verification_level: VERIFICATION_L3.to_string(),
            timeout: 5000,
            include_databases: true,
            auth: auth.to_string(),
            username: username.map(|s| s.to_string()),
            password: password.map(|s| s.to_string()),
            target_server: None,
        };

        match discover_sql_servers(driver, &opts).await {
            Err(e) => {
                errors.push(format!("Extended: {}", e));
            }
            Ok(smart_result) => {
                let servers = format_discovery_results(&smart_result);
                if !servers.is_empty() {
                    results.level = Some("smart".to_string());
                    results.servers.extend(servers);
                    results.scan_time = start.elapsed().as_millis() as i64;
                    results.success = true;
                    results.message = "SQL Server found (SQL Browser)".to_string();
                }

                if (progressive && !results.servers.is_empty()) || max_level == "smart" {
                    return serde_json::to_value(&results)
                        .map_err(|e| format!("Serialize error: {}", e));
                }
            }
        }
    }

    // Step 3: Full Network
    if max_level == "full" {
        let opts = DiscoverOptions {
            mode: DISCOVERY_MODE_FULL.to_string(),
            verification_level: VERIFICATION_L2.to_string(),
            timeout: 10000,
            include_databases: false,
            auth: auth.to_string(),
            username: username.map(|s| s.to_string()),
            password: password.map(|s| s.to_string()),
            target_server: None,
        };

        match discover_sql_servers(driver, &opts).await {
            Err(e) => {
                errors.push(format!("Full: {}", e));
            }
            Ok(full_result) => {
                let servers = format_discovery_results(&full_result);
                if !servers.is_empty() {
                    results.level = Some("full".to_string());
                    results.servers.extend(servers);
                    results.success = true;
                    results.message = "SQL Server found on network".to_string();
                }
            }
        }
    }

    // Deduplicate servers across discovery levels (quick/extended/full all probe the same targets)
    {
        let mut seen = std::collections::HashSet::new();
        results.servers.retain(|s| seen.insert(s.id.clone()));
    }

    results.scan_time = start.elapsed().as_millis() as i64;
    if !results.success {
        if errors.is_empty() {
            results.message = "No SQL Server found. You can enter details manually.".to_string();
        } else {
            results.message = format!(
                "No SQL Server found. Errors: {}",
                errors.join("; ")
            );
        }
    }

    serde_json::to_value(&results).map_err(|e| format!("Serialize error: {}", e))
}
