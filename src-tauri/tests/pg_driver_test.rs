/// Quick integration test for the PostgreSQL driver against a local instance.
/// Run: cargo test --test pg_driver_test --features postgres -- --nocapture

#[cfg(feature = "postgres")]
#[tokio::test]
async fn test_pg_driver() {
    use qery_lib::drivers::traits::{ConnConfig, DatabaseDriver};
    use qery_lib::drivers::postgres::driver::PostgresDriver;
    use std::collections::HashMap;

    let driver = PostgresDriver::new();

    // Build config for local trust-auth connection
    let mut params = HashMap::new();
    params.insert("host".to_string(), "localhost".to_string());
    params.insert("port".to_string(), "5432".to_string());
    params.insert("database".to_string(), "qery_test".to_string());
    params.insert("username".to_string(), "tunaozmen".to_string());
    params.insert("password".to_string(), "".to_string());
    let config = ConnConfig::from_map(params);

    // === Metadata ===
    println!("\n=== METADATA ===");
    println!("Name: {}", driver.name());
    println!("Display: {}", driver.display_name());
    println!("Dialect: {}", driver.dialect());
    println!("Default port: {}", driver.default_port());
    println!("Default schema: {}", driver.default_schema());
    println!("Object types: {}", driver.object_types().len());
    println!("Connection params: {}", driver.connection_params().len());

    // === Test Connection ===
    println!("\n=== TEST CONNECTION ===");
    let result = driver.test_connection(&config).await;
    println!("test_connection: {:?}", result);
    assert!(result.is_ok());
    let version = result.unwrap();
    println!("Version: {}", version["version"].as_str().unwrap_or("?"));

    // === List Databases ===
    println!("\n=== LIST DATABASES ===");
    let dbs = driver.list_databases(&config).await.unwrap();
    println!("Databases: {}", serde_json::to_string_pretty(&dbs).unwrap());

    // === List Objects (all types) ===
    for obj_type in &["table", "view", "materialized_view", "procedure", "function", "sequence", "enum", "trigger"] {
        println!("\n=== LIST {} ===", obj_type.to_uppercase());
        let result = driver.list_objects(&config, obj_type).await;
        match result {
            Ok(val) => {
                let count = val.as_array().map(|a| a.len()).unwrap_or(0);
                println!("{}: {} items", obj_type, count);
                if count > 0 {
                    println!("  First: {}", serde_json::to_string(&val.as_array().unwrap()[0]).unwrap());
                }
            }
            Err(e) => println!("{}: ERROR - {}", obj_type, e),
        }
    }

    // === Get All Columns ===
    println!("\n=== GET ALL COLUMNS ===");
    let cols = driver.get_all_columns(&config).await.unwrap();
    let col_count = cols.as_array().map(|a| a.len()).unwrap_or(0);
    println!("Total columns: {}", col_count);

    // === Table Details ===
    println!("\n=== TABLE COLUMNS (users) ===");
    let user_cols = driver.get_object_data(&config, "table", "users", "public", "columns").await.unwrap();
    println!("{}", serde_json::to_string_pretty(&user_cols).unwrap());

    println!("\n=== TABLE INDEXES (posts) ===");
    let idx = driver.get_object_data(&config, "table", "posts", "public", "indexes").await.unwrap();
    println!("{}", serde_json::to_string_pretty(&idx).unwrap());

    println!("\n=== TABLE FOREIGN KEYS (posts) ===");
    let fks = driver.get_object_data(&config, "table", "posts", "public", "foreign_keys").await.unwrap();
    println!("{}", serde_json::to_string_pretty(&fks).unwrap());

    println!("\n=== TABLE REFERENCED BY (users) ===");
    let refs = driver.get_object_data(&config, "table", "users", "public", "referenced_by").await.unwrap();
    println!("{}", serde_json::to_string_pretty(&refs).unwrap());

    // === View Definition ===
    println!("\n=== VIEW DEFINITION (active_posts) ===");
    let def = driver.get_object_data(&config, "view", "active_posts", "public", "definition").await.unwrap();
    println!("{}", serde_json::to_string_pretty(&def).unwrap());

    // === Function Definition ===
    println!("\n=== FUNCTION DEFINITION (get_user_post_count) ===");
    let fdef = driver.get_object_data(&config, "function", "get_user_post_count", "public", "definition").await.unwrap();
    println!("{}", serde_json::to_string_pretty(&fdef).unwrap());

    // === Sequence Details ===
    println!("\n=== SEQUENCE DETAILS (order_seq) ===");
    let seq = driver.get_object_data(&config, "sequence", "order_seq", "public", "details").await.unwrap();
    println!("{}", serde_json::to_string_pretty(&seq).unwrap());

    // === Enum Values ===
    println!("\n=== ENUM VALUES (mood) ===");
    let enums = driver.get_object_data(&config, "enum", "mood", "public", "values").await.unwrap();
    println!("{}", serde_json::to_string_pretty(&enums).unwrap());

    // === Trigger Details ===
    println!("\n=== TRIGGER DETAILS (trg_users_timestamp) ===");
    let trg = driver.get_object_data(&config, "trigger", "trg_users_timestamp", "public", "details").await.unwrap();
    println!("{}", serde_json::to_string_pretty(&trg).unwrap());

    // === Mat View Details ===
    println!("\n=== MATVIEW DETAILS (post_stats) ===");
    let mv = driver.get_object_data(&config, "materialized_view", "post_stats", "public", "details").await.unwrap();
    println!("{}", serde_json::to_string_pretty(&mv).unwrap());

    // === Data Preview ===
    println!("\n=== DATA PREVIEW (users) ===");
    let data = driver.get_object_data(&config, "table", "users", "public", "data").await.unwrap();
    println!("{}", serde_json::to_string_pretty(&data).unwrap());

    // === Run Query ===
    println!("\n=== RUN QUERY ===");
    let query = driver.run_query(&config, "SELECT 1 + 1 AS result, now() AS time", None).await.unwrap();
    println!("{}", serde_json::to_string_pretty(&query).unwrap());

    // === Execution Plan ===
    println!("\n=== EXECUTION PLAN ===");
    let plan = driver.get_query_plan(&config, "SELECT * FROM users WHERE id = 1").await.unwrap();
    println!("{}", serde_json::to_string_pretty(&plan).unwrap());

    println!("\n=== ALL TESTS PASSED ===");
}
