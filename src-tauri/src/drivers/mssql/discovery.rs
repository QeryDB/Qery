use serde_json::Value;
use std::time::{Duration, Instant};
use tokio::net::{TcpStream, UdpSocket};
use crate::drivers::traits::DatabaseDriver;

/// Discover local SQL Server instances.
/// Returns a JSON array of server objects matching the DiscoveredServer format.
pub async fn discover_local(
    target: Option<&str>,
    auth: &str,
    user: Option<&str>,
    password: Option<&str>,
) -> Vec<Value> {
    let mut servers: Vec<Value> = Vec::new();

    // Build list of targets to probe
    let targets = if let Some(t) = target {
        vec![t.to_string()]
    } else {
        build_local_targets()
    };

    for host in &targets {
        // 1. Try SQL Browser UDP first for instance discovery
        if let Some(browser_servers) = query_sql_browser(host).await {
            for bs in browser_servers {
                let port = bs.port;
                let instance = bs.instance.clone();

                let verified = try_verify_server(
                    host, port, instance.as_deref(), auth, user, password,
                )
                .await;

                let display = if let Some(ref inst) = instance {
                    format!("{}\\{}", host, inst)
                } else {
                    host.clone()
                };

                let id = format!("{}:{}", host, port);

                servers.push(serde_json::json!({
                    "id": id,
                    "hostname": host,
                    "ip": host,
                    "port": port,
                    "instance": instance,
                    "version": verified.version,
                    "responseTime": verified.response_time_ms,
                    "databases": verified.databases,
                    "priority": verified.priority,
                    "verificationLevel": verified.level,
                    "displayName": display,
                    "error": verified.error,
                }));
            }
        }

        // 2. Try direct TCP on port 1433 if we didn't find it via browser
        let already_has_1433 = servers.iter().any(|s| {
            s["port"].as_i64() == Some(1433)
                && (s["hostname"].as_str() == Some(host) || s["ip"].as_str() == Some(host))
        });

        if !already_has_1433 {
            if is_port_open(host, 1433, 1500).await {
                let verified =
                    try_verify_server(host, 1433, None, auth, user, password).await;

                let id = format!("{}:{}", host, 1433);
                servers.push(serde_json::json!({
                    "id": id,
                    "hostname": host,
                    "ip": host,
                    "port": 1433,
                    "instance": Value::Null,
                    "version": verified.version,
                    "responseTime": verified.response_time_ms,
                    "databases": verified.databases,
                    "priority": verified.priority,
                    "verificationLevel": verified.level,
                    "displayName": host,
                    "error": verified.error,
                }));
            }
        }
    }

    // Deduplicate: servers on the same port with the same version are the same
    // physical instance reached via different hostnames (localhost, 127.0.0.1, hostname).
    // Keep the one with best info (instance name, highest priority, most databases).
    dedup_servers(&mut servers);

    // Sort by priority descending
    servers.sort_by(|a, b| {
        let pa = a["priority"].as_i64().unwrap_or(0);
        let pb = b["priority"].as_i64().unwrap_or(0);
        pb.cmp(&pa)
    });

    servers
}

/// Deduplicate servers that are the same physical instance.
/// Two servers are considered identical if they have the same port AND the same
/// version string (or both have no version). We keep the entry with the most
/// information (instance name, most databases, highest priority).
fn dedup_servers(servers: &mut Vec<Value>) {
    if servers.len() <= 1 {
        return;
    }

    // Build a dedup key: (port, version_fingerprint)
    fn dedup_key(s: &Value) -> (i64, String) {
        let port = s["port"].as_i64().unwrap_or(0);
        let version = s["version"].as_str().unwrap_or("").to_string();
        // Use first 60 chars of version as fingerprint (ignore trailing whitespace diffs)
        let fp = version.trim().chars().take(60).collect::<String>();
        (port, fp)
    }

    fn score(s: &Value) -> i64 {
        let mut sc: i64 = 0;
        // Prefer entries with instance name
        if s["instance"].is_string() {
            sc += 100;
        }
        // Prefer entries with more databases
        sc += s["databases"].as_array().map(|a| a.len() as i64).unwrap_or(0);
        // Prefer higher priority
        sc += s["priority"].as_i64().unwrap_or(0);
        // Prefer entries with version info
        if s["version"].is_string() {
            sc += 50;
        }
        sc
    }

    let mut best: std::collections::HashMap<(i64, String), usize> = std::collections::HashMap::new();
    let mut keep = vec![false; servers.len()];

    for (i, s) in servers.iter().enumerate() {
        let key = dedup_key(s);

        // If version is empty, we can't reliably dedup — keep it
        if key.1.is_empty() {
            keep[i] = true;
            continue;
        }

        if let Some(&existing_idx) = best.get(&key) {
            // Compare scores — keep the better one
            if score(s) > score(&servers[existing_idx]) {
                keep[existing_idx] = false;
                keep[i] = true;
                best.insert(key, i);
            }
            // else: existing is better, don't keep this one
        } else {
            keep[i] = true;
            best.insert(key, i);
        }
    }

    let mut i = 0;
    servers.retain(|_| {
        let k = keep[i];
        i += 1;
        k
    });
}

