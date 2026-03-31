<p align="center">
  <img src="https://qery.app/icon.png" width="80" height="80" alt="Qery" />
</p>

<h1 align="center">Qery</h1>

<p align="center">
  A ~3MB SQL client for MSSQL, PostgreSQL, and SQLite.<br/>
  Desktop + Android. Built with Tauri and Rust.
</p>

<p align="center">
  <a href="https://qery.app/download">Download</a> ·
  <a href="https://qery.app">Website</a> ·
  <a href="https://github.com/QeryDB/Qery/issues">Issues</a>
</p>

---

## What is Qery?

Qery is a lightweight, cross-platform SQL client built for investigating unfamiliar databases. It connects to MSSQL, PostgreSQL, and SQLite — all in a single binary that's ~3MB to download.

It started as a tool for working with legacy ERP databases — thousands of tables, no documentation, no formal foreign keys, relationships that only exist by naming convention. The existing options were either Windows-only (SSMS, ~1GB), required a JVM (DBeaver, 110MB), or got discontinued (Azure Data Studio). So I built my own.

There's also an Android app that connects over your local network or Tailscale.

## Features

**Database Investigation** — Cmd+click (or Ctrl+click) a table name in your SQL code to open its inspection tab in a new tab. Hover any table name for a preview card without leaving your editor. Breadcrumbs track your navigation path so you can go deep and click back to any point. Every object has "Used by" and "Referenced by" tabs — click any entry to continue the trail. The sidebar search filters across all schemas instantly; type a column name and it finds every table containing it, powered by the local SQLite cache.

**Inferred Relationships** — Qery uses a PK-anchored algorithm (similar to SchemaSpy) to discover implicit relationships, even when no formal foreign keys are defined. It matches columns against primary keys using convention patterns (`user_id` → `users.id`), exact PK name matching, and short-prefix stripping — all cross-schema. A relationship canvas shows all connections — real FKs, inferred, and manual ones you add yourself. Views are detected and shown separately. Everything feeds into the autocomplete.

**Full JOIN Autocomplete** — The autocomplete doesn't just suggest table names. It fills the entire JOIN statement with the matching columns. Inferred and manual relationships are both included.

**Procedure & Function Execution** — Qery parses schema definitions for stored procedures, functions, views, and materialized views, then generates execution forms with typed parameter fields. Run them without copy-pasting parameter syntax.

**Quick Search** — Cmd+K opens a search across tables, views, procedures, and favorites. Pinned favorites at the top, shortcut catalog at the bottom.

**Small and Fast** — ~3MB download, under 7MB installed. Tauri uses the OS native webview instead of bundling Chromium. The Rust backend compiles to a single native binary. Opens in under a second.

**Three Databases** — MSSQL (via tiberius, pure Rust TDS driver), PostgreSQL (via tokio-postgres), and SQLite (via rusqlite). No ODBC, no .NET, no JVM.

**MSSQL LAN Discovery** — Finds SQL Server instances on your network automatically via SQL Browser UDP broadcast. No manual IP entry needed on Windows.

**Mobile Over Tailscale** — Android app connects to your database over your local network or Tailscale. Query production from your phone without opening your laptop.

**Data Grid** — Virtual-scrolling grid handles 200k+ rows at ~65MB memory. Inline cell editing with generated SQL. Full-text search with case-sensitive and Turkish character-aware (i/ı) matching. Per-column header filters. Show/hide columns. Fullscreen view. Compact or expanded row heights. Export to CSV, JSON, and Excel.

**Workspace** — VS Code-style tab management: drag-and-drop tab reordering, split panes up to 3 levels (top/bottom/left/right). Keyboard shortcuts (Ctrl+W close, Ctrl+N new tab). Bookmarks and query history.

**Local Schema Caching** — Schema and metadata are cached locally. Browse tables and relationships even when you're offline.

**No Account. No Telemetry.** — No login required. No analytics. No phone home. Your queries and connections stay on your machine.

## Download

| Platform | Download | Size |
|---|---|---|
| Windows | [.exe installer](https://github.com/QeryDB/Qery/releases/latest) | 3.1 MB |
| macOS | [.dmg installer](https://github.com/QeryDB/Qery/releases/latest) | 3.8 MB |
| Android | [Join beta](https://qery.app) | Closed beta |

Windows installer is signed with Microsoft Azure Trusted Signing.

## Screenshots

<!-- Add screenshots here -->
<!-- ![Desktop](https://qery.app/screenshots/desktop.png) -->
<!-- ![Mobile](https://qery.app/screenshots/mobile.png) -->
<!-- ![Ghost FK](https://qery.app/screenshots/ghost-fk.png) -->

## Tech Stack

| Component | Technology |
|---|---|
| Framework | [Tauri](https://tauri.app) (Rust backend, OS native webview) |
| Frontend | React + TypeScript |
| MSSQL driver | [tiberius](https://github.com/prisma/tiberius) (pure Rust TDS) |
| PostgreSQL driver | [tokio-postgres](https://github.com/sfackler/rust-postgres) |
| SQLite driver | [rusqlite](https://github.com/rusqlite/rusqlite) |
| Data grid | Virtual-scrolling grid |
| Relationship canvas | [xyflow](https://github.com/xyflow/xyflow) |
| SQL editor | [CodeMirror](https://codemirror.net) |
| SQL formatting | [sql-formatter](https://github.com/sql-formatter-org/sql-formatter) |
| Tabs | Drag-and-drop ([dnd-kit](https://dndkit.com)), VS Code-style split panes |
| Mobile | Tauri Android |

## Databases

| Database | Status | Driver |
|---|---|---|
| Microsoft SQL Server | ✅ Supported | tiberius |
| PostgreSQL | ✅ Supported | tokio-postgres |
| SQLite | ✅ Supported | rusqlite |
| MySQL / MariaDB | 🔜 Next | sqlx |

## Open Source

The desktop core is being prepared for open source release under the **Apache License 2.0**. Source code will be published in this repository once the ERP-specific parts are separated out. The mobile app is closed source.

## Roadmap

- [ ] MySQL / MariaDB support
- [ ] SSH tunnel connections
- [ ] Open source desktop core (Apache 2.0)
- [ ] iOS app
- [ ] Saved and organized query management
- [ ] Team features (shared connections, query libraries)

## Feedback

This project is in early release. If you find bugs or have feature requests, please [open an issue](https://github.com/QeryDB/Qery/issues).

For general questions or feedback: **hello@qery.app**

## License

Desktop core: Apache License 2.0 (source coming soon)
Mobile app: Closed source
