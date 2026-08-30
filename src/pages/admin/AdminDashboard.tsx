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
import { useTranslation } from "react-i18next";
import { StatCard } from "./AdminUI";
import { formatPrice } from "@/lib/format";

export default function AdminDashboard() {
  const { t } = useTranslation();
  const stats = useQuery(api.adminView.overview);

  if (stats === undefined) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
        <Spinner className="size-4" /> {t("admin.loadingPlatform")}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("admin.dashboard")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("admin.dashboardDesc")}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <StatCard icon={Store} label={t("admin.restaurants")} value={String(stats.restaurants)} />
        <StatCard icon={Users} label={t("admin.users")} value={String(stats.users)} sub={`${stats.byRole.customer} diners · ${stats.byRole.owner} owners · ${stats.byRole.admin} admins`} />
        <StatCard icon={CalendarCheck} label={t("admin.bookings")} value={String(stats.bookings)} sub={`${stats.bookingsByStatus.completed} completed · ${stats.bookingsByStatus.confirmed} upcoming`} />
        <StatCard icon={CheckCircle2} label={t("admin.orders")} value={String(stats.orders)} />
        <StatCard
          icon={BadgeDollarSign}
          label={t("admin.revenue")}
          value={formatPrice(stats.revenueCents)}
          sub={t("admin.revenueSub")}
        />
        <StatCard
          icon={Star}
          label={t("admin.avgRating")}
          value={stats.avgRating ? stats.avgRating.toFixed(1) : "—"}
          sub={`${stats.reviews} ${t("admin.reviews")}`}
          accent="text-amber-500"
        />
      </div>
    </div>
  );
}
