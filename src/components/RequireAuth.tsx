import { useAuth } from "@/hooks/use-auth";
import { Loader2 } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router";

export function RequireAuth({ children }: { children: ReactNode }) {
  const { isLoading, isAuthenticated, user, signOut } = useAuth();
  const location = useLocation();

  // Defense-in-depth: if the admin disabled this account while a session was
  // still valid (JWT up to 1h), force a sign-out instead of letting them use
  // the app. The backend kills sessions on disable and blocks new logins.
  useEffect(() => {
    if (isAuthenticated && user?.disabled) {
      void signOut().catch(() => undefined);
    }
  }, [isAuthenticated, user?.disabled, signOut]);

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </main>
    );
  }

  if (isAuthenticated && user?.disabled) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-6 text-center">
        <p className="text-lg font-semibold">This account has been disabled.</p>
        <p className="text-sm text-muted-foreground">
          Contact support for help restoring access.
        </p>
      </main>
    );
  }

  if (!isAuthenticated) {
    const returnTo = `${location.pathname}${location.search}`;
    return (
      <Navigate
        to={`/auth?returnTo=${encodeURIComponent(returnTo)}`}
        replace
      />
    );
  }

  return children;
}
