// Better Auth's browser client, kept in a file of its own.
//
// It is a big library and it is needed on exactly one screen — signing in —
// plus the moment somebody signs out. Importing it here, and only from the
// sign-in screen and from signOut(), keeps it out of the first download: the
// bundler can only leave it out if nothing the shell reaches can see it.
import { createAuthClient } from 'better-auth/react';
import { magicLinkClient } from 'better-auth/client/plugins';

export const authClient = createAuthClient({
  // Same origin, always: the session cookie is not sent anywhere else.
  basePath: '/api/auth',
  plugins: [magicLinkClient()],
});
