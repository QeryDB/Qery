// PostgreSQL introspection SQL templates.
// All queries return the SAME field names as the MSSQL equivalents
// so the frontend works without changes.

pub const LIST_TABLES_SQL: &str = "
  SELECT
    c.relname AS name,
    n.nspname AS schema,
    s.n_live_tup AS row_count,
    pg_total_relation_size(c.oid) / 1024 AS size_kb,
    NULL::text AS created_at,
    NULL::text AS modified_at
  FROM pg_class c
  JOIN pg_namespace n ON c.relnamespace = n.oid
  LEFT JOIN pg_stat_user_tables s ON s.relid = c.oid
  WHERE c.relkind = 'r'
    AND n.nspname NOT IN ('pg_catalog', 'information_schema')
  ORDER BY n.nspname, c.relname
";

pub const GET_ALL_COLUMNS_SQL: &str = "
  SELECT
    c.table_schema AS schema_name,
    c.table_name,
    c.column_name AS name,
    c.data_type,
    c.character_maximum_length AS max_length,
    c.numeric_precision AS precision,
    c.numeric_scale AS scale,
    CASE WHEN c.is_nullable = 'YES' THEN 1 ELSE 0 END AS is_nullable,
    CASE WHEN pk.column_name IS NOT NULL THEN 1 ELSE 0 END AS is_primary_key,
    CASE WHEN fk.column_name IS NOT NULL THEN 1 ELSE 0 END AS is_foreign_key,
    CASE WHEN c.is_identity = 'YES' OR c.column_default LIKE 'nextval(%' THEN 1 ELSE 0 END AS is_identity,
    c.ordinal_position,
    fk.referenced_table AS fk_table,
    fk.referenced_column AS fk_column
  FROM information_schema.columns c
  LEFT JOIN (
    SELECT kcu.table_schema, kcu.table_name, kcu.column_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    WHERE tc.constraint_type = 'PRIMARY KEY'
  ) pk ON c.table_schema = pk.table_schema AND c.table_name = pk.table_name AND c.column_name = pk.column_name
  LEFT JOIN (
    SELECT
      n.nspname AS table_schema,
      cl.relname AS table_name,
      a.attname AS column_name,
      clf.relname AS referenced_table,
      af.attname AS referenced_column
    FROM pg_constraint con
    JOIN pg_class cl ON cl.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = cl.relnamespace
    JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = ANY(con.conkey)
    JOIN pg_class clf ON clf.oid = con.confrelid
    JOIN pg_attribute af ON af.attrelid = con.confrelid AND af.attnum = ANY(con.confkey)
    WHERE con.contype = 'f'
  ) fk ON c.table_schema = fk.table_schema AND c.table_name = fk.table_name AND c.column_name = fk.column_name
  WHERE c.table_schema NOT IN ('pg_catalog', 'information_schema')
  ORDER BY c.table_schema, c.table_name, c.ordinal_position
";

pub const LIST_VIEWS_SQL: &str = "
  SELECT
    v.table_name AS name,
    v.table_schema AS schema,
    pg_get_viewdef(c.oid, true) AS definition
  FROM information_schema.views v
  JOIN pg_class c ON c.relname = v.table_name
  JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = v.table_schema
  WHERE v.table_schema NOT IN ('pg_catalog', 'information_schema')
  ORDER BY v.table_schema, v.table_name
";

pub const LIST_PROCEDURES_SQL: &str = "
  SELECT
    p.proname AS name,
    n.nspname AS schema,
    NULL::text AS created_at,
    NULL::text AS modified_at
  FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE p.prokind = 'p'
    AND n.nspname NOT IN ('pg_catalog', 'information_schema')
  ORDER BY n.nspname, p.proname
";

