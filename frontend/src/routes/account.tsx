import { useEffect, useState, type FormEvent } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Check, Monitor, Moon, Sun } from 'lucide-react';
import { Me } from '@shared/schemas';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { FormField, PageHeader } from '@/components/inhouse';
import { api, fieldErrors } from '@/lib/api';
import { meQueryKey, useMe } from '@/lib/auth';
import { t } from '@/lib/i18n';
import { useTheme, type ThemeChoice } from '@/lib/theme';
import { cn } from '@/lib/utils';

export const Route = createFileRoute('/account')({ component: Account });

function Account() {
  const me = useMe();
  const queryClient = useQueryClient();
  const [name, setName] = useState(me.data?.name ?? '');
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => setName(me.data?.name ?? ''), [me.data?.name]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    if (!name.trim()) {
      setErrors({ name: t('form.required') });
      return;
    }
    setBusy(true);
    setErrors({});
    try {
      await api.patch('/api/me', Me, { name: name.trim() });
      await queryClient.invalidateQueries({ queryKey: meQueryKey });
      toast.success(t('account.saved'));
    } catch (cause) {
      const fields = fieldErrors(cause);
      setErrors(
        Object.keys(fields).length
          ? fields
          : { name: cause instanceof Error ? cause.message : t('error.title') },
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader title={t('account.title')} description={t('account.description')} />

      <Card className="shadow-xs">
        <CardContent>
          <form onSubmit={submit} className="space-y-4" noValidate>
            <fieldset disabled={busy}>
              <FormField
                id="account-name"
                label={t('account.yourName')}
                error={errors.name}
                hint={me.data?.email}
              >
                <Input
                  id="account-name"
                  value={name}
                  maxLength={120}
                  onChange={(event) => setName(event.target.value)}
                />
              </FormField>
            </fieldset>
            <Button type="submit" disabled={busy}>
              {busy ? t('action.saving') : t('action.save')}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="shadow-xs">
        <CardHeader>
          <CardTitle className="text-sm font-medium">{t('theme.label')}</CardTitle>
        </CardHeader>
        <CardContent>
          <ThemeChooser />
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        {t('account.timeZoneNote', { zone: me.data?.timeZone ?? '—' })}
      </p>
    </div>
  );
}

/**
 * The appearance choice, shown as three buttons rather than a switch, because
 * "follow the system" is a third state and a switch cannot hold one.
 */
function ThemeChooser() {
  const theme = useTheme();
  const options: Array<{ value: ThemeChoice; label: string; icon: typeof Sun }> = [
    { value: 'light', label: t('theme.light'), icon: Sun },
    { value: 'dark', label: t('theme.dark'), icon: Moon },
    { value: 'system', label: t('theme.system'), icon: Monitor },
  ];
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => {
        const Icon = option.icon;
        const active = theme.choice === option.value;
        return (
          <Button
            key={option.value}
            type="button"
            variant={active ? 'secondary' : 'outline'}
            onClick={() => theme.set(option.value)}
            className={cn('gap-2', active && 'font-medium')}
            aria-pressed={active}
          >
            <Icon aria-hidden />
            {option.label}
            {active && <Check aria-hidden />}
          </Button>
        );
      })}
    </div>
  );
}
