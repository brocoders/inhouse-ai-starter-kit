// The people who can sign in, as one query every screen shares.
//
// People, the items filter and the item form all need the same list. One hook
// means one cache key, one schema and one place to change when the contract
// does — three copies had already drifted from the server once.
import { useQuery } from '@tanstack/react-query';
import { UserPage } from '@shared/schemas';
import { api } from './api';

export const usersQueryKey = ['users'] as const;

/**
 * Everybody on the list. Only a member or an owner may read it; pass
 * `enabled: false` for a viewer rather than asking and being refused.
 */
export function useUsers({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: usersQueryKey,
    queryFn: ({ signal }) => api.get('/api/users', UserPage, undefined, signal),
    enabled,
  });
}
