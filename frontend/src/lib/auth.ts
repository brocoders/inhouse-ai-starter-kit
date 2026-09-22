// Who is signed in, and what they may do.
//
// There is no public sign-up: people are invited by an owner and arrive with a
// link. Signing in itself lives in lib/auth-client.ts, which the sign-in
// screen imports and nothing else does.
import { useQuery } from '@tanstack/react-query';
import { Me } from '@shared/schemas';
import { api } from './api';

export const meQueryKey = ['me'] as const;

/**
 * Who is signed in, what they may do, and the locale and time zone every
 * formatter reads. The shell asks for it once and every screen reads the
 * answer; an `auth` failure takes the person to the sign-in screen from
 * lib/api.ts, so there is no signed-out branch to write here.
 */
export function useMe() {
  return useQuery({
    queryKey: meQueryKey,
    queryFn: ({ signal }) => api.get('/api/me', Me, undefined, signal),
    // The person's own record is the one thing worth keeping while they move
    // around; it changes when they change it, and then it is invalidated.
    staleTime: 5 * 60 * 1000,
  });
}

export type Role = Me['role'];

/** Who may add, change and delete records. A viewer sees and nothing more. */
export function canEdit(role: Role | undefined): boolean {
  return role === 'owner' || role === 'member';
}

/** Who may invite people, change roles and look at the health screen. */
export function isOwner(role: Role | undefined): boolean {
  return role === 'owner';
}

export async function signOut(): Promise<void> {
  try {
    const { authClient } = await import('./auth-client');
    await authClient.signOut();
  } finally {
    // Leaving by the front door: a fresh document keeps nothing of the last
    // person, in a cache or in a component's state.
    window.location.assign('/sign-in');
  }
}
