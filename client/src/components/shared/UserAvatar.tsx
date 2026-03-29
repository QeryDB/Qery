import { Sun, Moon } from 'lucide-react';
import { useUIStore } from '@/stores/ui-store';

export function UserAvatar() {
  const { theme, toggleTheme } = useUIStore();

  return (
    <button
      className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:text-foreground transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      onClick={toggleTheme}
      title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
    >
      {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}
