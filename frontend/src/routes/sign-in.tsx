import { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { Boxes, MailCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { FormField } from '@/components/inhouse';
import { authClient } from '@/lib/auth-client';
import { t } from '@/lib/i18n';

export const Route = createFileRoute('/sign-in')({ component: SignIn });

type Phase = 'ask' | 'sent';

function SignIn() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  // A link in an email is the everyday way in: nothing to remember, nothing to
  // leak, and it works on the phone the mail is read on. The password is kept
  // folded away for the person whose mail is slow or on another machine.
  const [withPassword, setWithPassword] = useState(false);
  const [phase, setPhase] = useState<Phase>('ask');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      if (withPassword) {
        const result = await authClient.signIn.email({ email, password });
        if (result.error) throw new Error(result.error.message ?? t('signIn.failed'));
        window.location.assign('/');
        return;
      }
      const result = await authClient.signIn.magicLink({ email, callbackURL: '/' });
      if (result.error) throw new Error(result.error.message ?? t('signIn.failed'));
      setPhase('sent');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('signIn.failed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-dvh items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-5">
        <div className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Boxes className="size-4" aria-hidden />
          </span>
          <span className="text-lg font-semibold tracking-tight">{t('app.name')}</span>
        </div>

        {phase === 'sent' ? (
          <Card className="shadow-xs">
            <CardContent className="space-y-3 text-center">
              <MailCheck className="mx-auto size-6 text-positive" aria-hidden />
              <p className="text-sm font-medium">{t('signIn.sentTitle')}</p>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {t('signIn.sentBody', { email })}
              </p>
              <Button variant="ghost" size="sm" onClick={() => setPhase('ask')}>
                {t('action.back')}
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card className="shadow-xs">
            <CardContent>
              <form onSubmit={submit} className="space-y-4" noValidate>
                <div>
                  <h1 className="text-lg font-semibold tracking-tight">{t('signIn.title')}</h1>
                  <p className="mt-1 text-sm text-muted-foreground">{t('signIn.intro')}</p>
                </div>
                <FormField id="email" label={t('signIn.email')}>
                  <Input
                    id="email"
                    type="email"
                    required
                    autoComplete="email"
                    autoFocus
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                  />
                </FormField>
                {withPassword && (
                  <FormField id="password" label={t('signIn.password')}>
                    <Input
                      id="password"
                      type="password"
                      required
                      autoComplete="current-password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                    />
                  </FormField>
                )}
                {error && <p className="text-xs text-destructive">{error}</p>}
                <Button type="submit" className="w-full" disabled={busy || !email}>
                  {busy
                    ? t('signIn.sending')
                    : withPassword
                      ? t('signIn.submit')
                      : t('signIn.sendLink')}
                </Button>
                <button
                  type="button"
                  className="w-full text-center text-xs text-muted-foreground underline-offset-4 hover:underline"
                  onClick={() => {
                    setWithPassword(!withPassword);
                    setError(null);
                  }}
                >
                  {withPassword ? t('signIn.useLink') : t('signIn.usePassword')}
                </button>
              </form>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
