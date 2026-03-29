import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface ConnectionState {
  activeConnectionId: string | null;
  activeDatabase: string | null;
  activeDatabaseType: string;
  setActiveConnection: (id: string | null, defaultDatabase?: string | null, databaseType?: string) => void;
  setActiveDatabase: (db: string | null) => void;
  setActiveDatabaseType: (type: string) => void;
}

export const useConnectionStore = create<ConnectionState>()(
  persist(
    (set) => ({
      activeConnectionId: null,
      activeDatabase: null,
      activeDatabaseType: 'mssql',
      setActiveConnection: (id, defaultDatabase, databaseType) =>
        set({
          activeConnectionId: id,
          activeDatabase: defaultDatabase || null,
          activeDatabaseType: databaseType || 'mssql',
        }),
      setActiveDatabase: (db) => set({ activeDatabase: db }),
      setActiveDatabaseType: (type) => set({ activeDatabaseType: type }),
    }),
    { name: 'qery-connection' }
  )
);
