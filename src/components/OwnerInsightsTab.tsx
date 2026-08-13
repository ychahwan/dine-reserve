import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/convex/_generated/api";
import { useQuery } from "convex/react";
import {
  BarChart3,
  CalendarDays,
  Clock,
  Percent,
  TrendingUp,
  Users,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatTime } from "@/lib/format";

/**
 * Owner analytics: covers, no-show & cancellation rates, busiest times and
 * waitlist conversion over the last 30 days (see bookings.stats).
 */
export function OwnerInsightsTab({ restaurantId }: { restaurantId: string }) {
  const stats = useQuery(api.bookings.stats, { restaurantId: restaurantId as never });

  if (stats === undefined) {
    return (
      <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
        <Spinner className="size-4" /> Crunching the numbers…
      </div>
    );
  }

  const maxDay = Math.max(...stats.byDay.map((d) => d.covers), 1);
  const maxTime = Math.max(...stats.topTimes.map((t) => t.covers), 1);

  const cards = [
    {
      icon: Users,
      label: `Covers · ${stats.rangeDays}d`,
      value: String(stats.covers),
      sub: `${stats.totalBookings} bookings · avg party ${stats.avgParty}`,
    },
    {
      icon: CalendarDays,
      label: "Completed",
      value: String(stats.completed),
      sub: `${stats.completed} of ${stats.completed + stats.noShow} finished visits`,
    },
    {
      icon: XCircle,
      label: "No-show rate",
      value: `${stats.noShowRate}%`,
      sub: `${stats.noShow} no-shows`,
      accent: stats.noShowRate >= 15 ? "text-rose-600" : "text-emerald-600",
    },
    {
      icon: Percent,
      label: "Cancellation rate",
      value: `${stats.cancellationRate}%`,
      sub: `${stats.cancelled} cancelled`,
    },
  ];

  return (
    <div className="space-y-4 pb-6">
      <p className="text-sm text-muted-foreground">
        How the restaurant performed over the last {stats.rangeDays} days — covers, no-shows,
        cancellations, busy times and waitlist conversion.
      </p>

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-3">
        {cards.map((c) => (
          <Card key={c.label} className="rounded-2xl border-border/70 p-3.5 shadow-sm">
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <c.icon className="size-3.5" /> {c.label}
            </p>
            <p className={cn("mt-1.5 text-2xl font-bold tracking-tight", c.accent)}>{c.value}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{c.sub}</p>
          </Card>
        ))}
      </div>

      {/* Covers per day — last 14 days */}
      <Card className="rounded-2xl border-border/70 p-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <BarChart3 className="size-4 text-primary" /> Covers · last 14 days
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex h-28 items-end gap-1.5">
            {stats.byDay.map((d) => (
              <div key={d.date} className="group flex flex-1 flex-col items-center gap-1">
                <span className="text-[9px] font-medium text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
                  {d.covers}
                </span>
                <div
                  className={cn(
                    "w-full rounded-t-md transition-colors",
                    d.covers > 0 ? "bg-primary/70 group-hover:bg-primary" : "bg-border/60",
                  )}
                  style={{ height: `${Math.max(4, (d.covers / maxDay) * 100)}%` }}
                />
                <span className="text-[9px] text-muted-foreground">
                  {new Date(`${d.date}T00:00:00`).getDate()}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Busiest times */}
      <Card className="rounded-2xl border-border/70 p-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock className="size-4 text-primary" /> Busiest seatings
          </CardTitle>
        </CardHeader>
        <CardContent>
          {stats.topTimes.length === 0 ? (
            <p className="text-sm text-muted-foreground">No completed bookings yet to analyze.</p>
          ) : (
            <div className="space-y-2.5">
              {stats.topTimes.map((t) => (
                <div key={t.time} className="flex items-center gap-3">
                  <span className="w-16 shrink-0 font-mono text-xs font-semibold">
                    {formatTime(t.time)}
                  </span>
                  <div className="h-6 flex-1 overflow-hidden rounded-md bg-muted/50">
                    <div
                      className="flex h-full items-center rounded-md bg-primary/20 pl-2"
                      style={{ width: `${Math.max(8, (t.covers / maxTime) * 100)}%` }}
                    >
                      <span className="text-[10px] font-medium text-primary">{t.covers} covers</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Waitlist conversion */}
      <Card className="rounded-2xl border-border/70 p-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="size-4 text-primary" /> Waitlist pipeline
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="gap-1">
              <Users className="size-3" /> {stats.waitlist.total} joined
            </Badge>
            <Badge className="bg-emerald-600/10 text-emerald-700 dark:text-emerald-400">
              {stats.waitlist.notified} alerted when a table freed up
            </Badge>
            <Badge variant="outline">{stats.waitlist.waiting} still waiting</Badge>
          </div>
          <p className="mt-2.5 text-xs text-muted-foreground">
            {stats.waitlist.total > 0
              ? `${Math.round((stats.waitlist.notified / stats.waitlist.total) * 100)}% of waitlist diners were converted by cancellations.`
              : "No waitlist activity in this window — sold-out times create these alerts automatically."}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
