import { useState, useMemo, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useCreateSavedQuery, useSavedQueries } from '@/hooks/useSavedQueries';
import { useEditorStore } from '@/stores/editor-store';
import { ChevronRight, Folder, FolderOpen, Plus, Search, Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SaveQueryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tabId: string;
  sql: string;
  connectionId?: string;
}

export function SaveQueryDialog({ open, onOpenChange, tabId, sql, connectionId }: SaveQueryDialogProps) {
  const { t } = useTranslation();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [project, setProject] = useState('');
  const [folder, setFolder] = useState('');
  const [locationSearch, setLocationSearch] = useState('');
  const [creatingProject, setCreatingProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const newProjectInputRef = useRef<HTMLInputElement>(null);
  const newFolderInputRef = useRef<HTMLInputElement>(null);

  const createMutation = useCreateSavedQuery();
  const { data: savedQueries } = useSavedQueries();
  const linkTabToSavedQuery = useEditorStore((s) => s.linkTabToSavedQuery);

  const projectTree = useMemo(() => {
    const map = new Map<string, Set<string>>();
    if (savedQueries) {
      for (const q of savedQueries) {
        if (q.project_name) {
          if (!map.has(q.project_name)) map.set(q.project_name, new Set());
          if (q.folder_name) map.get(q.project_name)!.add(q.folder_name);
        }
      }
    }
    if (project) {
      if (!map.has(project)) map.set(project, new Set());
      if (folder) map.get(project)!.add(folder);
    }
    return Array.from(map.entries())
      .map(([name, folders]) => ({ name, folders: Array.from(folders).sort() }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [savedQueries, project, folder]);

  const filteredTree = useMemo(() => {
    if (!locationSearch.trim()) return projectTree;
    const q = locationSearch.toLowerCase();
    return projectTree
      .map((p) => ({
        ...p,
        folders: p.folders.filter((f) => f.toLowerCase().includes(q)),
      }))
      .filter((p) => p.name.toLowerCase().includes(q) || p.folders.length > 0);
  }, [projectTree, locationSearch]);

  useEffect(() => {
    if (creatingProject) requestAnimationFrame(() => newProjectInputRef.current?.focus());
  }, [creatingProject]);
  useEffect(() => {
    if (creatingFolder) requestAnimationFrame(() => newFolderInputRef.current?.focus());
  }, [creatingFolder]);

  const handleProjectClick = (name: string) => {
    if (project === name) {
      setProject('');
      setFolder('');
    } else {
      setProject(name);
      setFolder('');
    }
    setCreatingFolder(false);
    setNewFolderName('');
  };

  const handleFolderClick = (name: string) => {
    setFolder(folder === name ? '' : name);
  };

  const handleCreateProject = () => {
    const trimmed = newProjectName.trim();
    if (!trimmed) return;
    setProject(trimmed);
    setFolder('');
    setCreatingProject(false);
    setNewProjectName('');
  };

  const handleCreateFolder = () => {
    const trimmed = newFolderName.trim();
    if (!trimmed) return;
    setFolder(trimmed);
    setCreatingFolder(false);
    setNewFolderName('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    const saved = await createMutation.mutateAsync({
      connection_id: connectionId,
      title: title.trim(),
      description: description.trim() || undefined,
      sql_text: sql,
      project_name: project.trim() || undefined,
      folder_name: folder.trim() || undefined,
    });

    linkTabToSavedQuery(tabId, saved.id, saved.title);
    setTitle('');
    setDescription('');
    setProject('');
    setFolder('');
    setLocationSearch('');
    setCreatingProject(false);
    setCreatingFolder(false);
    onOpenChange(false);
  };

  const isExpanded = (name: string) => project === name;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{t("editor.saveQuery")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="sq-title">{t("editor.queryName")}</Label>
            <Input
              id="sq-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("editor.queryNamePlaceholder")}
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="sq-desc">
              {t('editor.description')} <span className="text-muted-foreground font-normal">({t('editor.descriptionOptional')})</span>
            </Label>
            <Input
              id="sq-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("editor.descriptionPlaceholder")}
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>
                {t('editor.saveLocation')} <span className="text-muted-foreground font-normal">({t('editor.descriptionOptional')})</span>
              </Label>
              {project && (
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => { setProject(''); setFolder(''); }}
                >
                  {t('common.clear')}
                </button>
              )}
            </div>

            {project && (
              <div className="flex items-center gap-1.5 text-xs">
                <FolderOpen className="h-3 w-3 text-yellow-600" />
                <span className="font-medium">{project}</span>
                {folder && (
                  <>
                    <ChevronRight className="h-3 w-3 text-muted-foreground" />
                    <Folder className="h-3 w-3 text-blue-500" />
                    <span className="font-medium">{folder}</span>
                  </>
                )}
              </div>
            )}

            <div className="rounded-md border overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/30">
                <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <input
                  value={locationSearch}
                  onChange={(e) => setLocationSearch(e.target.value)}
                  placeholder={t("editor.filterProjectsAndFolders")}
                  className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                />
                {locationSearch && (
                  <button type="button" onClick={() => setLocationSearch('')} className="text-muted-foreground hover:text-foreground">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              <div className="max-h-[200px] overflow-y-auto p-1">
                {filteredTree.map((p) => (
                  <div key={p.name}>
                    <button
                      type="button"
                      onClick={() => handleProjectClick(p.name)}
                      className={cn(
                        'flex w-full items-center gap-1.5 rounded-sm px-2 py-1.5 text-sm transition-colors',
                        project === p.name ? 'bg-accent text-accent-foreground' : 'hover:bg-muted/50'
                      )}
                    >
                      <ChevronRight className={cn('h-3 w-3 shrink-0 transition-transform text-muted-foreground', isExpanded(p.name) && 'rotate-90')} />
                      <FolderOpen className="h-3.5 w-3.5 shrink-0 text-yellow-600" />
                      <span className="truncate font-medium text-xs">{p.name}</span>
                      {project === p.name && !folder && <Check className="h-3 w-3 ml-auto shrink-0 text-primary" />}
                    </button>

                    {isExpanded(p.name) && (
                      <div className="ml-[18px] border-l pl-1.5">
                        {p.folders.map((f) => (
                          <button
                            key={f}
                            type="button"
                            onClick={() => handleFolderClick(f)}
                            className={cn(
                              'flex w-full items-center gap-1.5 rounded-sm px-2 py-1.5 text-sm transition-colors',
                              folder === f ? 'bg-accent text-accent-foreground' : 'hover:bg-muted/50'
                            )}
                          >
                            <Folder className="h-3.5 w-3.5 shrink-0 text-blue-500" />
                            <span className="truncate text-xs">{f}</span>
                            {folder === f && <Check className="h-3 w-3 ml-auto shrink-0 text-primary" />}
                          </button>
                        ))}

                        {creatingFolder ? (
                          <div className="flex items-center gap-1.5 px-2 py-1">
                            <Folder className="h-3.5 w-3.5 shrink-0 text-blue-500" />
                            <input
                              ref={newFolderInputRef}
                              value={newFolderName}
                              onChange={(e) => setNewFolderName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') { e.preventDefault(); handleCreateFolder(); }
                                if (e.key === 'Escape') { setCreatingFolder(false); setNewFolderName(''); }
                              }}
                              placeholder={t("editor.folderNamePlaceholder")}
                              className="flex-1 min-w-0 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
                            />
                            <button type="button" onClick={handleCreateFolder} className="text-muted-foreground hover:text-foreground shrink-0">
                              <Check className="h-3.5 w-3.5" />
                            </button>
                            <button type="button" onClick={() => { setCreatingFolder(false); setNewFolderName(''); }} className="text-muted-foreground hover:text-foreground shrink-0">
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => { setCreatingFolder(true); setNewFolderName(''); }}
                            className="flex w-full items-center gap-1.5 rounded-sm px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                          >
                            <Plus className="h-3 w-3" />
                            {t('editor.newFolder')}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ))}

                {creatingProject ? (
                  <div className="flex items-center gap-1.5 px-2 py-1.5">
                    <FolderOpen className="h-3.5 w-3.5 shrink-0 text-yellow-600" />
                    <input
                      ref={newProjectInputRef}
                      value={newProjectName}
                      onChange={(e) => setNewProjectName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') { e.preventDefault(); handleCreateProject(); }
                        if (e.key === 'Escape') { setCreatingProject(false); setNewProjectName(''); }
                      }}
                      placeholder={t("editor.projectNamePlaceholder")}
                      className="flex-1 min-w-0 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
                    />
                    <button type="button" onClick={handleCreateProject} className="text-muted-foreground hover:text-foreground shrink-0">
                      <Check className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" onClick={() => { setCreatingProject(false); setNewProjectName(''); }} className="text-muted-foreground hover:text-foreground shrink-0">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => { setCreatingProject(true); setNewProjectName(''); }}
                    className="flex w-full items-center gap-1.5 rounded-sm px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                  >
                    <Plus className="h-3 w-3" />
                    <span>New project</span>
                  </button>
                )}

                {filteredTree.length === 0 && !creatingProject && (
                  <div className="px-2 py-3 text-xs text-center text-muted-foreground">
                    {locationSearch ? t('common.noMatch') : t('editor.noProjectsYet')}
                  </div>
                )}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={!title.trim() || createMutation.isPending}>
              {t('common.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
