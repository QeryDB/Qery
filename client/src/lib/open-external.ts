import { openUrl } from '@tauri-apps/plugin-opener';

/** Open a URL in the user's default browser. */
export function openExternal(url: string) {
  openUrl(url).catch(() => {
    // fallback for dev/browser environments
    window.open(url, '_blank');
  });
}
