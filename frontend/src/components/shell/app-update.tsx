import { useEffect } from 'react';
import { toast } from 'sonner';
import { applyUpdate, startUpdateWatch, useUpdateReady } from '@/lib/app-update';
import { t } from '@/lib/i18n';

/**
 * The one sentence a new release says for itself: "A new version is ready —
 * Update". It waits for an answer rather than reloading on its own, because
 * nothing should change under a half-filled form.
 *
 * Why the app registers the worker itself, rather than through the plugin's
 * `useRegisterSW`, is in lib/app-update.ts.
 */
export function AppUpdate() {
  const ready = useUpdateReady();

  useEffect(() => startUpdateWatch(), []);

  useEffect(() => {
    if (!ready) return;
    toast(t('update.ready'), {
      id: 'app-update',
      description: t('update.body'),
      duration: Infinity,
      action: { label: t('action.update'), onClick: () => applyUpdate() },
    });
  }, [ready]);

  return null;
}
