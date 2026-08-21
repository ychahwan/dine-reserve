import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { api } from "@/convex/_generated/api";
import { useQuery } from "convex/react";
import {
  LayoutDashboard,
  Loader2,
  LogOut,
  PlusCircle,
  ScrollText,
  Settings,
  ShieldCheck,
  Star,
  Store,
  UserCog,
  Users,
} from "lucide-react";
import { NavLink, Navigate, Outlet, useNavigate } from "react-router";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/admin", end: true, icon: LayoutDashboard, label: "Dashboard" },
  { to: "/admin/restaurants", icon: Store, label: "Restaurants" },
  { to: "/admin/users", icon: Users, label: "Users" },
  { to: "/admin/reviews", icon: Star, label: "Reviews" },
  { to: "/admin/audit", icon: ScrollText, label: "Audit log" },
  { to: "/admin/settings", icon: Settings, label: "Settings" },
];

const ACTIONS = [
  { to: "/admin/register", icon: PlusCircle, label: "Register restaurant" },
  { to: "/admin/tag", icon: UserCog, label: "Tag owner" },
];

export default function AdminShell() {
  const { user, isLoading, signOut } = useAuth();
  const isAdmin = useQuery(api.admin.isAdmin);
  const navigate = useNavigate();

  if (isLoading || isAdmin === undefined) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </main>
    );
  }
  if (!user) return <Navigate to="/auth" replace />;
  if (!isAdmin) return <Navigate to="/dashboard" replace />;

  return (
    <div className="min-h-screen bg-muted/30 lg:flex">
      {/* Sidebar */}
      <aside className="border-b border-border/60 bg-background lg:flex lg:w-60 lg:shrink-0 lg:flex-col lg:border-b-0 lg:border-r">
        <div className="flex h-14 items-center gap-2.5 px-4">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <ShieldCheck className="size-4" />
          </span>
          <div className="leading-tight">
            <p className="text-sm font-semibold tracking-tight">Kamix Admin</p>
            <p className="text-[11px] text-muted-foreground">Platform console</p>
          </div>
        </div>

        <nav className="flex gap-1 overflow-x-auto px-3 py-2 lg:flex-col lg:overflow-visible">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  "flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )
              }
            >
              <item.icon className="size-4" />
              {item.label}
            </NavLink>
          ))}

          <div className="my-2 hidden border-t border-border/60 lg:block" />

          {ACTIONS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  "flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )
              }
            >
              <item.icon className="size-4" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto hidden border-t border-border/60 p-3 lg:block">
          <p className="truncate text-xs font-medium">{user.name ?? "Admin"}</p>
          <p className="truncate text-[11px] text-muted-foreground">{user.phone ?? user.email ?? ""}</p>
          <Button
            variant="ghost"
            size="sm"
            className="mt-2 w-full justify-start text-muted-foreground"
            onClick={async () => {
              await signOut();
              navigate("/");
            }}
          >
            <LogOut className="size-4" /> Sign out
          </Button>
        </div>
      </aside>

      {/* Content */}
      <main className="min-w-0 flex-1">
        <div className="flex h-14 items-center justify-between border-b border-border/60 bg-background px-4 lg:justify-end lg:px-6">
          <span className="text-sm font-semibold text-muted-foreground lg:hidden">
            Kamix Admin
          </span>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => navigate("/")}>
              View app
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground lg:hidden"
              onClick={async () => {
                await signOut();
                navigate("/");
              }}
            >
              <LogOut className="size-4" /> Sign out
            </Button>
          </div>
        </div>
        <div className="p-4 sm:p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
