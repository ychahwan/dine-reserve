import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { ArrowLeft, Compass, LogOut, Store } from "lucide-react";
import type { ReactNode } from "react";
import { Link, Navigate, useNavigate } from "react-router";

export function OwnerShell({
  children,
  title,
  onBack,
}: {
  children: ReactNode;
  title?: string;
  onBack?: () => void;
}) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  // Only restaurant owners (and the platform admin) may manage restaurants.
  if (user && user.role !== "owner" && user.role !== "admin") {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-2xl flex-col bg-background">
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/90 backdrop-blur-md">
        <div className="flex h-14 items-center gap-2 px-4">
          {onBack && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onBack}
              aria-label="Back"
              className="text-muted-foreground"
            >
              <ArrowLeft className="size-4" />
            </Button>
          )}
          <Link to="/owner" className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Store className="size-4" />
            </span>
            <span className="font-semibold tracking-tight">Kamix</span>
          </Link>
          {title && (
            <>
              <span className="text-muted-foreground">/</span>
              <span className="truncate text-sm font-medium text-muted-foreground">{title}</span>
            </>
          )}
          <div className="ml-auto flex items-center gap-1">
            <Button variant="ghost" size="sm" asChild className="text-muted-foreground">
              <Link to="/explore">
                <Compass className="size-4" /> Diner view
              </Link>
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Sign out"
              onClick={handleSignOut}
              className="text-muted-foreground"
            >
              <LogOut className="size-4" />
            </Button>
          </div>
        </div>
      </header>
      <main className="flex-1 px-4 py-5">{children}</main>
    </div>
  );
}
