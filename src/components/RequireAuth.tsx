import { useAuth } from "@/hooks/use-auth";
import { Loader2 } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router";
import { useTranslation } from "react-i18next";

export function RequireAuth({ children }: { children: ReactNode }) {
  const { isLoading, isAuthenticated, user, signOut } = useAuth();
  const location = useLocation();
  const { t } = useTranslation();

  // Defense-in-depth: if the admin disabled this account while a session was
  // still valid (JWT up to 1h), force a sign-out instead of letting them use
  // the app. The backend kills sessions on disable and blocks new logins.
  useEffect(() => {
    if (isAuthenticated && user?.disabled) {
      void signOut().catch(() => undefined);
    }
  }, [isAuthenticated, user?.disabled, signOut]);

  // M-34: an authenticated session whose user doc is gone resolves
  // user === null. Rendering children crashes on user._id dereferences, and
  // redirecting to /auth bounce-loops (AuthPage redirects authed users back).
  // Sign out once and hold a clear message until the session actually ends.
  const signedOutRef = useRef(false);
  const orphaned = isAuthenticated && !isLoading && user === null;
  useEffect(() => {
    if (orphaned && !signedOutRef.current) {
      signedOutRef.current = true;
      void signOut().catch(() => undefined);
    }
  }, [orphaned, signOut]);

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </main>
    );
  }

  if (orphaned) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-6 text-center">
        <p className="text-lg font-semibold">{t("requireAuth.accountGone")}</p>
        <p className="text-sm text-muted-foreground">
          {t("requireAuth.accountGoneHint")}
        </p>
      </main>
    );
  }

  if (isAuthenticated && user?.disabled) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-6 text-center">
        <p className="text-lg font-semibold">{t("requireAuth.accountDisabled")}</p>
        <p className="text-sm text-muted-foreground">
          {t("requireAuth.accountDisabledHint")}
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
