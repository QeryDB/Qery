import { Table2, Eye, Code2, FunctionSquare, Play, AlignLeft, Sun, Moon, FolderOpen, Plus, Star } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
} from '@/components/ui/command';
import { useUIStore } from '@/stores/ui-store';
import { useConnectionStore } from '@/stores/connection-store';
import { useSchema } from '@/hooks/useSchema';
import { useEditorStore } from '@/stores/editor-store';
import { useFavorites } from '@/hooks/useFavorites';

const isMac = navigator.platform.toUpperCase().includes('MAC');
const mod = isMac ? '\u2318' : 'Ctrl';

export function CommandPalette() {
  const { t } = useTranslation();
  const open = useUIStore((s) => s.commandPaletteOpen);
  const setOpen = useUIStore((s) => s.setCommandPaletteOpen);
  const { theme, toggleTheme } = useUIStore();
  const { activeConnectionId, activeDatabase } = useConnectionStore();

  const { data: schema } = useSchema(activeConnectionId, activeDatabase);
  const { data: favorites } = useFavorites(activeConnectionId, activeDatabase);
  const addTab = useEditorStore((s) => s.addTab);
  const addInspectorTab = useEditorStore((s) => s.addInspectorTab);

  const favoriteSet = new Set(favorites ?? []);
  const favoriteTables = schema?.tables.filter((t) => favoriteSet.has(`${t.schema}.${t.name}`)) ?? [];
  const nonFavoriteTables = schema?.tables.filter((t) => !favoriteSet.has(`${t.schema}.${t.name}`)) ?? [];

  const handleSelectTable = (table: { name: string; schema: string }, objectType: 'table' | 'view' | 'procedure' | 'function') => {
    if (!activeConnectionId || !activeDatabase) return;
    const target = {
      connectionId: activeConnectionId,
      database: activeDatabase,
      table: table.name,
      schema: table.schema,
      objectType,
    };
    // Chain breadcrumbs if navigating from an inspector tab
    const state = useEditorStore.getState();
    const focusedGroup = state.layout.groups.find(g => g.id === state.layout.focusedGroupId);
    const activeTab = focusedGroup?.activeTabId
      ? state.tabs.find(t => t.id === focusedGroup.activeTabId)
      : null;
    if (activeTab?.type === 'inspector' && activeTab.inspectorTarget) {
      state.navigateInspector(activeTab.id, target);
    } else {
      addInspectorTab(target);
    }
    setOpen(false);
  };

  const handleCommand = (action: string) => {
    setOpen(false);
    requestAnimationFrame(() => {
      switch (action) {
        case 'run': {
          const el = document.querySelector('.cm-editor .cm-content');
          if (el) {
            el.dispatchEvent(new KeyboardEvent('keydown', {
              key: 'Enter', code: 'Enter', ctrlKey: true, metaKey: true, bubbles: true, cancelable: true,
            }));
          }
          break;
        }
        case 'format':
          useEditorStore.getState().triggerFormat();
          break;
        case 'toggle-theme':
          toggleTheme();
          break;
        case 'toggle-sidebar':
          useUIStore.getState().toggleSidebar();
          break;
        case 'new-tab':
          addTab();
          break;
      }
    });
  };

  const groups = (
    <>
      <CommandEmpty>{t("command.noResults")}</CommandEmpty>

      {favoriteTables.length > 0 && (
        <CommandGroup heading={t("command.favorites")}>
          {favoriteTables.map((tbl) => (
            <CommandItem
              key={`fav-${tbl.schema}.${tbl.name}`}
              onSelect={() => handleSelectTable(tbl, 'table')}
            >
              <Star className="mr-2 h-4 w-4 text-yellow-500 fill-yellow-500" />
              <span>{tbl.schema}.{tbl.name}</span>
              {tbl.row_count != null && (
                <span className="ml-auto text-xs text-muted-foreground">{tbl.row_count.toLocaleString()}</span>
              )}
            </CommandItem>
          ))}
        </CommandGroup>
      )}

      {schema && nonFavoriteTables.length > 0 && (
        <CommandGroup heading={t("command.tables")}>
          {nonFavoriteTables.slice(0, 10).map((tbl) => (
            <CommandItem
              key={`table-${tbl.schema}.${tbl.name}`}
              onSelect={() => handleSelectTable(tbl, 'table')}
            >
              <Table2 className="mr-2 h-4 w-4 text-blue-500" />
              <span>{tbl.schema}.{tbl.name}</span>
              {tbl.row_count != null && (
                <span className="ml-auto text-xs text-muted-foreground">{tbl.row_count.toLocaleString()}</span>
              )}
            </CommandItem>
          ))}
        </CommandGroup>
      )}

      {schema && schema.views.length > 0 && (
        <CommandGroup heading="Views">
          {schema.views.slice(0, 10).map((v) => (
            <CommandItem
              key={`view-${v.schema}.${v.name}`}
              onSelect={() => handleSelectTable(v, 'view')}
            >
              <Eye className="mr-2 h-4 w-4 text-purple-500" />
              <span>{v.schema}.{v.name}</span>
            </CommandItem>
          ))}
        </CommandGroup>
      )}

      {schema && schema.procedures.length > 0 && (
        <CommandGroup heading="Procedures">
          {schema.procedures.slice(0, 10).map((p) => (
            <CommandItem
              key={`proc-${p.schema}.${p.name}`}
              onSelect={() => handleSelectTable(p, 'procedure')}
            >
              <Code2 className="mr-2 h-4 w-4 text-orange-500" />
              <span>{p.schema}.{p.name}</span>
            </CommandItem>
          ))}
        </CommandGroup>
      )}

      {schema && schema.functions.length > 0 && (
        <CommandGroup heading="Functions">
          {schema.functions.slice(0, 10).map((f) => (
            <CommandItem
              key={`fn-${f.schema}.${f.name}`}
              onSelect={() => handleSelectTable(f, 'function')}
            >
              <FunctionSquare className="mr-2 h-4 w-4 text-teal-500" />
              <span>{f.schema}.{f.name}</span>
            </CommandItem>
          ))}
        </CommandGroup>
      )}

      <CommandGroup heading={t("command.commands")}>
        {activeConnectionId && activeDatabase && (
          <>
            <CommandItem onSelect={() => handleCommand('run')}>
              <Play className="mr-2 h-4 w-4" />
              <span>{t("command.runQuery")}</span>
              <CommandShortcut>{mod}+Enter</CommandShortcut>
            </CommandItem>
            <CommandItem onSelect={() => handleCommand('format')}>
              <AlignLeft className="mr-2 h-4 w-4" />
              <span>{t("command.formatSql")}</span>
              <CommandShortcut>Shift+Alt+F</CommandShortcut>
            </CommandItem>
          </>
        )}
        <CommandItem onSelect={() => handleCommand('new-tab')}>
          <Plus className="mr-2 h-4 w-4" />
          <span>{t("command.newTab")}</span>
          <CommandShortcut>{mod}+N</CommandShortcut>
        </CommandItem>
        <CommandItem onSelect={() => handleCommand('toggle-theme')}>
          {theme === 'dark' ? <Sun className="mr-2 h-4 w-4" /> : <Moon className="mr-2 h-4 w-4" />}
          <span>{t("command.toggleTheme")}</span>
        </CommandItem>
        <CommandItem onSelect={() => handleCommand('toggle-sidebar')}>
          <FolderOpen className="mr-2 h-4 w-4" />
          <span>{t("command.toggleSidebar")}</span>
          <CommandShortcut>{mod}+B</CommandShortcut>
        </CommandItem>
      </CommandGroup>
    </>
  );

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder={t("editor.typeCommandOrSearch")} />
      <CommandList>
        {groups}
      </CommandList>
    </CommandDialog>
  );
}
