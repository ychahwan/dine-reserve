import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/convex/_generated/api";
import { useAction, useQuery } from "convex/react";
import {
  BarChart3,
  CalendarDays,
  Clock,
  HeartHandshake,
  Percent,
  Repeat,
  Sparkles,
  TrendingUp,
  Users,
  Wallet,
  XCircle,
  Zap,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { formatPrice, formatTime } from "@/lib/format";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * Owner analytics: covers, no-show & cancellation rates, busiest times and
 * waitlist conversion over the last 30 days (see bookings.stats), plus the
 * Analytics 2.0 layer — repeat rate, top diners, spend per cover, a
 * day×hour heatmap — and the AI operations optimizer (Idea #12).
 */
export function OwnerInsightsTab({ restaurantId }: { restaurantId: string }) {
  const stats = useQuery(api.bookings.stats, { restaurantId: restaurantId as never });
  const a2 = useQuery(api.analytics.analytics2, { restaurantId: restaurantId as never });
  const wait = useQuery(api.analytics.waitTimes, { restaurantId: restaurantId as never });
  const ai = useAction(api.ai.ownerInsights);

  const [aiBusy, setAiBusy] = useState(false);
  const [aiResult, setAiResult] = useState<{ insights: any[]; summary: string } | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  const runAi = async () => {
    if (aiBusy) return;
    setAiBusy(true);
    setAiError(null);
    setAiResult(null);
    try {
      const res = await ai({ restaurantId: restaurantId as never, days: 30 });
      setAiResult(res);
    } catch (e) {
      setAiError(e instanceof Error ? e.message : "Could not run AI insights.");
    } finally {
      setAiBusy(false);
    }
  };

  if (stats === undefined || !a2) {
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

      {/* ── Analytics 2.0 (Idea #5) ────────────────────────────────────── */}
      {/* Repeat rate + spend per cover */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="rounded-2xl border-border/70 p-3.5 shadow-sm">
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Repeat className="size-3.5" /> Repeat rate
          </p>
          <p className="mt-1.5 text-2xl font-bold tracking-tight">{a2.repeatRate}%</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {a2.repeatVisits} of {a2.uniqueDiners} diners came back
          </p>
        </Card>
        <Card className="rounded-2xl border-border/70 p-3.5 shadow-sm">
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Wallet className="size-3.5" /> Avg spend / cover
          </p>
          <p className="mt-1.5 text-2xl font-bold tracking-tight">
            {a2.avgSpendPerCoverCents > 0 ? formatPrice(a2.avgSpendPerCoverCents) : "—"}
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {a2.revenueCents > 0 ? `${formatPrice(a2.revenueCents)} dine-in revenue` : "No dine-in orders yet"}
          </p>
        </Card>
      </div>

      {/* Wait-time intelligence (Idea #3) */}
      {wait && wait.summary && (
        <Card className="rounded-2xl border-border/70 p-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock className="size-4 text-primary" /> Pace & punctuality
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">{wait.summary}</p>
            <p className="mt-1.5 text-xs text-muted-foreground">
              From {wait.sampleSize} bookings over {wait.rangeDays} days · {wait.noShowRate}% no-show in window
            </p>
          </CardContent>
        </Card>
      )}

      {/* Day × hour heatmap */}
      {a2.heatmap.length > 0 && (
        <Card className="rounded-2xl border-border/70 p-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarDays className="size-4 text-primary" /> Busiest moments (day × hour)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <div className="grid min-w-[420px] grid-cols-[36px_repeat(6,1fr)] gap-1">
                <div />
                {[0, 1, 2, 3, 4, 5].map((d) => (
                  <div key={d} className="text-center text-[9px] font-medium text-muted-foreground">
                    {DAY_NAMES[d]}
                  </div>
                ))}
                {Array.from({ length: 12 }, (_, i) => i + 12).map((hour) => (
                  <div key={hour} className="contents">
                    <div className="flex items-center text-[9px] text-muted-foreground">{hour}:00</div>
                    {[0, 1, 2, 3, 4, 5].map((d) => {
                      const cell = a2.heatmap.find((h) => h.day === d && h.hour === hour);
                      const covers = cell?.covers ?? 0;
                      const maxCell = Math.max(...a2.heatmap.map((h) => h.covers), 1);
                      return (
                        <div
                          key={`${d}-${hour}`}
                          title={covers > 0 ? `${DAY_NAMES[d]} ${hour}:00 — ${covers} covers` : ""}
                          className={cn(
                            "h-6 rounded-md",
                            covers === 0
                              ? "bg-muted/40"
                              : covers / maxCell > 0.66
                                ? "bg-primary"
                                : covers / maxCell > 0.33
                                  ? "bg-primary/60"
                                  : "bg-primary/30",
                          )}
                        />
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Top diners */}
      {a2.topDiners.length > 0 && (
        <Card className="rounded-2xl border-border/70 p-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <HeartHandshake className="size-4 text-primary" /> Your regulars
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {a2.topDiners.map((d, i) => (
                <div key={d.userId} className="flex items-center gap-3">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-bold text-muted-foreground">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{d.name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {d.visits} visit{d.visits === 1 ? "" : "s"} · {d.covers} covers
                      {d.spendCents > 0 ? ` · ${formatPrice(d.spendCents)}` : ""}
                    </p>
                  </div>
                  {d.visits >= 3 && (
                    <Badge className="shrink-0 bg-amber-500/10 text-amber-700 dark:text-amber-400">VIP</Badge>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── AI operations optimizer (Idea #12) ──────────────────────────── */}
      <Card className="rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/5 to-transparent p-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="size-4 text-primary" /> AI operations advisor
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Ask Gemini to read your bookings, no-shows, spend and reviews, and propose
            concrete changes — deposits for no-show nights, menu signals, promotion ideas.
          </p>
          <Button
            className="mt-3 gap-2"
            onClick={runAi}
            disabled={aiBusy}
          >
            {aiBusy ? <Spinner className="size-4" /> : <Zap className="size-4" />}
            {aiBusy ? "Analyzing…" : aiResult ? "Re-run analysis" : "Run AI analysis"}
          </Button>
          {aiError && (
            <p className="mt-3 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {aiError}
            </p>
          )}
          {aiResult && (
            <div className="mt-4 space-y-2.5">
              {aiResult.summary && (
                <p className="text-sm font-medium text-primary">{aiResult.summary}</p>
              )}
              {aiResult.insights.map((ins, i) => (
                <div key={i} className="rounded-xl border border-border/70 bg-card p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold">{ins.title}</p>
                    <Badge
                      variant="outline"
                      className={cn(
                        ins.priority === "high"
                          ? "border-rose-500/40 text-rose-600 dark:text-rose-400"
                          : ins.priority === "medium"
                            ? "border-amber-500/40 text-amber-600 dark:text-amber-400"
                            : "border-emerald-500/40 text-emerald-600 dark:text-emerald-400",
                      )}
                    >
                      {ins.priority}
                    </Badge>
                  </div>
                  {ins.detail && <p className="mt-1 text-xs text-muted-foreground">{ins.detail}</p>}
                  {ins.action && (
                    <p className="mt-1.5 flex items-start gap-1.5 text-xs font-medium text-primary">
                      <Zap className="mt-0.5 size-3 shrink-0" /> {ins.action}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
