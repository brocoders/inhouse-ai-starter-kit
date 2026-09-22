import { useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { invalidateAll } from '@/lib/query';
import { t } from '@/lib/i18n';
import { cn } from '@/lib/utils';

/**
 * Re-read everything on screen from the server, without the browser reloading
 * the app.
 *
 * It hides itself wherever the finger is the pointer: on a phone or a tablet
 * the pull-down gesture does the same thing, and a button beside it would be a
 * website's control, not an app's. On a desktop, where there is no gesture to
 * make, it stays.
 *
 * The spin is held for a moment even when the server answers instantly. A
 * refresh that finishes in fifteen milliseconds looks exactly like a button
 * that does nothing.
 */
export function RefreshButton({ className }: { className?: string }) {
  const [busy, setBusy] = useState(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={busy}
      className={cn('pointer-coarse:hidden', className)}
      onClick={() => {
        if (busy) return;
        setBusy(true);
        void Promise.all([invalidateAll(), new Promise((resolve) => setTimeout(resolve, 600))])
          .catch(() => {})
          .finally(() => {
            if (alive.current) setBusy(false);
          });
      }}
    >
      <RefreshCw className={busy ? 'animate-spin' : ''} aria-hidden />
      {t('action.refresh')}
    </Button>
  );
}
