import { Spinner } from "@/components/ui/spinner";
import { api } from "@/convex/_generated/api";
import { useQuery } from "convex/react";
import {
  BadgeDollarSign,
  CalendarCheck,
  CheckCircle2,
  Star,
  Store,
  Users,
} from "lucide-react";
import { StatCard } from "./AdminUI";
import { formatPrice } from "@/lib/format";

export default function AdminDashboard() {
  const stats = useQuery(api.adminView.overview);

  if (stats === undefined) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
        <Spinner className="size-4" /> Loading platform overview…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Everything happening across the platform, at a glance.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <StatCard icon={Store} label="Restaurants" value={String(stats.restaurants)} />
        <StatCard icon={Users} label="Users" value={String(stats.users)} sub={`${stats.byRole.customer} diners · ${stats.byRole.owner} owners · ${stats.byRole.admin} admins`} />
        <StatCard icon={CalendarCheck} label="Bookings" value={String(stats.bookings)} sub={`${stats.bookingsByStatus.completed} completed · ${stats.bookingsByStatus.confirmed} upcoming`} />
        <StatCard icon={CheckCircle2} label="Orders" value={String(stats.orders)} />
        <StatCard
          icon={BadgeDollarSign}
          label="Revenue"
          value={formatPrice(stats.revenueCents)}
          sub="From dine-in orders (excl. cancelled)"
        />
        <StatCard
          icon={Star}
          label="Avg rating"
          value={stats.avgRating ? stats.avgRating.toFixed(1) : "—"}
          sub={`${stats.reviews} reviews`}
          accent="text-amber-500"
        />
      </div>
    </div>
  );
}
