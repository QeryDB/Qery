export interface Connection {
  id: string;
  name: string;
  server: string;
  port: number;
  database_name?: string;
  database_type?: string;
  auth_type: 'integrated' | 'sql';
  username?: string;
  color?: string;
  is_favorite: boolean | number;
  last_connected_at?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateConnectionInput {
  name: string;
  server: string;
  port?: number;
  database_name?: string;
  database_type?: string;
  auth_type?: 'integrated' | 'sql';
  username?: string;
  password?: string;
  color?: string;
  is_favorite?: boolean;
  source_connection_id?: string;
}

export interface TestConnectionInput {
  server: string;
  port?: number;
  database_name?: string;
  auth_type?: 'integrated' | 'sql';
  username?: string;
  password?: string;
}

export interface TestConnectionResult {
  ok: boolean;
  message: string;
  serverVersion?: string;
}
