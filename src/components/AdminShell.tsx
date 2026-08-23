import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { api } from "@/convex/_generated/api";
import { useQuery } from "convex/react";
import { useState, useEffect } from "react";
import {
  LayoutDashboard,
  Bot,
  Loader2,
  LogOut,
  Menu,
  PlusCircle,
  ScrollText,
  Settings,
  ShieldCheck,
  Star,
  Store,
  UserCog,
  Users,
  X,
} from "lucide-react";
import { NavLink, Navigate, Outlet, useNavigate } from "react-router";
import { cn } from "@/lib/utils";

/* ── Grouped navigation ── */
const NAV_GROUPS = [
  {
    heading: "Overview",
    items: [
      { to: "/admin", end: true, icon: LayoutDashboard, label: "Dashboard" },
    ],
  },
  {
    heading: "Platform Data",
    items: [
      { to: "/admin/restaurants", icon: Store, label: "Restaurants" },
      { to: "/admin/users", icon: Users, label: "Users" },
      { to: "/admin/reviews", icon: Star, label: "Reviews" },
    ],
  },
  {
    heading: "AI & Automation",
    items: [
      { to: "/admin/ai", icon: Bot, label: "AI workspace" },
    ],
  },
  {
    heading: "Administration",
    items: [
      { to: "/admin/audit", icon: ScrollText, label: "Audit log" },
      { to: "/admin/settings", icon: Settings, label: "Settings" },
    ],
  },
];

const ACTIONS = [
  { to: "/admin/register", icon: PlusCircle, label: "Register restaurant" },
  { to: "/admin/tag", icon: UserCog, label: "Tag owner" },
];

/* ── Sidebar nav renderer (shared between desktop & mobile drawer) ── */
function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  return (
    <>
      {NAV_GROUPS.map((group, gi) => (
        <div key={group.heading} className={cn(gi > 0 && "mt-4")}>
          <p className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            {group.heading}
          </p>
          <div className="flex flex-col gap-0.5">
            {group.items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={onNavigate}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
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
          </div>
        </div>
      ))}

      {/* Actions */}
      <div className="mt-4 border-t border-border/60 pt-4">
        <p className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          Quick Actions
        </p>
        <div className="flex flex-col gap-0.5">
          {ACTIONS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={onNavigate}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
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
        </div>
      </div>

      {/* User info + sign out */}
      <div className="mt-auto border-t border-border/60 pt-4">
        <p className="truncate px-3 text-xs font-medium">{user.name ?? "Admin"}</p>
        <p className="truncate px-3 text-xs text-muted-foreground">{user.phone ?? user.email ?? ""}</p>
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
    </>
  );
}

export default function AdminShell() {
  const { user, isLoading, signOut } = useAuth();
  const isAdmin = useQuery(api.admin.isAdmin);
  const navigate = useNavigate();
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Close drawer on route change (via Escape key)
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawerOpen(false);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  // Lock body scroll when drawer is open
  useEffect(() => {
    document.body.style.overflow = drawerOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [drawerOpen]);

  if (isLoading || isAdmin === undefined) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-background">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </main>
    );
  }
  if (!user) return <Navigate to="/auth" replace />;
  if (!isAdmin) return <Navigate to="/dashboard" replace />;

  return (
    <div className="min-h-dvh bg-muted/30 lg:flex">
      {/* ── Desktop sidebar ── */}
      <aside className="hidden lg:flex lg:w-60 lg:shrink-0 lg:flex-col border-r border-border/60 bg-background">
        <div className="flex h-14 items-center gap-2.5 px-4 border-b border-border/60">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <ShieldCheck className="size-4" />
          </span>
          <div className="leading-tight">
            <p className="text-sm font-semibold tracking-tight">Kamix Admin</p>
            <p className="text-xs text-muted-foreground">Platform console</p>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-3">
          <SidebarNav />
        </nav>
      </aside>

      {/* ── Mobile drawer overlay ── */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm lg:hidden"
          onClick={() => setDrawerOpen(false)}
        />
      )}

      {/* ── Mobile drawer ── */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-border/60 bg-background shadow-xl transition-transform duration-200 ease-in-out lg:hidden",
          drawerOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-14 items-center justify-between gap-2.5 border-b border-border/60 px-4">
          <div className="flex items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <ShieldCheck className="size-4" />
            </span>
            <div className="leading-tight">
              <p className="text-sm font-semibold tracking-tight">Kamix Admin</p>
              <p className="text-xs text-muted-foreground">Platform console</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setDrawerOpen(false)}
            aria-label="Close menu"
          >
            <X className="size-4" />
          </Button>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-3">
          <SidebarNav onNavigate={() => setDrawerOpen(false)} />
        </nav>
      </aside>

      {/* ── Content area ── */}
      <main className="min-w-0 flex-1">
        <div className="flex h-14 items-center justify-between border-b border-border/60 bg-background px-4 lg:px-6">
          {/* Mobile: hamburger + brand */}
          <div className="flex items-center gap-2 lg:hidden">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setDrawerOpen(true)}
              aria-label="Open navigation"
            >
              <Menu className="size-5" />
            </Button>
            <span className="text-sm font-semibold text-muted-foreground">Admin</span>
          </div>

          <div className="flex items-center gap-1 ml-auto">
            <NavLink
              to="/admin/register"
              className="hidden sm:inline-flex items-center gap-1.5 rounded-lg bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary transition-colors hover:bg-primary/20"
            >
              <PlusCircle className="size-4" />
              Register restaurant
            </NavLink>
            <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => navigate("/")}>
              View app
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-muted-foreground"
              onClick={async () => {
                await signOut();
                navigate("/");
              }}
            >
              <LogOut className="size-4" />
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
