import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCreateConnection, useTestConnection } from '@/hooks/useConnection';
import { Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { generateColor, hslToHex } from '@/lib/utils';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ConnectionDialog({ open, onOpenChange }: Props) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [server, setServer] = useState('');
  const [port, setPort] = useState('1433');
  const [authType, setAuthType] = useState<'integrated' | 'sql'>('integrated');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [color, setColor] = useState('#3b82f6');
  const [colorManual, setColorManual] = useState(false);
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [testMessage, setTestMessage] = useState('');

  const createMutation = useCreateConnection();
  const testMutation = useTestConnection();

  // Auto-generate color from name (or server as fallback)
  useEffect(() => {
    if (colorManual) return;
    const seed = name || server;
    if (seed) setColor(hslToHex(generateColor(seed)));
  }, [name, server, colorManual]);

  const handleTest = async () => {
    setTestStatus('testing');
    try {
      const result = await testMutation.mutateAsync({
        server,
        port: parseInt(port),
        auth_type: authType,
        username: authType === 'sql' ? username : undefined,
        password: authType === 'sql' ? password : undefined,
      });
      setTestStatus(result.ok ? 'success' : 'error');
      setTestMessage(result.message);
    } catch (e: any) {
      setTestStatus('error');
      setTestMessage(e.message);
    }
  };

  const handleSave = async () => {
    await createMutation.mutateAsync({
      name: name || server,
      server,
      port: parseInt(port),
      auth_type: authType,
      username: authType === 'sql' ? username : undefined,
      password: authType === 'sql' ? password : undefined,
      color,
    });
    onOpenChange(false);
    resetForm();
  };

  const resetForm = () => {
    setName(''); setServer(''); setPort('1433'); setAuthType('integrated');
    setUsername(''); setPassword(''); setColor('#3b82f6'); setColorManual(false);
    setTestStatus('idle'); setTestMessage('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{t('connection.addConnection')}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="name">{t('common.name')}</Label>
            <Input id="name" placeholder={t('connection.serverPlaceholder')} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2">
              <Label htmlFor="server">{t('connection.server')}</Label>
              <Input id="server" placeholder="localhost" value={server} onChange={(e) => setServer(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="port">{t('connection.port')}</Label>
              <Input id="port" type="number" value={port} onChange={(e) => setPort(e.target.value)} />
            </div>
          </div>
          <div className="grid gap-2">
            <Label>{t('connection.authentication')}</Label>
            <Select value={authType} onValueChange={(v: 'integrated' | 'sql') => setAuthType(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="integrated">{t('connection.windowsIntegrated')}</SelectItem>
                <SelectItem value="sql">{t('connection.sqlServer')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {authType === 'sql' && (
            <>
              <div className="grid gap-2">
                <Label htmlFor="username">{t('connection.username')}</Label>
                <Input id="username" value={username} onChange={(e) => setUsername(e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="password">{t('connection.password')}</Label>
                <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
            </>
          )}
          <div className="grid gap-2">
            <Label htmlFor="color">{t('connection.color')}</Label>
            <Input id="color" type="color" value={color} onChange={(e) => { setColor(e.target.value); setColorManual(true); }} className="h-8 w-16 p-0.5" />
          </div>
          {testStatus !== 'idle' && (
            <div className={`flex items-center gap-2 rounded-md p-2 text-sm ${testStatus === 'success' ? 'bg-green-500/10 text-green-500' : testStatus === 'error' ? 'bg-red-500/10 text-red-500' : 'text-muted-foreground'}`}>
              {testStatus === 'testing' && <Loader2 className="h-4 w-4 animate-spin" />}
              {testStatus === 'success' && <CheckCircle2 className="h-4 w-4" />}
              {testStatus === 'error' && <XCircle className="h-4 w-4" />}
              {testMessage || t('common.testing')}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleTest} disabled={!server || testStatus === 'testing'}>
            {testStatus === 'testing' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {t('common.test')}
          </Button>
          <Button onClick={handleSave} disabled={!server || createMutation.isPending}>
            {t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
