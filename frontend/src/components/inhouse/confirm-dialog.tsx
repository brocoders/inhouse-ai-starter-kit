import { useState, type ReactNode } from 'react';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { t } from '@/lib/i18n';

/**
 * The one pause before something that cannot be undone.
 *
 * It asks in the words of the thing being done — "Delete this item?" — and the
 * button repeats the verb, so nobody confirms a "Yes" without knowing what it
 * agreed to. Nothing reversible gets one of these: a confirmation on a safe
 * action teaches people to click through the dangerous one.
 */
export function ConfirmDialog({
  trigger,
  title,
  body,
  confirmLabel,
  onConfirm,
  destructive = true,
}: {
  trigger: ReactNode;
  title: string;
  body?: string;
  confirmLabel: string;
  onConfirm: () => void | Promise<unknown>;
  destructive?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger as never} />
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {body && <DialogDescription>{body}</DialogDescription>}
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant="outline">{t('action.cancel')}</Button>} />
          <Button
            variant={destructive ? 'destructive' : 'default'}
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void Promise.resolve(onConfirm())
                .then(() => setOpen(false))
                .finally(() => setBusy(false));
            }}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