pub const LIST_FUNCTIONS_SQL: &str = "
  SELECT
    p.proname AS name,
    n.nspname AS schema,
    CASE
      WHEN p.prorettype = 'pg_catalog.trigger'::regtype THEN 'SQL_TRIGGER_FUNCTION'
      WHEN p.prokind = 'w' THEN 'SQL_WINDOW_FUNCTION'
      WHEN p.proretset THEN 'SQL_TABLE_VALUED_FUNCTION'
      ELSE 'SQL_SCALAR_FUNCTION'
    END AS type,
    NULL::text AS created_at,
    NULL::text AS modified_at
  FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE p.prokind IN ('f', 'w')
    AND n.nspname NOT IN ('pg_catalog', 'information_schema')
  ORDER BY n.nspname, p.proname
";

pub const LIST_MATERIALIZED_VIEWS_SQL: &str = "
  SELECT
    c.relname AS name,
    n.nspname AS schema,
    pg_get_viewdef(c.oid, true) AS definition,
    c.relispopulated AS is_populated,
    pg_total_relation_size(c.oid) / 1024 AS size_kb
  FROM pg_class c
  JOIN pg_namespace n ON c.relnamespace = n.oid
  WHERE c.relkind = 'm'
    AND n.nspname NOT IN ('pg_catalog', 'information_schema')
  ORDER BY n.nspname, c.relname
";

pub const LIST_SEQUENCES_SQL: &str = "
  SELECT
    s.sequence_name AS name,
    s.sequence_schema AS schema,
    s.data_type,
    s.start_value::text AS start_value,
    s.minimum_value::text AS minimum_value,
    s.maximum_value::text AS maximum_value,
    s.increment::text AS increment,
    s.cycle_option
  FROM information_schema.sequences s
  WHERE s.sequence_schema NOT IN ('pg_catalog', 'information_schema')
  ORDER BY s.sequence_schema, s.sequence_name
";

pub const LIST_ENUMS_SQL: &str = "
  SELECT
    t.typname AS name,
    n.nspname AS schema,
    'enum' AS kind,
    array_to_string(array_agg(e.enumlabel ORDER BY e.enumsortorder), ',') AS values
  FROM pg_type t
  JOIN pg_namespace n ON t.typnamespace = n.oid
  JOIN pg_enum e ON e.enumtypid = t.oid
  WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
  GROUP BY t.typname, n.nspname
  ORDER BY n.nspname, t.typname
";

pub const LIST_TRIGGERS_SQL: &str = "
  SELECT
    tg.tgname AS name,
    n.nspname AS schema,
    c.relname AS table_name,
    CASE WHEN tg.tgtype::int & 2 > 0 THEN 'BEFORE' ELSE 'AFTER' END AS timing,
    CASE WHEN tg.tgtype::int & 4 > 0 THEN 1 ELSE 0 END AS on_insert,
    CASE WHEN tg.tgtype::int & 8 > 0 THEN 1 ELSE 0 END AS on_delete,
    CASE WHEN tg.tgtype::int & 16 > 0 THEN 1 ELSE 0 END AS on_update,
    p.proname AS function_name,
    tg.tgenabled AS enabled
  FROM pg_trigger tg
  JOIN pg_class c ON tg.tgrelid = c.oid
  JOIN pg_namespace n ON c.relnamespace = n.oid
  JOIN pg_proc p ON tg.tgfoid = p.oid
  WHERE NOT tg.tgisinternal
    AND n.nspname NOT IN ('pg_catalog', 'information_schema')
  ORDER BY n.nspname, c.relname, tg.tgname
";

// === Per-object detail queries ===

