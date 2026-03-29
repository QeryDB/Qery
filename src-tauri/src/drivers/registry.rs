use std::collections::HashMap;
use std::sync::Arc;
use super::traits::DatabaseDriver;

pub struct DriverRegistry {
    drivers: HashMap<String, Arc<dyn DatabaseDriver>>,
}

impl DriverRegistry {
    pub fn new() -> Self {
        Self { drivers: HashMap::new() }
    }

    pub fn register(&mut self, db_type: &str, driver: Arc<dyn DatabaseDriver>) {
        self.drivers.insert(db_type.to_string(), driver);
    }

    pub fn get(&self, db_type: &str) -> Result<Arc<dyn DatabaseDriver>, String> {
        self.drivers
            .get(db_type)
            .cloned()
            .ok_or_else(|| format!("No driver registered for database type: {}", db_type))
    }

    pub fn list_drivers(&self) -> Vec<serde_json::Value> {
        self.drivers
            .iter()
            .map(|(db_type, driver)| {
                serde_json::json!({
                    "type": db_type,
                    "name": driver.display_name(),
                    "dialect": driver.dialect(),
                    "default_port": driver.default_port(),
                    "default_schema": driver.default_schema(),
                    "default_database": driver.default_database(),
                    "capabilities": driver.capabilities(),
                    "connection_params": driver.connection_params(),
                    "object_types": driver.object_types(),
                })
            })
            .collect()
    }
}
