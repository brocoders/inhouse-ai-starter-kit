import { useState, type FormEvent } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { UserPlus, Users } from 'lucide-react';
import { page as pageOf, Role, User } from '@shared/schemas';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Choice,
  EmptyState,
  FormField,
  PageHeader,
  RefreshButton,
  StatusBadge,
} from '@/components/inhouse';
import { api, fieldErrors } from '@/lib/api';
import { isOwner, useMe } from '@/lib/auth';
import { formatRelative } from '@/lib/format';
import { t } from '@/lib/i18n';

const UserPage = pageOf(User);

export const Route = createFileRoute('/people')({ component: People });

const roleOptions = [
  { value: 'owner', label: t('role.owner') },
  { value: 'member', label: t('role.member') },
  { value: 'viewer', label: t('role.viewer') },
];

function People() {
  const me = useMe();
  const owner = isOwner(me.data?.role);
  const queryClient = useQueryClient();
  const people = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get('/api/users', UserPage),
  });

  const change = async (id: string, patch: { role?: Role; active?: boolean }) => {
    await api.patch(`/api/users/${id}`, User, patch);
    await queryClient.invalidateQueries({ queryKey: ['users'] });
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title={t('people.title')}
        description={t('people.description')}
        actions={
          <>
            <RefreshButton />
            {owner && <InviteDialog />}
          </>
        }
      />

      {people.isPending ? (
        <Skeleton className="h-64 w-full rounded-xl" />
      ) : !people.data?.rows.length ? (
        <EmptyState icon={Users} title={t('people.emptyTitle')} text={t('people.emptyBody')} />
      ) : (
        <Card className="gap-0 py-0 shadow-xs">
          <CardContent className="px-0">
            {/* A table on a desktop and a stack of card rows on a phone: the
                same five facts, laid out for the width that is there. */}
            <ul className="divide-y">
              {people.data.rows.map((person) => (
                <li
                  key={person.id}
                  className="flex min-h-14 flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 sm:min-h-12 sm:flex-nowrap"
                >
                  <div className="min-w-0 flex-1 basis-full sm:basis-auto">
                    <p className="truncate text-sm font-medium">
                      {person.name}
                      {!person.active && (
                        <StatusBadge label={t('people.inactive')} tone="warn" className="ml-2" />
                      )}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{person.email}</p>
                  </div>
                  <span className="text-xs whitespace-nowrap text-muted-foreground sm:w-32 sm:text-right">
                    {person.lastSeenAt ? formatRelative(person.lastSeenAt) : t('people.never')}
                  </span>
                  {owner ? (
                    <Choice
                      size="sm"
                      className="w-32"
                      aria-label={t('people.role')}
                      value={person.role}
                      disabled={person.id === me.data?.id}
                      onChange={(value) => void change(person.id, { role: value as Role })}
                      options={roleOptions}
                    />
                  ) : (
                    <span className="w-32 text-xs text-muted-foreground">
                      {t(`role.${person.role}`)}
                    </span>
                  )}
                  {owner && (
                    <span className="sm:w-24 sm:text-right">
                      {person.id !== me.data?.id && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => void change(person.id, { active: !person.active })}
                        >
                          {person.active ? t('people.deactivate') : t('people.activate')}
                        </Button>
                      )}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function InviteDialog() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('member');
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setErrors({});
    try {
      await api.post('/api/users', User, { name: name.trim(), email: email.trim(), role });
      await queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success(t('people.sent', { email }));
      setOpen(false);
      setName('');
      setEmail('');
    } catch (cause) {
      const fields = fieldErrors(cause);
      setErrors(
        Object.keys(fields).length
          ? fields
          : { email: cause instanceof Error ? cause.message : t('error.title') },
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button size="sm">
            <UserPlus aria-hidden />
            {t('people.invite')}
          </Button>
        }
      />
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-sm">
        <form onSubmit={submit} noValidate>
          <DialogHeader>
            <DialogTitle>{t('people.inviteTitle')}</DialogTitle>
            <DialogDescription>{t('people.inviteBody')}</DialogDescription>
          </DialogHeader>
          <fieldset disabled={busy} className="space-y-4 py-4">
            <FormField id="invite-name" label={t('people.name')} error={errors.name}>
              <Input
                id="invite-name"
                value={name}
                autoFocus
                onChange={(event) => setName(event.target.value)}
              />
            </FormField>
            <FormField id="invite-email" label={t('people.email')} error={errors.email}>
              <Input
                id="invite-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </FormField>
            <FormField id="invite-role" label={t('people.role')} error={errors.role}>
              <Choice
                id="invite-role"
                className="w-full"
                value={role}
                onChange={setRole}
                options={roleOptions}
              />
            </FormField>
          </fieldset>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {t('action.cancel')}
            </Button>
            <Button type="submit" disabled={busy || !name.trim() || !email.trim()}>
              {busy ? t('action.saving') : t('people.invite')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
