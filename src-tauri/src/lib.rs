pub mod drivers;
pub mod db;
pub mod repositories;
pub mod services;
pub mod commands;
pub mod utils;

use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tauri::Manager;

use crate::services::ghost_fk_service::GhostFKCacheEntry;

/// Shared application state accessible via tauri::State in all commands
pub struct AppState {
    pub db: Mutex<rusqlite::Connection>,
    pub registry: Arc<drivers::registry::DriverRegistry>,
    pub ghost_fk_cache: tokio::sync::RwLock<HashMap<String, GhostFKCacheEntry>>,
    pub active_queries: tokio::sync::Mutex<HashMap<String, tokio::task::AbortHandle>>,
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            // Connections (9)
            commands::connections::list_connections,
            commands::connections::create_connection,
            commands::connections::update_connection,
            commands::connections::delete_connection,
            commands::connections::reorder_connections,
            commands::connections::test_connection,
            commands::connections::discover_servers_simple,
            commands::connections::ping_connection,
            commands::connections::list_databases,
            commands::connections::list_available_drivers,
            // Schema (2)
            commands::schema::get_schema,
            commands::schema::refresh_schema,
            // Query (9)
            commands::query::execute_query,
            commands::query::cancel_query,
            commands::query::explain_query,
            commands::query::estimate_index_size,
            commands::query::get_query_history,
            commands::query::clear_query_history,
            commands::query::list_saved_queries,
            commands::query::create_saved_query,
            commands::query::update_saved_query,
            commands::query::delete_saved_query,
            // Tables (6)
            commands::tables::get_table_details,
            commands::tables::get_table_columns,
            commands::tables::get_table_indexes,
            commands::tables::get_table_foreign_keys,
            commands::tables::get_table_referenced_by,
            commands::tables::get_table_preview,
            // Discovery (4)
            commands::discovery::progressive_discovery,
            commands::discovery::full_discovery,
            commands::discovery::discover_databases,
            commands::discovery::manual_discovery,
            // Relationships (6)
            commands::relationships::get_ghost_fks,
            commands::relationships::get_relationships,
            commands::relationships::create_relationship,
            commands::relationships::dismiss_relationship,
            commands::relationships::undismiss_relationship,
            commands::relationships::delete_relationship,
            commands::relationships::invalidate_ghost_fks,
            // Objects (6)
            commands::objects::get_view_columns,
            commands::objects::get_object_parameters,
            commands::objects::get_object_dependencies,
            commands::objects::get_object_used_by,
            commands::objects::get_object_definition,
            commands::objects::analyze_safety,
            commands::objects::get_object_data,
            commands::objects::execute_object_action,
            // Annotations (3)
            commands::annotations::get_annotations,
            commands::annotations::upsert_annotation,
            commands::annotations::delete_annotation,
            // Descriptions (6)
            commands::descriptions::parse_descriptions,
            commands::descriptions::get_descriptions,
            commands::descriptions::get_description_stats,
            commands::descriptions::get_description_objects,
            commands::descriptions::update_description_status,
            commands::descriptions::bulk_update_description_status,
            // Favorites (3)
            commands::favorites::get_favorites,
            commands::favorites::add_favorite,
            commands::favorites::remove_favorite,
            // Export (2)
            commands::export::export_csv,
            commands::export::export_json,
            // Session State (4)
            commands::session_state::get_session_state,
            commands::session_state::set_session_state,
            commands::session_state::delete_session_state,
            commands::session_state::delete_session_state_prefix,
            // Health (1)
            commands::health::health_check,
        ])
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;
            let data_dir_str = data_dir.to_string_lossy().to_string();

            let sqlite_conn = db::sqlite::init_db(&data_dir_str)
                .expect("Failed to initialize SQLite database");

            let mut registry = drivers::registry::DriverRegistry::new();
            registry.register("mssql", Arc::new(drivers::mssql::driver::MssqlDriver::new()));
            #[cfg(feature = "postgres")]
            registry.register("postgres", Arc::new(drivers::postgres::driver::PostgresDriver::new()));
            #[cfg(feature = "sqlite-backend")]
            registry.register("sqlite", Arc::new(drivers::sqlite::driver::SqliteDriver::new()));
            let registry = Arc::new(registry);

            let app_state = AppState {
                db: Mutex::new(sqlite_conn),
                registry,
                ghost_fk_cache: tokio::sync::RwLock::new(HashMap::new()),
                active_queries: tokio::sync::Mutex::new(HashMap::new()),
            };
            app.manage(app_state);

            #[cfg(target_os = "macos")]
            {
                if let Some(main) = app.get_webview_window("main") {
                    let _ = main.set_decorations(true);
                    if let Ok(Some(monitor)) = main.current_monitor() {
                        let screen = monitor.size();
                        let scale = monitor.scale_factor();
                        let avail_w = screen.width as f64 / scale;
                        let avail_h = (screen.height as f64 / scale) - 100.0;
                        let w = (1400.0_f64).min(avail_w);
                        let h = (900.0_f64).min(avail_h);
                        let _ = main.set_size(tauri::LogicalSize::new(w, h));
                        let _ = main.center();
                    }
                }
            }

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app_handle, _event| {});
}
