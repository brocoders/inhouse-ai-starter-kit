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
 *
 * Two ways to open it. Give it a `trigger` and it opens itself from that
 * button. Give it `open` and `onOpenChange` instead when the pause comes from
 * somewhere that is not a button — a choice in a menu, say — and the screen
 * decides when to ask; `onCancel` is then where the screen puts things back.
 */
export function ConfirmDialog({
  trigger,
  open: controlled,
  onOpenChange,
  onCancel,
  title,
  body,
  confirmLabel,
  onConfirm,
  destructive = true,
}: {
  trigger?: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Called when the dialog closes without confirming. */
  onCancel?: () => void;
  title: string;
  body?: string;
  confirmLabel: string;
  onConfirm: () => void | Promise<unknown>;
  destructive?: boolean;
}) {
  const [own, setOwn] = useState(false);
  const [busy, setBusy] = useState(false);
  const open = controlled ?? own;
  const setOpen = (next: boolean) => {
    if (controlled === undefined) setOwn(next);
    onOpenChange?.(next);
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) onCancel?.();
        setOpen(next);
      }}
    >
      {trigger && <DialogTrigger render={trigger as never} />}
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
