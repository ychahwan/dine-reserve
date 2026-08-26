import { api } from "@/convex/_generated/api";
import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexAuth, useQuery } from "convex/react";
import type { Doc } from "@/convex/_generated/dataModel";

/**
 * KB-13: Split auth hooks to reduce cascading re-renders.
 *
 * - `useAuthState()`: auth loading + session actions (no user query).
 *   Use when you only need `isLoading`, `signIn`, `signOut`, or
 *   `isAuthenticated` — the component won't re-render when user data changes.
 *
 * - `useUser()`: just the current user object (or null).
 *   Use when you need the user profile but already know auth is resolved.
 *
 * - `useAuth()`: convenience combo — returns both user and auth state.
 */
export function useAuthState() {
  const { isLoading: isAuthLoading, isAuthenticated } = useConvexAuth();
  const { signIn, signOut } = useAuthActions();
  return { isLoading: isAuthLoading, isAuthenticated, signIn, signOut };
}

export function useUser(): Doc<"users"> | null | undefined {
  return useQuery(api.users.currentUser);
}

export function useAuth() {
  const { isLoading: isAuthLoading, isAuthenticated, signIn, signOut } = useAuthState();
  const user = useUser();
  const isLoading = isAuthLoading || user === undefined;
  return { isLoading, isAuthenticated, user, signIn, signOut };
}
