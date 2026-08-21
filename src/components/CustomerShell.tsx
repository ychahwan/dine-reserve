import { Button } from "@/components/ui/button";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useAuth } from "@/hooks/use-auth";
import { api } from "@/convex/_generated/api";
import { useQuery } from "convex/react";
import {
  Bell,
  CalendarCheck,
  Compass,
  LogOut,
  Store,
  UserRound,
} from "lucide-react";
import type { ReactNode } from "react";
import { Link, Navigate, NavLink, useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

const TAB_KEYS = [
  { to: "/explore", key: "nav.explore", icon: Compass },
  { to: "/bookings", key: "nav.bookings", icon: CalendarCheck },
  { to: "/account", key: "nav.you", icon: UserRound },
];

export function CustomerShell({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const unread = useQuery(api.dinerNotify.unreadCount);
  const { t } = useTranslation();

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  // Fresh users must complete onboarding before using the customer app.
  if (user && !user.role) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-background">
      {/* Header */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border/60 bg-background/90 px-4 backdrop-blur-md">
        <Link to="/explore" className="flex items-center gap-2">
          <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Store className="size-4" />
          </span>
          <span className="font-semibold tracking-tight">Kamix</span>
        </Link>
        <div className="flex items-center gap-1">
          <LanguageSwitcher />
          <Link to="/notifications" aria-label={t("nav.notifications")} className="relative">
            <span className="flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground">
              <Bell className="size-4.5" />
            </span>
            {unread !== undefined && unread > 0 && (
              <span className="absolute right-0.5 top-0.5 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold leading-4 text-primary-foreground">
                {unread > 9 ? "9+" : unread}
              </span>
            )}
          </Link>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t("common.signOut")}
            onClick={handleSignOut}
            className="text-muted-foreground"
          >
            <LogOut className="size-4" />
          </Button>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 pb-24">{children}</main>

      {/* Bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-30 mx-auto w-full max-w-md border-t border-border/60 bg-background/95 backdrop-blur-md">
        <div className="grid grid-cols-3">
          {TAB_KEYS.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.to === "/explore"}
              className={({ isActive }) =>
                cn(
                  "flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors",
                  isActive ? "text-primary" : "text-muted-foreground hover:text-foreground",
                )
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={cn(
                      "flex items-center justify-center rounded-full px-4 py-1 transition-colors",
                      isActive && "bg-primary/10",
                    )}
                  >
                    <tab.icon className="size-5" />
                  </span>
                  {t(tab.key)}
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
