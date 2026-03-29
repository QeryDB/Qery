import { useEffect, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { isMac } from '@/lib/utils';

interface WindowControlsProps {
  showMaximize?: boolean;
}

export function WindowControls({ showMaximize = true }: WindowControlsProps) {
  // macOS uses native traffic lights
  if (isMac) return null;

  const [maximized, setMaximized] = useState(false);
  const appWindow = getCurrentWindow();

  useEffect(() => {
    appWindow.isMaximized().then(setMaximized);
    const unlisten = appWindow.onResized(() => {
      appWindow.isMaximized().then(setMaximized);
    });
    return () => { unlisten.then(fn => fn()); };
  }, [appWindow]);

  const btn =
    'inline-flex items-center justify-center w-8 h-8 rounded-md transition-all duration-150 text-foreground/60 hover:text-foreground';

  return (
    <div
      className="flex items-center gap-0.5 shrink-0 mr-1"
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
    >
      {/* Minimize */}
      <button
        className={`${btn} hover:bg-foreground/10`}
        onClick={() => appWindow.minimize()}
        aria-label="Minimize"
      >
        <svg width="10" height="1" viewBox="0 0 10 1">
          <rect width="10" height="1" fill="currentColor" />
        </svg>
      </button>

      {/* Maximize / Restore */}
      {showMaximize && (
        <button
          className={`${btn} hover:bg-foreground/10`}
          onClick={() => appWindow.toggleMaximize()}
          aria-label={maximized ? 'Restore' : 'Maximize'}
        >
          {maximized ? (
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1">
              <rect x="2" y="0.5" width="7.5" height="7.5" rx="0.5" />
              <rect x="0.5" y="2" width="7.5" height="7.5" rx="0.5" fill="hsl(var(--background))" />
              <rect x="0.5" y="2" width="7.5" height="7.5" rx="0.5" />
            </svg>
          ) : (
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1">
              <rect x="0.5" y="0.5" width="9" height="9" rx="0.5" />
            </svg>
          )}
        </button>
      )}

      {/* Close */}
      <button
        className={`${btn} hover:bg-[#c42b1c] hover:text-white`}
        onClick={() => appWindow.close()}
        aria-label="Close"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
          <path d="M1.28.22a.75.75 0 00-1.06 1.06L3.94 5 .22 8.72a.75.75 0 101.06 1.06L5 6.06l3.72 3.72a.75.75 0 101.06-1.06L6.06 5l3.72-3.72A.75.75 0 008.72.22L5 3.94 1.28.22z" />
        </svg>
      </button>
    </div>
  );
}
