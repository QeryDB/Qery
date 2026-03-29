import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { useUpdateConnection, useDeleteConnection } from '@/hooks/useConnection';
import { useConnectionStore } from '@/stores/connection-store';
import type { Connection } from '@/types/connection';
import { Trash2 } from 'lucide-react';
import { hslToHex, generateColor } from '@/lib/utils';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  connection: Connection;
}

export function ConnectionSettingsDialog({ open, onOpenChange, connection }: Props) {
  const { t } = useTranslation();
  const [name, setName] = useState(connection.name);
  const [color, setColor] = useState(connection.color || hslToHex(generateColor(connection.name)));
  const { activeConnectionId, setActiveConnection } = useConnectionStore();

  const updateMutation = useUpdateConnection();
  const deleteMutation = useDeleteConnection();

  useEffect(() => {
    if (open) {
      setName(connection.name);
      setColor(connection.color || hslToHex(generateColor(connection.name)));
    }
  }, [open, connection]);

  const handleSave = () => {
    updateMutation.mutate(
      { id: connection.id, name, color, server: connection.server, port: connection.port },
      { onSuccess: () => onOpenChange(false) }
    );
  };

  const handleRemove = () => {
    if (activeConnectionId === connection.id) {
      setActiveConnection(null);
    }
    deleteMutation.mutate(connection.id);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle className="text-sm">{t("connection.connectionSettings")}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="conn-name" className="text-xs">{t("connection.displayName")}</Label>
            <Input
              id="conn-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-8 text-sm"
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="conn-color" className="text-xs">{t("connection.color")}</Label>
            <div className="flex items-center gap-2">
              <Input
                id="conn-color"
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="h-8 w-12 p-0.5"
              />
              <Input
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="h-8 text-xs font-mono flex-1"
                placeholder="#hex"
              />
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label className="text-xs text-muted-foreground">{t("connection.server")}</Label>
            <p className="text-xs font-mono text-muted-foreground break-all select-all bg-muted/50 rounded px-2 py-1.5">
              {connection.server}:{connection.port}
            </p>
          </div>

          {connection.database_name && (
            <div className="grid gap-1.5">
              <Label className="text-xs text-muted-foreground">{t("connection.database")}</Label>
              <p className="text-xs font-mono text-muted-foreground break-all select-all bg-muted/50 rounded px-2 py-1.5">
                {connection.database_name}
              </p>
            </div>
          )}

          <div className="grid gap-1.5">
            <Label className="text-xs text-muted-foreground">{t("connection.authentication")}</Label>
            <p className="text-xs font-mono text-muted-foreground bg-muted/50 rounded px-2 py-1.5">
              {connection.auth_type === 'integrated' ? t('connection.windowsAuth') : `SQL: ${connection.username || '—'}`}
            </p>
          </div>
        </div>

        <Separator />

        <div className="flex items-center justify-between">
          <Button
            variant="destructive"
            size="sm"
            className="h-7 text-xs gap-1"
            onClick={handleRemove}
          >
            <Trash2 className="h-3 w-3" />
            {t('connection.removeConnection')}
          </Button>

          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button size="sm" className="h-7 text-xs" onClick={handleSave} disabled={updateMutation.isPending}>
              {t("common.save")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
