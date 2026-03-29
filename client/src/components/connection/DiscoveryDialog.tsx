import { useState, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  useDiscoverDatabases,
  useProgressiveDiscovery,
  type DatabaseInfo,
  type DiscoveredServer,
} from '@/hooks/useDiscovery';
import { useConnections, useCreateConnection, useAvailableDrivers, type DriverInfo, type ConnectionParamInfo } from '@/hooks/useConnection';
import { useConnectionStore } from '@/stores/connection-store';
import { useUIStore } from '@/stores/ui-store';
import {
  Database, Loader2, XCircle, Monitor, Wifi, PenLine, X,
  ShieldCheck, ChevronRight, HardDrive, KeyRound, ArrowLeft,
} from 'lucide-react';
import { isMac } from '@/lib/utils';
import { WindowControls } from '@/components/layout/WindowControls';

type Mode = 'driver' | 'pick' | 'browse';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  required?: boolean;
}

export function DiscoveryDialog({ open, onOpenChange, required }: Props) {
  const [mode, setMode] = useState<Mode>('driver');
  const [selectedDriver, setSelectedDriver] = useState<DriverInfo | null>(null);
  const [authType, setAuthType] = useState<'integrated' | 'sql'>('integrated');
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [databases, setDatabases] = useState<DatabaseInfo[]>([]);
  const [sourceConnectionId, setSourceConnectionId] = useState<string | null>(null);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [discoveredServers, setDiscoveredServers] = useState<DiscoveredServer[]>([]);
  const [browseSubMode, setBrowseSubMode] = useState<null | 'scan' | 'manual'>(null);

  // Convenience accessors from formValues (backward compat for saved servers etc.)
  const server = formValues['host'] || '';
  const port = formValues['port'] || '1433';
  const username = formValues['username'] || '';
  const password = formValues['password'] || '';
  const setField = (key: string, value: string) => setFormValues(prev => ({ ...prev, [key]: value }));

  const databasesMutation = useDiscoverDatabases();
  const discoveryMutation = useProgressiveDiscovery();
  const createConnectionMutation = useCreateConnection();
  const { data: connections } = useConnections();
  const { data: drivers } = useAvailableDrivers();
  const setActiveConnection = useConnectionStore((s) => s.setActiveConnection);

  const handleSelectDriver = (driver: DriverInfo) => {
    setSelectedDriver(driver);
    // Initialize form with default values from connection_params
    const defaults: Record<string, string> = {};
    for (const p of driver.connection_params || []) {
      if (p.default_value) defaults[p.key] = p.default_value;
    }
    setFormValues(defaults);
    if (driver.capabilities?.supports_windows_auth) {
      setMode('pick');
    } else {
      setAuthType('sql');
      setMode('browse');
    }
  };

  // Tauri native drag-and-drop: listen for file drag/drop when dialog is open
  useEffect(() => {
    if (!open) return;
    const unlisteners: (() => void)[] = [];
    import('@tauri-apps/api/event').then(({ listen }) => {
      listen<{ paths: string[] }>('tauri://drag-over', () => {
        setIsDraggingFile(true);
      }).then(fn => unlisteners.push(fn));

      listen('tauri://drag-leave', () => {
        setIsDraggingFile(false);
      }).then(fn => unlisteners.push(fn));

      listen<{ paths: string[] }>('tauri://drag-drop', (event) => {
        setIsDraggingFile(false);
        const paths = event.payload.paths || [];
        const sqliteFile = paths.find((p: string) => /\.(db|sqlite|sqlite3)$/i.test(p));
        if (sqliteFile) {
          const sqliteDriver = drivers?.find(d => d.type === 'sqlite');
          if (sqliteDriver && selectedDriver?.type !== 'sqlite') {
            handleSelectDriver(sqliteDriver);
          }
          setField('file_path', sqliteFile);
        }
      }).then(fn => unlisteners.push(fn));
    });
    return () => { unlisteners.forEach(fn => fn()); };
  }, [open, drivers, selectedDriver]);

  // Unique saved servers (deduplicated by server:port), matching current driver type + authType
  const savedServers = useMemo(() => {
    if (!connections) return [];
    const driverType = selectedDriver?.type || 'mssql';
    const seen = new Set<string>();
    return connections
      .filter((c) => {
        const connType = c.database_type || 'mssql';
        return connType === driverType && c.auth_type === authType;
      })
      .sort((a, b) => (b.last_connected_at ?? '').localeCompare(a.last_connected_at ?? ''))
      .filter((c) => {
        const key = `${c.server}:${c.port}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }, [connections, authType, selectedDriver]);

  const handlePickWindows = () => {
    setAuthType('integrated');
    setMode('browse');
  };

  const handlePickSql = () => {
    setAuthType('sql');
    setMode('browse');
  };


  const handlePickServer = async (c: typeof savedServers[number]) => {
    setFormValues(prev => ({
      ...prev,
      host: c.server,
      port: String(c.port),
      ...(c.username ? { username: c.username } : {}),
    }));
    setSourceConnectionId(c.id);
    setDatabases([]);
    try {
      const result = await databasesMutation.mutateAsync({
        connection_id: c.id,
        filterAll: false,
      });
      if (result.success) {
        setDatabases(result.databases);
      }
    } catch {
      // error shown via mutation state
    }
  };

  const handleDiscover = async () => {
    try {
      const result = await discoveryMutation.mutateAsync({
        auth: authType === 'integrated' ? 'integrated' : 'sql',
        username: authType === 'sql' ? username : undefined,
        password: authType === 'sql' ? password : undefined,
        filterAll: false,
        progressive: true,
      });
      if (result.servers?.length) {
        setDiscoveredServers(result.servers);
      }
    } catch {
      // error shown via mutation state
    }
  };

  const handlePickDiscoveredServer = async (s: DiscoveredServer) => {
    setFormValues(prev => ({
      ...prev,
      host: s.hostname || s.ip,
      port: String(s.port),
    }));
    setSourceConnectionId(null);
    setDatabases([]);
    try {
      const result = await databasesMutation.mutateAsync({
        server: s.hostname || s.ip,
        port: s.port,
        database_type: 'mssql',
        auth: authType === 'integrated' ? 'integrated' : 'sql',
        username: authType === 'sql' ? username : undefined,
        password: authType === 'sql' ? password : undefined,
        filterAll: false,
      });
      if (result.success) {
        setDatabases(result.databases);
      }
    } catch {
      // error shown via mutation state
    }
  };

  const needsPassword = selectedDriver?.capabilities?.supports_windows_auth && authType === 'sql';
  const isFileDriver = !!formValues['file_path'] && !selectedDriver?.capabilities?.supports_multiple_databases;
  const canConnect = (isFileDriver || server.trim()) && (
    isFileDriver || authType === 'integrated' || !!username || (needsPassword && !!password)
  );

  const handleConnect = async () => {
    if (!canConnect) return;

    // SQLite: no database selection — file IS the database, create connection directly
    if (selectedDriver && !selectedDriver.capabilities?.supports_multiple_databases) {
      try {
        const filePath = formValues['file_path'] || '';
        const fileName = filePath.split('/').pop()?.split('\\').pop() || 'database';
        const conn = await createConnectionMutation.mutateAsync({
          name: fileName,
          server: filePath,
          port: 0,
          database_name: fileName,
          database_type: selectedDriver.type,
        });
        setActiveConnection(conn.id, fileName, selectedDriver.type);
        useUIStore.setState({ activeSidebarPanel: 'schema', sidebarOpen: true });
        onOpenChange(false);
        resetState();
      } catch {
        // handled by mutation state
      }
      return;
    }

    setSourceConnectionId(null);
    setDatabases([]);
    try {
      const defaultPort = selectedDriver?.default_port || 1433;
      const usesCredentials = !selectedDriver?.capabilities?.supports_windows_auth || authType === 'sql';
      const result = await databasesMutation.mutateAsync({
        server: server.trim(),
        port: parseInt(port) || defaultPort,
        database_type: selectedDriver?.type || 'mssql',
        auth: usesCredentials ? 'sql' : authType,
        username: usesCredentials ? username : undefined,
        password: usesCredentials ? password : undefined,
        filterAll: false,
      });
      if (result.success) {
        setDatabases(result.databases);
      }
    } catch {
      // handled by mutation state
    }
  };

  const handleSelectDatabase = async (db: DatabaseInfo) => {
    const serverAddr = server.trim();
    const portNum = parseInt(port) || 1433;
    // Display name: use host part only for cleaner labels
    const displayHost = serverAddr.includes('\\') ? serverAddr.split('\\')[0] : serverAddr;
    const conn = await createConnectionMutation.mutateAsync({
      name: `${displayHost} / ${db.displayName}`,
      server: serverAddr,
      port: portNum,
      database_name: db.name,
      database_type: selectedDriver?.type || 'mssql',
      auth_type: authType,
      username: authType === 'sql' ? username : undefined,
      password: authType === 'sql' ? password : undefined,
      source_connection_id: sourceConnectionId || undefined,
    });
    setActiveConnection(conn.id, db.name, selectedDriver?.type || 'mssql');
    useUIStore.setState({ activeSidebarPanel: 'schema', sidebarOpen: true });
    onOpenChange(false);
    resetState();
  };

  const resetState = () => {
    setMode('driver');
    setSelectedDriver(null);
    setFormValues({});
    setDatabases([]);
    setSourceConnectionId(null);
    setDiscoveredServers([]);
    setBrowseSubMode(null);
    databasesMutation.reset();
    discoveryMutation.reset();
  };


  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && canConnect) handleConnect();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && required) return; onOpenChange(v); if (!v) resetState(); }}>
      <DialogContent
        className="sm:max-w-[440px] p-0 gap-0 overflow-hidden"
        onEscapeKeyDown={required ? (e) => e.preventDefault() : undefined}
        onPointerDownOutside={required ? (e) => e.preventDefault() : undefined}
        {...(required ? { hideCloseButton: true } : {})}
      >
        {/* Drag overlay */}
        {isDraggingFile && (
          <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-background/90 backdrop-blur-sm rounded-lg border-2 border-dashed border-primary">
            <Database className="h-10 w-10 text-primary mb-3 animate-bounce" />
            <p className="text-sm font-medium text-primary">Drop SQLite file to open</p>
            <p className="text-xs text-muted-foreground mt-1">.db, .sqlite, .sqlite3</p>
          </div>
        )}

        {/* Floating window controls for Windows when dialog is required (no close button) */}
        {required && !isMac && (
          <div className="absolute top-2 right-2 z-50">
            <WindowControls showMaximize={false} />
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════ */}
        {/* MODE: DRIVER — Database type selection                  */}
        {/* ═══════════════════════════════════════════════════════ */}
        {mode === 'driver' && (
          <>
            <div className="px-6 pt-6 pb-2">
              <div className="flex items-center gap-2.5 mb-1">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                  <HardDrive className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold">Add Connection</h2>
                  <p className="text-[11px] text-muted-foreground">Choose your database type</p>
                </div>
              </div>
            </div>

            <div className="px-6 pb-5 space-y-2">
              {(drivers || []).map((driver) => {
                const iconPath = `/icons/${driver.type === 'postgres' ? 'pg' : driver.type}.svg`;
                const subtitle = driver.type === 'sqlite'
                  ? 'Local file database'
                  : `Default port: ${driver.default_port}`;
                return (
                  <button
                    key={driver.type}
                    onClick={() => handleSelectDriver(driver)}
                    className="w-full flex items-center gap-3.5 rounded-xl border p-4 text-left transition-all hover:bg-accent hover:border-primary/30 cursor-pointer"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                      <img src={iconPath} alt={driver.name} className="h-6 w-6" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{driver.name}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{subtitle}</p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground/40 shrink-0" />
                  </button>
                );
              })}
            </div>
          </>
        )}

        {/* ═══════════════════════════════════════════════════════ */}
        {/* MODE: PICK — Auth method selection (MSSQL only)        */}
        {/* ═══════════════════════════════════════════════════════ */}
        {mode === 'pick' && (
          <>
            <div className="px-6 pt-6 pb-2">
              <div className="flex items-center gap-2.5 mb-1">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                  <HardDrive className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold">Add Connection</h2>
                  <p className="text-[11px] text-muted-foreground">How would you like to connect?</p>
                </div>
              </div>
            </div>

            <div className="px-6 pb-5 space-y-2">
              {/* Windows Auth — highlighted on Windows */}
              <button
                disabled={isMac}
                onClick={handlePickWindows}
                className={`w-full flex items-center gap-3.5 rounded-xl border p-4 text-left transition-all ${
                  isMac
                    ? 'opacity-35 cursor-not-allowed'
                    : 'border-primary/40 bg-primary/[0.03] hover:bg-primary/[0.07] shadow-sm cursor-pointer'
                }`}
              >
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${isMac ? 'bg-muted' : 'bg-primary/10'}`}>
                  <ShieldCheck className={`h-5 w-5 ${isMac ? 'text-muted-foreground' : 'text-primary'}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">Windows Authentication</p>
                    {!isMac && (
                      <span className="text-[9px] font-medium text-primary bg-primary/10 px-1.5 py-0.5 rounded">Recommended</span>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {isMac
                      ? 'Only available on Windows'
                      : 'No password needed — connect automatically with your Windows session'}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground/40 shrink-0" />
              </button>

              {/* SQL Auth — highlighted on macOS */}
              <button
                onClick={handlePickSql}
                className={`w-full flex items-center gap-3.5 rounded-xl border p-4 text-left transition-all cursor-pointer ${
                  isMac
                    ? 'border-primary/40 bg-primary/[0.03] hover:bg-primary/[0.07] shadow-sm'
                    : 'hover:bg-accent hover:border-border'
                }`}
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-orange-500/10">
                  <KeyRound className="h-5 w-5 text-orange-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">Username & Password</p>
                    {isMac && (
                      <span className="text-[9px] font-medium text-primary bg-primary/10 px-1.5 py-0.5 rounded">Recommended</span>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Connect with SQL Server username and password
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground/40 shrink-0" />
              </button>

            </div>

            {/* Hint */}
            <div className="px-6 pb-5">
              <div className="flex gap-2 items-start rounded-lg bg-muted/50 px-3 py-2.5 text-[11px] text-muted-foreground leading-relaxed">
                <span className="shrink-0 mt-px">💡</span>
                <span>
                  {isMac
                    ? 'macOS requires username and password to connect to SQL Server.'
                    : 'For SQL Server on the same machine or local network, Windows Authentication is the easiest method.'}
                </span>
              </div>
            </div>

          </>
        )}

        {/* ═══════════════════════════════════════════════════════ */}
        {/* MODE: BROWSE — Server form + database picker            */}
        {/* ═══════════════════════════════════════════════════════ */}
        {mode === 'browse' && (
          <>
            {/* Header */}
            <div className="flex items-center gap-2 px-4 py-3 border-b bg-muted/20">
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => { setDatabases([]); setMode('driver'); setSelectedDriver(null); }}>
                <ArrowLeft className="h-3.5 w-3.5" />
              </Button>
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 shrink-0">
                  <HardDrive className="h-3 w-3 text-primary" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-xs font-semibold leading-tight">
                    {selectedDriver?.name || 'SQL Server'}{authType === 'integrated' ? ' — Windows Auth' : ''}
                  </h2>
                  <p className="text-[10px] text-muted-foreground truncate">Enter server details</p>
                </div>
              </div>
            </div>

            {/* Connection form + database list */}
            {databases.length === 0 ? (
              /* ── Server form ── */
              <div className="px-5 py-4 space-y-3">
                {/* Saved servers */}
                {savedServers.length > 0 && (
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-medium text-muted-foreground">Recent Servers</label>
                    <div className="space-y-0.5">
                      {savedServers.slice(0, 4).map((c) => (
                        <button
                          key={`${c.server}:${c.port}`}
                          className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left hover:bg-accent transition-colors group"
                          onClick={() => handlePickServer(c)}
                        >
                          <Monitor className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span className="text-xs font-medium truncate flex-1">{c.server}</span>
                          <span className="text-[10px] text-muted-foreground shrink-0">:{c.port}</span>
                          {c.username && (
                            <span className="text-[10px] text-muted-foreground/60 truncate max-w-[80px]">{c.username}</span>
                          )}
                          <ChevronRight className="h-3 w-3 text-muted-foreground/20 group-hover:text-muted-foreground shrink-0" />
                        </button>
                      ))}
                    </div>
                    <div className="border-b" />
                  </div>
                )}

                {/* ── MSSQL browse flow ── */}
                {selectedDriver?.type === 'mssql' && (
                  <>
                    {/* SQL Auth: credentials always visible at top */}
                    {authType === 'sql' && browseSubMode !== 'scan' && (
                      <div className="space-y-2">
                        <div className="flex-1 space-y-1">
                          <label className="text-[11px] font-medium text-muted-foreground">Username</label>
                          <Input
                            placeholder="sa"
                            value={username}
                            onChange={(e) => setField('username', e.target.value)}
                            className="h-8 text-xs"
                            autoFocus
                          />
                        </div>
                        <div className="flex-1 space-y-1">
                          <label className="text-[11px] font-medium text-muted-foreground">Password</label>
                          <Input
                            type="password"
                            value={password}
                            onChange={(e) => setField('password', e.target.value)}
                            onKeyDown={handleKeyDown}
                            className="h-8 text-xs"
                          />
                        </div>
                        <div className="border-b" />
                      </div>
                    )}

                    {/* Two big buttons: Scan / Manual */}
                    {browseSubMode === null && (
                      <div className="space-y-2">
                        <button
                          onClick={() => { setBrowseSubMode('scan'); handleDiscover(); }}
                          disabled={authType === 'sql' && (!username || !password)}
                          className="w-full flex items-center gap-3.5 rounded-xl border border-primary/40 bg-primary/[0.03] p-4 text-left transition-all hover:bg-primary/[0.07] shadow-sm cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-primary/[0.03]"
                        >
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                            <Wifi className="h-5 w-5 text-primary" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium">Scan Network</p>
                            <p className="text-[11px] text-muted-foreground mt-0.5">Auto-discover SQL Servers on your network</p>
                          </div>
                          <ChevronRight className="h-4 w-4 text-muted-foreground/40 shrink-0" />
                        </button>
                        <button
                          onClick={() => setBrowseSubMode('manual')}
                          className="w-full flex items-center gap-3.5 rounded-xl border p-4 text-left transition-all hover:bg-accent hover:border-border cursor-pointer"
                        >
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                            <PenLine className="h-5 w-5 text-muted-foreground" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium">Enter Manually</p>
                            <p className="text-[11px] text-muted-foreground mt-0.5">Type server address and port</p>
                          </div>
                          <ChevronRight className="h-4 w-4 text-muted-foreground/40 shrink-0" />
                        </button>
                      </div>
                    )}

                    {/* Scan results */}
                    {browseSubMode === 'scan' && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="text-[11px] font-medium text-muted-foreground">Discovered Servers</label>
                          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setBrowseSubMode(null); setDiscoveredServers([]); discoveryMutation.reset(); }}>
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                        {discoveryMutation.isPending && (
                          <div className="flex items-center justify-center gap-2 py-6">
                            <Loader2 className="h-4 w-4 animate-spin text-primary" />
                            <span className="text-xs text-muted-foreground">Scanning network...</span>
                          </div>
                        )}
                        {discoveredServers.length > 0 && (
                          <div className="space-y-0.5">
                            {discoveredServers.map((s) => (
                              <button
                                key={s.id}
                                className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left hover:bg-accent transition-colors group"
                                onClick={() => handlePickDiscoveredServer(s)}
                              >
                                <Monitor className="h-3.5 w-3.5 text-green-500 shrink-0" />
                                <span className="text-xs font-medium truncate flex-1">{s.displayName}</span>
                                <span className="text-[10px] text-muted-foreground shrink-0">:{s.port}</span>
                                {s.version && (
                                  <span className="text-[10px] text-muted-foreground/60 truncate max-w-[80px]">{s.version}</span>
                                )}
                                <ChevronRight className="h-3 w-3 text-muted-foreground/20 group-hover:text-muted-foreground shrink-0" />
                              </button>
                            ))}
                          </div>
                        )}
                        {discoveryMutation.isError && (
                          <div className="flex items-start gap-2 rounded-lg bg-destructive/5 border border-destructive/20 px-3 py-2 text-[11px] text-destructive">
                            <XCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                            <span>{(discoveryMutation.error as Error).message}</span>
                          </div>
                        )}
                        {!discoveryMutation.isPending && discoveredServers.length === 0 && discoveryMutation.isSuccess && (
                          <p className="text-[10px] text-muted-foreground text-center py-4">No servers found on the network</p>
                        )}
                      </div>
                    )}

                    {/* Manual: just host + port */}
                    {browseSubMode === 'manual' && (
                      <>
                        <div className="flex items-center justify-between">
                          <label className="text-[11px] font-medium text-muted-foreground">Server Details</label>
                          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setBrowseSubMode(null); databasesMutation.reset(); }}>
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                        <div className="flex gap-2">
                          <div className="flex-1 space-y-1">
                            <label className="text-[11px] font-medium text-muted-foreground">Server</label>
                            <Input
                              placeholder="hostname or IP"
                              value={server}
                              onChange={(e) => setField('host', e.target.value)}
                              onKeyDown={handleKeyDown}
                              className="h-8 text-xs"
                              autoFocus
                            />
                          </div>
                          <div className="w-20 space-y-1">
                            <label className="text-[11px] font-medium text-muted-foreground">Port</label>
                            <Input
                              type="number"
                              value={port}
                              onChange={(e) => setField('port', e.target.value)}
                              onKeyDown={handleKeyDown}
                              className="h-8 text-xs"
                            />
                          </div>
                        </div>

                        {databasesMutation.isError && (
                          <div className="flex items-start gap-2 rounded-lg bg-destructive/5 border border-destructive/20 px-3 py-2 text-[11px] text-destructive">
                            <XCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                            <span>{(databasesMutation.error as Error).message}</span>
                          </div>
                        )}

                        <Button
                          className="w-full h-8 text-xs"
                          onClick={handleConnect}
                          disabled={!server.trim() || (authType === 'sql' && (!username || !password)) || databasesMutation.isPending}
                        >
                          {databasesMutation.isPending ? (
                            <>
                              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                              Connecting...
                            </>
                          ) : (
                            'Connect'
                          )}
                        </Button>
                      </>
                    )}
                  </>
                )}

                {/* ── Non-MSSQL: standard dynamic form ── */}
                {selectedDriver?.type !== 'mssql' && (
                  <>
                    {/* Dynamic form fields from driver connection_params */}
                    {(() => {
                      const params = (selectedDriver?.connection_params || [])
                        .filter(p => {
                          if (p.key === 'auth_type') return false;
                          if (authType === 'integrated' && (p.key === 'username' || p.key === 'password')) return false;
                          return true;
                        })
                        .sort((a, b) => a.order - b.order);

                      const connectionParams = params.filter(p => p.group === 'connection');
                      const authParams = params.filter(p => p.group === 'auth');
                      const securityParams = params.filter(p => p.group === 'security');

                      const renderParam = (p: ConnectionParamInfo, autoFocus = false) => {
                        if (p.param_type.type === 'FilePath') {
                          const fileName = formValues[p.key] ? formValues[p.key].split('/').pop()?.split('\\').pop() : '';
                          return (
                            <div key={p.key} className="space-y-1.5">
                              <label className="text-[11px] font-medium text-muted-foreground">{p.label}</label>
                              <div
                                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                                onDrop={async (e) => {
                                  e.preventDefault();
                                }}
                                className={`rounded-lg border-2 border-dashed p-6 text-center transition-all duration-200 ${isDraggingFile ? 'border-primary bg-primary/10 scale-[1.02]' : 'border-border hover:border-primary/40'}`}
                              >
                                {formValues[p.key] ? (
                                  <div className="flex items-center gap-2">
                                    <Database className="h-4 w-4 text-primary shrink-0" />
                                    <span className="text-xs font-medium truncate flex-1 text-left" title={formValues[p.key]}>{fileName}</span>
                                    <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px]" onClick={() => setField(p.key, '')}>Change</Button>
                                  </div>
                                ) : (
                                  <div className="space-y-1.5">
                                    <p className="text-xs text-muted-foreground">Drop a file here or</p>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="h-7 text-xs"
                                      onClick={async () => {
                                        try {
                                          const { open } = await import('@tauri-apps/plugin-dialog');
                                          const extensions = (p.param_type as any).options?.map((o: any) => typeof o === 'string' ? o : o.value) || ['db', 'sqlite', 'sqlite3'];
                                          const path = await open({ filters: [{ name: 'SQLite Database', extensions }], multiple: false });
                                          if (path) setField(p.key, path as string);
                                        } catch (err) {
                                          console.error('File picker error:', err);
                                        }
                                      }}
                                    >
                                      Browse...
                                    </Button>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        }
                        if (p.param_type.type === 'Toggle') {
                          return (
                            <div key={p.key} className="flex items-center gap-2 py-1">
                              <input
                                type="checkbox"
                                checked={formValues[p.key] === 'true'}
                                onChange={(e) => setField(p.key, e.target.checked ? 'true' : 'false')}
                                className="h-3.5 w-3.5 rounded border-input"
                              />
                              <label className="text-[11px] font-medium text-muted-foreground">{p.label}</label>
                            </div>
                          );
                        }
                        if (p.param_type.type === 'Select' && p.param_type.options) {
                          return (
                            <div key={p.key} className="space-y-1">
                              <label className="text-[11px] font-medium text-muted-foreground">{p.label}</label>
                              <select
                                value={formValues[p.key] || p.default_value || ''}
                                onChange={(e) => setField(p.key, e.target.value)}
                                className="flex h-8 w-full rounded-md border border-input bg-background px-3 text-xs"
                              >
                                {p.param_type.options.map(opt => (
                                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                              </select>
                            </div>
                          );
                        }
                        return (
                          <div key={p.key} className={p.key === 'port' ? 'w-20 space-y-1' : 'flex-1 space-y-1'}>
                            <label className="text-[11px] font-medium text-muted-foreground">{p.label}</label>
                            <Input
                              type={p.param_type.type === 'Password' ? 'password' : p.param_type.type === 'Number' ? 'number' : 'text'}
                              placeholder={p.placeholder || ''}
                              value={formValues[p.key] || ''}
                              onChange={(e) => setField(p.key, e.target.value)}
                              onKeyDown={handleKeyDown}
                              className="h-8 text-xs"
                              autoFocus={autoFocus}
                            />
                          </div>
                        );
                      };

                      return (
                        <>
                          {connectionParams.length > 0 && (() => {
                            const inlineParams = connectionParams.filter(p => p.param_type.type === 'Text' || p.param_type.type === 'Number');
                            const blockParams = connectionParams.filter(p => p.param_type.type !== 'Text' && p.param_type.type !== 'Number');
                            return (
                              <>
                                {blockParams.map((p, i) => renderParam(p, i === 0 && inlineParams.length === 0))}
                                {inlineParams.length > 0 && (
                                  <div className="flex gap-2">
                                    {inlineParams.map((p, i) => renderParam(p, i === 0))}
                                  </div>
                                )}
                              </>
                            );
                          })()}
                          {authParams.length > 0 && (
                            <div className="space-y-2">
                              {authParams.map(p => renderParam(p))}
                            </div>
                          )}
                          {securityParams.length > 0 && (
                            <div className="space-y-2">
                              {securityParams.map(p => renderParam(p))}
                            </div>
                          )}
                        </>
                      );
                    })()}

                    {databasesMutation.isError && (
                      <div className="flex items-start gap-2 rounded-lg bg-destructive/5 border border-destructive/20 px-3 py-2 text-[11px] text-destructive">
                        <XCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                        <span>{(databasesMutation.error as Error).message}</span>
                      </div>
                    )}

                    <Button
                      className="w-full h-8 text-xs"
                      onClick={handleConnect}
                      disabled={!canConnect || databasesMutation.isPending}
                    >
                      {databasesMutation.isPending ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                          Connecting...
                        </>
                      ) : (
                        'Connect'
                      )}
                    </Button>
                  </>
                )}
              </div>
            ) : (
              /* ── Database list ── */
              <div className="flex flex-col" style={{ maxHeight: '380px' }}>
                {/* Database header */}
                <div className="flex items-center justify-between px-3 py-2 border-b">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Databases</span>
                    <Badge variant="secondary" className="text-[10px] h-4 px-1.5 font-normal truncate max-w-[200px]">
                      {server.trim()}:{port}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {databases.length > 0 && (
                      <span className="text-[10px] text-muted-foreground">{databases.length} DB</span>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-[10px] px-2"
                      onClick={() => setDatabases([])}
                    >
                      Change
                    </Button>
                  </div>
                </div>

                <ScrollArea className="flex-1">
                  <div className="p-1.5 space-y-0.5">
                    {databases.map((db) => (
                      <button
                        key={db.name}
                        className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left hover:bg-accent transition-colors group"
                        onClick={() => handleSelectDatabase(db)}
                        disabled={createConnectionMutation.isPending}
                      >
                        <Database className="h-4 w-4 text-primary shrink-0" />
                        <div className="flex-1 min-w-0">
                          <span className="text-xs font-medium block truncate">{db.displayName}</span>
                          {db.displayName !== db.name && (
                            <span className="text-[10px] text-muted-foreground truncate block">{db.name}</span>
                          )}
                        </div>
                        <ChevronRight className="h-3 w-3 text-muted-foreground/30 group-hover:text-muted-foreground shrink-0" />
                      </button>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            )}

            {/* Creating state */}
            {createConnectionMutation.isPending && (
              <div className="flex items-center justify-center gap-2 border-t px-4 py-2.5 bg-primary/5">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                <span className="text-xs text-primary font-medium">Creating connection...</span>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