pub fn get_columns_sql(table: &str, schema: &str) -> String {
    format!("
      SELECT
        c.column_name AS name,
        c.data_type,
        c.character_maximum_length AS max_length,
        c.numeric_precision AS precision,
        c.numeric_scale AS scale,
        CASE WHEN c.is_nullable = 'YES' THEN 1 ELSE 0 END AS is_nullable,
        CASE WHEN pk.column_name IS NOT NULL THEN 1 ELSE 0 END AS is_primary_key,
        CASE WHEN fk.column_name IS NOT NULL THEN 1 ELSE 0 END AS is_foreign_key,
        CASE WHEN c.is_identity = 'YES' OR c.column_default LIKE 'nextval(%' THEN 1 ELSE 0 END AS is_identity,
        c.column_default AS default_value,
        c.ordinal_position
      FROM information_schema.columns c
      LEFT JOIN (
        SELECT kcu.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
        WHERE tc.constraint_type = 'PRIMARY KEY'
          AND tc.table_schema = '{schema}' AND tc.table_name = '{table}'
      ) pk ON c.column_name = pk.column_name
      LEFT JOIN (
        SELECT DISTINCT kcu.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND tc.table_schema = '{schema}' AND tc.table_name = '{table}'
      ) fk ON c.column_name = fk.column_name
      WHERE c.table_schema = '{schema}' AND c.table_name = '{table}'
      ORDER BY c.ordinal_position
    ", schema = schema.replace('\'', "''"), table = table.replace('\'', "''"))
}

pub fn get_indexes_sql(table: &str, schema: &str) -> String {
    format!("
      SELECT
        i.relname AS name,
        am.amname AS type,
        CASE WHEN ix.indisunique THEN 1 ELSE 0 END AS is_unique,
        CASE WHEN ix.indisprimary THEN 1 ELSE 0 END AS is_primary_key,
        string_agg(a.attname, ', ' ORDER BY array_position(ix.indkey, a.attnum)) AS columns
      FROM pg_index ix
      JOIN pg_class t ON t.oid = ix.indrelid
      JOIN pg_class i ON i.oid = ix.indexrelid
      JOIN pg_namespace n ON t.relnamespace = n.oid
      JOIN pg_am am ON i.relam = am.oid
      JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
      WHERE n.nspname = '{schema}' AND t.relname = '{table}'
      GROUP BY i.relname, am.amname, ix.indisunique, ix.indisprimary
      ORDER BY i.relname
    ", schema = schema.replace('\'', "''"), table = table.replace('\'', "''"))
}

pub fn get_foreign_keys_sql(table: &str, schema: &str) -> String {
    format!("
      SELECT
        tc.constraint_name AS name,
        kcu.column_name AS column,
        ccu.table_name AS referenced_table,
        ccu.column_name AS referenced_column,
        ccu.table_schema AS referenced_schema,
        rc.delete_rule AS on_delete,
        rc.update_rule AS on_update
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage ccu
        ON tc.constraint_name = ccu.constraint_name AND tc.table_schema = ccu.constraint_schema
      JOIN information_schema.referential_constraints rc
        ON tc.constraint_name = rc.constraint_name AND tc.table_schema = rc.constraint_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = '{schema}' AND tc.table_name = '{table}'
      ORDER BY tc.constraint_name, kcu.ordinal_position
    ", schema = schema.replace('\'', "''"), table = table.replace('\'', "''"))
}

pub fn get_referenced_by_sql(table: &str, schema: &str) -> String {
    format!("
      SELECT
        tc.constraint_name AS name,
        kcu.column_name AS column,
        kcu.table_name AS referencing_table,
        kcu.table_schema AS referencing_schema,
        ccu.column_name AS referenced_column,
        rc.delete_rule AS on_delete,
        rc.update_rule AS on_update
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage ccu
        ON tc.constraint_name = ccu.constraint_name AND tc.table_schema = ccu.constraint_schema
      JOIN information_schema.referential_constraints rc
        ON tc.constraint_name = rc.constraint_name AND tc.table_schema = rc.constraint_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND ccu.table_schema = '{schema}' AND ccu.table_name = '{table}'
      ORDER BY tc.constraint_name
    ", schema = schema.replace('\'', "''"), table = table.replace('\'', "''"))
}

pub fn get_view_columns_sql(view: &str, schema: &str) -> String {
    format!("
      SELECT
        c.column_name AS name,
        c.data_type,
        c.character_maximum_length AS max_length,
        c.numeric_precision AS precision,
        c.numeric_scale AS scale,
        CASE WHEN c.is_nullable = 'YES' THEN 1 ELSE 0 END AS is_nullable,
        c.ordinal_position
      FROM information_schema.columns c
      WHERE c.table_schema = '{schema}' AND c.table_name = '{view}'
      ORDER BY c.ordinal_position
    ", schema = schema.replace('\'', "''"), view = view.replace('\'', "''"))
}

pub fn get_parameters_sql(func: &str, schema: &str) -> String {
    format!("
      SELECT
        COALESCE(p.parameter_name, '$return') AS name,
        p.data_type,
        p.character_maximum_length AS max_length,
        p.numeric_precision AS precision,
        p.numeric_scale AS scale,
        CASE WHEN p.parameter_mode = 'OUT' OR p.parameter_mode = 'INOUT' THEN 1 ELSE 0 END AS is_output,
        0 AS has_default_value,
        NULL::text AS default_value,
        p.ordinal_position
      FROM information_schema.parameters p
      WHERE p.specific_schema = '{schema}'
        AND p.specific_name LIKE '{func}%'
      ORDER BY p.ordinal_position
    ", schema = schema.replace('\'', "''"), func = func.replace('\'', "''"))
}

pub fn get_dependencies_sql(object: &str, schema: &str) -> String {
    format!("
      SELECT DISTINCT
        dep_cl.relname AS name,
        dep_ns.nspname AS schema,
        CASE dep_cl.relkind
          WHEN 'r' THEN 'USER_TABLE'
          WHEN 'v' THEN 'VIEW'
          WHEN 'm' THEN 'MATERIALIZED_VIEW'
          WHEN 'S' THEN 'SEQUENCE'
          ELSE 'OTHER'
        END AS type
      FROM pg_depend d
      JOIN pg_rewrite rw ON d.objid = rw.oid
      JOIN pg_class src ON rw.ev_class = src.oid
      JOIN pg_namespace src_ns ON src.relnamespace = src_ns.oid
      JOIN pg_class dep_cl ON d.refobjid = dep_cl.oid
      JOIN pg_namespace dep_ns ON dep_cl.relnamespace = dep_ns.oid
      WHERE src_ns.nspname = '{schema}' AND src.relname = '{object}'
        AND dep_cl.relname != '{object}'
        AND dep_ns.nspname NOT IN ('pg_catalog', 'information_schema')
      ORDER BY dep_ns.nspname, dep_cl.relname
    ", schema = schema.replace('\'', "''"), object = object.replace('\'', "''"))
}

pub fn get_used_by_sql(object: &str, schema: &str) -> String {
    format!("
      SELECT DISTINCT
        src.relname AS name,
        src_ns.nspname AS schema,
        CASE src.relkind
          WHEN 'r' THEN 'USER_TABLE'
          WHEN 'v' THEN 'VIEW'
          WHEN 'm' THEN 'MATERIALIZED_VIEW'
          ELSE 'OTHER'
        END AS type
      FROM pg_depend d
      JOIN pg_rewrite rw ON d.objid = rw.oid
      JOIN pg_class src ON rw.ev_class = src.oid
      JOIN pg_namespace src_ns ON src.relnamespace = src_ns.oid
      JOIN pg_class dep ON d.refobjid = dep.oid
      JOIN pg_namespace dep_ns ON dep.relnamespace = dep_ns.oid
      WHERE dep_ns.nspname = '{schema}' AND dep.relname = '{object}'
        AND src.relname != '{object}'
        AND src_ns.nspname NOT IN ('pg_catalog', 'information_schema')
      ORDER BY src_ns.nspname, src.relname
    ", schema = schema.replace('\'', "''"), object = object.replace('\'', "''"))
}

pub fn get_definition_sql(object: &str, schema: &str) -> String {
    // Try function/procedure definition first, fallback to view definition
    format!("
      SELECT COALESCE(
        (SELECT pg_get_functiondef(p.oid)
         FROM pg_proc p
         JOIN pg_namespace n ON p.pronamespace = n.oid
         WHERE n.nspname = '{schema}' AND p.proname = '{object}'
         LIMIT 1),
        (SELECT pg_get_viewdef(c.oid, true)
         FROM pg_class c
         JOIN pg_namespace n ON c.relnamespace = n.oid
         WHERE n.nspname = '{schema}' AND c.relname = '{object}' AND c.relkind IN ('v', 'm')
         LIMIT 1)
      ) AS definition
    ", schema = schema.replace('\'', "''"), object = object.replace('\'', "''"))
}

pub fn get_ghost_fk_columns_sql(schema: &str) -> String {
    format!("
      SELECT
        c.table_name,
        c.column_name
      FROM information_schema.columns c
      WHERE c.table_schema = '{schema}'
      ORDER BY c.table_name, c.ordinal_position
    ", schema = schema.replace('\'', "''"))
}

pub fn get_sequence_details_sql(name: &str, schema: &str) -> String {
    format!("
      SELECT
        s.sequence_name AS name,
        s.sequence_schema AS schema,
        s.data_type,
        s.start_value::text AS start_value,
        s.minimum_value::text AS minimum_value,
        s.maximum_value::text AS maximum_value,
        s.increment::text AS increment,
        s.cycle_option,
        ps.last_value::text AS current_value
      FROM information_schema.sequences s
      LEFT JOIN pg_sequences ps
        ON ps.schemaname = s.sequence_schema AND ps.sequencename = s.sequence_name
      WHERE s.sequence_schema = '{schema}' AND s.sequence_name = '{name}'
    ", schema = schema.replace('\'', "''"), name = name.replace('\'', "''"))
}

pub fn get_enum_values_sql(name: &str, schema: &str) -> String {
    format!("
      SELECT
        e.enumlabel AS value,
        e.enumsortorder AS ordinal
      FROM pg_type t
      JOIN pg_namespace n ON t.typnamespace = n.oid
      JOIN pg_enum e ON e.enumtypid = t.oid
      WHERE n.nspname = '{schema}' AND t.typname = '{name}'
      ORDER BY e.enumsortorder
    ", schema = schema.replace('\'', "''"), name = name.replace('\'', "''"))
}

pub fn get_trigger_details_sql(name: &str, _schema: &str) -> String {
    format!("
      SELECT
        tg.tgname AS name,
        n.nspname AS schema,
        c.relname AS table_name,
        CASE WHEN tg.tgtype::int & 2 > 0 THEN 'BEFORE' ELSE 'AFTER' END AS timing,
        CASE WHEN tg.tgtype::int & 4 > 0 THEN 1 ELSE 0 END AS on_insert,
        CASE WHEN tg.tgtype::int & 8 > 0 THEN 1 ELSE 0 END AS on_delete,
        CASE WHEN tg.tgtype::int & 16 > 0 THEN 1 ELSE 0 END AS on_update,
        p.proname AS function_name,
        tg.tgenabled AS enabled,
        pg_get_triggerdef(tg.oid, true) AS definition
      FROM pg_trigger tg
      JOIN pg_class c ON tg.tgrelid = c.oid
      JOIN pg_namespace n ON c.relnamespace = n.oid
      JOIN pg_proc p ON tg.tgfoid = p.oid
      WHERE tg.tgname = '{name}'
        AND NOT tg.tgisinternal
      LIMIT 1
    ", name = name.replace('\'', "''"))
}

pub fn get_matview_info_sql(name: &str, schema: &str) -> String {
    format!("
      SELECT
        c.relname AS name,
        n.nspname AS schema,
        pg_get_viewdef(c.oid, true) AS definition,
        c.relispopulated AS is_populated,
        pg_total_relation_size(c.oid) / 1024 AS size_kb
      FROM pg_class c
      JOIN pg_namespace n ON c.relnamespace = n.oid
      WHERE n.nspname = '{schema}' AND c.relname = '{name}' AND c.relkind = 'm'
    ", schema = schema.replace('\'', "''"), name = name.replace('\'', "''"))
}