/// Build list of local targets to probe.
fn build_local_targets() -> Vec<String> {
    #[allow(unused_mut)]
    let mut targets = vec![
        "localhost".to_string(),
        "127.0.0.1".to_string(),
    ];

    // Add local hostname (desktop only — requires hostname crate)
    #[cfg(feature = "desktop")]
    if let Ok(hostname) = hostname::get() {
        let h = hostname.to_string_lossy().to_string();
        if !targets.contains(&h) {
            targets.push(h);
        }
    }

    targets
}

struct BrowserResult {
    instance: Option<String>,
    port: u16,
}

/// Query SQL Browser service (UDP 1434) for instance information.
async fn query_sql_browser(host: &str) -> Option<Vec<BrowserResult>> {
    let addr = format!("{}:1434", host);

    let socket = UdpSocket::bind("0.0.0.0:0").await.ok()?;
    socket.send_to(&[0x02], &addr).await.ok()?;

    let mut buf = [0u8; 4096];
    let result = tokio::time::timeout(Duration::from_millis(2000), socket.recv_from(&mut buf)).await;

    let (len, _) = result.ok()?.ok()?;
    if len < 3 {
        return None;
    }

    // Skip first 3 bytes (header)
    let response = String::from_utf8_lossy(&buf[3..len]);
    let mut results = Vec::new();

    // Parse semicolon-delimited response
    // Format: ServerName;X;InstanceName;Y;IsClustered;Z;Version;V;tcp;PORT;;
    for block in response.split(";;") {
        if block.trim().is_empty() {
            continue;
        }
        let parts: Vec<&str> = block.split(';').collect();
        let mut instance_name = None;
        let mut tcp_port = None;

        let mut i = 0;
        while i < parts.len() - 1 {
            match parts[i] {
                "InstanceName" => instance_name = Some(parts[i + 1].to_string()),
                "tcp" => tcp_port = parts[i + 1].parse::<u16>().ok(),
                _ => {}
            }
            i += 2;
        }

        if let Some(port) = tcp_port {
            results.push(BrowserResult {
                instance: instance_name,
                port,
            });
        }
    }

    if results.is_empty() {
        None
    } else {
        Some(results)
    }
}

/// Check if a TCP port is open with timeout.
async fn is_port_open(host: &str, port: u16, timeout_ms: u64) -> bool {
    let addr = format!("{}:{}", host, port);
    tokio::time::timeout(
        Duration::from_millis(timeout_ms),
        TcpStream::connect(&addr),
    )
    .await
    .map(|r| r.is_ok())
    .unwrap_or(false)
}

struct VerifyResult {
    level: String,
    version: Option<String>,
    databases: Vec<String>,
    response_time_ms: Option<i64>,
    priority: i64,
    error: Option<String>,
}

/// Try to verify a server by connecting and running SELECT @@VERSION.
async fn try_verify_server(
    host: &str,
    port: u16,
    instance: Option<&str>,
    auth: &str,
    user: Option<&str>,
    password: Option<&str>,
) -> VerifyResult {
    let start = Instant::now();
    let driver = super::driver::MssqlDriver::new();
    let mut params = std::collections::HashMap::new();
    params.insert("host".to_string(), host.to_string());
    params.insert("port".to_string(), port.to_string());
    params.insert("database".to_string(), "master".to_string());
    params.insert("auth_type".to_string(), auth.to_string());
    if let Some(u) = user {
        params.insert("username".to_string(), u.to_string());
    }
    if let Some(p) = password {
        params.insert("password".to_string(), p.to_string());
    }
    let config = crate::drivers::traits::ConnConfig::from_map(params);

    match driver.test_connection(&config).await {
        Ok(result) => {
            let elapsed = start.elapsed().as_millis() as i64;
            let version = result
                .get("version")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());

            // Try to list databases
            let databases = match driver
                .list_databases(&config)
                .await
            {
                Ok(dbs) => dbs
                    .as_array()
                    .map(|arr| {
                        arr.iter()
                            .filter_map(|v| v.as_str().map(|s| s.to_string()))
                            .collect()
                    })
                    .unwrap_or_default(),
                Err(_) => Vec::new(),
            };

            let priority = if instance.is_some() { 1000 } else { 100 };

            VerifyResult {
                level: "L3".to_string(),
                version,
                databases,
                response_time_ms: Some(elapsed),
                priority,
                error: None,
            }
        }
        Err(e) => {
            let elapsed = start.elapsed().as_millis() as i64;
            VerifyResult {
                level: "L1".to_string(),
                version: None,
                databases: Vec::new(),
                response_time_ms: Some(elapsed),
                priority: 1,
                error: Some(e),
            }
        }
    }
}
