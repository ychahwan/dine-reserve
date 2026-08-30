import { useTranslation } from "react-i18next";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import {
  AlertTriangle,
  BellRing,
  CalendarDays,
  CalendarPlus,
  Check,
  CheckCircle2,
  Clock,
  Lightbulb,
  Loader2,
  Pencil,
  Phone,
  Plus,
  Download,
  Trash2,
  Users,
  Wand2,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import {
  dateFromNow,
  formatDate,
  formatTime,
  isPastDate,
  occasionEmoji,
  today,
} from "@/lib/format";
import { detectGap, gapLabel, stepLabel } from "@/lib/slotgen";
import { DAY_ROWS, DAYS_TO_SHOW, KIND_LABEL, type Kind } from "@/lib/seating";
import { toast } from "sonner";

const OWNER_LIST_PAGE_SIZE = 50;

function useDebouncedValue<T>(value: T, delay = 250): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(id);
  }, [delay, value]);
  return debounced;
}

function maskPhone(value?: string): string {
  if (!value) return "";
  const visible = value.replace(/\D/g, "").slice(-4);
  return visible ? `***${visible}` : "***";
}

function maskEmail(value?: string): string {
  if (!value) return "";
  const [name, domain] = value.split("@");
  return domain ? `${name.slice(0, 1)}***@${domain}` : "***";
}

function csvCell(value: unknown): string {
  // eslint-disable-next-line no-control-regex -- CSV must remove ASCII controls before formula checks.
  const cleaned = String(value).replace(/[\u0000-\u001f\u007f]/g, " ");
  const safe = /^[=+\-@]/.test(cleaned.trimStart()) ? `'${cleaned}` : cleaned;
  return `"${safe.replace(/"/g, '""')}"`;
}

/**
 * L-38: `today()` captured at mount goes stale across midnight in long-lived
 * owner tabs — re-render when the local calendar day changes.
 */
// eslint-disable-next-line react-refresh/only-export-components -- shared by owner pages in this repo
export function useToday(): string {
  const [day, setDay] = useState(today());
  useEffect(() => {
    const id = window.setInterval(() => {
      setDay((prev) => {
        const now = today();
        return prev === now ? prev : now;
      });
    }, 30_000);
    return () => window.clearInterval(id);
  }, []);
  return day;
}

// ---------------------------------------------------------------------------
// Slot rules: service windows + one-off custom slots + diner preview
// ---------------------------------------------------------------------------

type SectionBrief = {
  _id: string;
  name: string;
  kind: Kind;
  smoking: boolean;
  capacity: number;
  description?: string;
};

type RuleDraft = {
  id?: string;
  name: string;
  days: number[];
  start: string;
  end: string;
  step: number;
  sections: string[]; // section ids; empty = all zones
  enabled: boolean;
};

const STEP_OPTIONS = [
  { value: 15, label: "Every 15 min" },
  { value: 30, label: "Every 30 min" },
  { value: 45, label: "Every 45 min" },
  { value: 60, label: "Every hour" },
  { value: 90, label: "Every 90 min" },
  { value: 120, label: "Every 2 hours" },
  { value: 0, label: "Fixed (single seating)" },
];

const RULE_PRESETS = [
  {
    title: "Casual pace",
    desc: "Every 30 min — cafés & fast-casual",
    step: 30,
    start: "12:00",
    end: "23:00",
  },
  {
    title: "Fine dining",
    desc: "Every hour — relaxed seatings",
    step: 60,
    start: "18:00",
    end: "23:00",
  },
  {
    title: "Fixed seatings",
    desc: "Set times only (chef's table)",
    step: 0,
    start: "19:00",
    end: "19:00",
  },
];

export function SlotRulesTab({
  restaurantId,
  sections,
}: {
  restaurantId: string;
  sections: SectionBrief[];
}) {
  const { t } = useTranslation();
  const todayKey = useToday();
  const data = useQuery(api.slotRules.list, {
    restaurantId: restaurantId as never,
  });
  const week = useQuery(api.slotRules.previewWeek, {
    restaurantId: restaurantId as never,
  });
  const saveRule = useMutation(api.slotRules.saveRule);
  const deleteRule = useMutation(api.slotRules.deleteRule);
  const addCustomSlot = useMutation(api.slotRules.addCustomSlot);
  const deleteCustomSlot = useMutation(api.slotRules.deleteCustomSlot);

  const [editing, setEditing] = useState<RuleDraft | null>(null);
  // L-38: rule editor and one-off slot form each get their own saving/error
  // pair so a failure doesn't surface in (or disable) the sibling form.
  const [saving, setSaving] = useState(false); // rule editor
  const [error, setError] = useState<string | null>(null); // rule editor
  const [customSaving, setCustomSaving] = useState(false);
  const [customError, setCustomError] = useState<string | null>(null);
  const [custom, setCustom] = useState({
    date: todayKey,
    time: "19:00",
    sectionId: "__all__",
    note: "",
  });
  const [previewIdx, setPreviewIdx] = useState(0);
  // KB-15: window.confirm is blocked in the sandboxed preview iframe.
  const [deleteRuleConfirm, setDeleteRuleConfirm] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const confirmDeleteRule = async () => {
    if (!deleteRuleConfirm || deleting) return;
    setDeleting(true);
    try {
      await deleteRule({ id: deleteRuleConfirm.id as never });
      toast.success("Window deleted");
      setDeleteRuleConfirm(null);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not delete window.",
      );
    } finally {
      setDeleting(false);
    }
  };

  const rules = data?.rules ?? [];
  const customSlots = data?.customSlots ?? [];
  const sectionName = (id: string) =>
    sections.find((s) => s._id === id)?.name ?? "Zone";

  const startEdit = (r: (typeof rules)[number]) => {
    setEditing({
      id: r._id,
      name: r.name,
      days: [...r.days],
      start: r.start,
      end: r.end,
      step: r.step,
      sections: r.sections ? [...r.sections] : [],
      enabled: r.enabled,
    });
    setError(null);
  };

  const applyPreset = (p: (typeof RULE_PRESETS)[number]) => {
    setEditing({
      name: "Service window",
      days: [1, 2, 3, 4, 5, 6],
      start: p.start,
      end: p.end,
      step: p.step,
      sections: [],
      enabled: true,
    });
    setError(null);
  };

  const toggleDay = (dow: number) => {
    if (!editing) return;
    const days = editing.days.includes(dow)
      ? editing.days.filter((d) => d !== dow)
      : [...editing.days, dow];
    setEditing({ ...editing, days });
  };

  const toggleSection = (sid: string) => {
    if (!editing) return;
    const has = editing.sections.includes(sid);
    setEditing({
      ...editing,
      sections: has
        ? editing.sections.filter((s) => s !== sid)
        : [...editing.sections, sid],
    });
  };

  const handleSaveRule = async () => {
    if (!editing) return;
    setError(null);
    if (!editing.name.trim()) {
      setError("Give the window a name, e.g. “Dinner”.");
      return;
    }
    if (editing.days.length === 0) {
      setError("Pick at least one day.");
      return;
    }
    if (editing.step > 0 && editing.start > editing.end) {
      setError("First seating must be before the last seating.");
      return;
    }
    setSaving(true);
    try {
      await saveRule({
        id: editing.id ? (editing.id as never) : undefined,
        restaurantId: restaurantId as never,
        name: editing.name,
        days: editing.days,
        start: editing.start,
        end: editing.end,
        step: editing.step,
        sections:
          editing.sections.length > 0 ? (editing.sections as never) : undefined,
        enabled: editing.enabled,
      });
      toast.success(
        editing.id
          ? "Window updated — availability rebuilt"
          : "Window added — availability rebuilt",
      );
      setEditing(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save window.");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRule = (r: (typeof rules)[number]) =>
    setDeleteRuleConfirm({ id: r._id, name: r.name });

  const handleAddCustom = async () => {
    setCustomError(null);
    if (!custom.time || isPastDate(custom.date)) {
      setCustomError("Pick a future date and a time for the one-off slot.");
      return;
    }
    setCustomSaving(true);
    try {
      await addCustomSlot({
        restaurantId: restaurantId as never,
        date: custom.date,
        time: custom.time,
        sectionId:
          custom.sectionId === "__all__"
            ? undefined
            : (custom.sectionId as never),
        note: custom.note || undefined,
      });
      setCustom({
        date: todayKey,
        time: "19:00",
        sectionId: "__all__",
        note: "",
      });
      toast.success("One-off slot added");
    } catch (err) {
      setCustomError(
        err instanceof Error ? err.message : "Could not add one-off slot.",
      );
    } finally {
      setCustomSaving(false);
    }
  };

  const handleDeleteCustom = async (id: string) => {
    try {
      await deleteCustomSlot({ id: id as never });
      toast.success("One-off slot removed");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not remove slot.",
      );
    }
  };

  const previewDay = week?.days[previewIdx];

  return (
    <div className="space-y-4 pb-6">
      <p className="text-sm text-muted-foreground">
        Define your own service windows instead of the default 30-minute grid —
        different pacing per window (lunch vs dinner), fixed seatings, or
        zone-only hours. Saving a window rebuilds upcoming availability; booked
        tables are kept.
      </p>

      {/* Presets */}
      <div>
        <p className="mb-2 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
          {t("owner.preset")}
        </p>
        <div className="grid grid-cols-3 gap-2">
          {RULE_PRESETS.map((p) => (
            <button
              key={p.title}
              type="button"
              onClick={() => applyPreset(p)}
              className="rounded-xl border border-border/70 bg-card p-3 text-left transition-colors hover:border-primary/50 hover:bg-primary/5"
            >
              <p className="text-xs font-semibold">{p.title}</p>
              <p className="mt-0.5 text-[10px] leading-snug text-muted-foreground">
                {p.desc}
              </p>
            </button>
          ))}
        </div>
      </div>

      {/* Rules list */}
      {rules.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-xs text-muted-foreground">
          No custom windows yet — diners currently see the default 30-minute
          grid.
        </div>
      ) : (
        <div className="space-y-2">
          {rules.map((r) => (
            <Card
              key={r._id}
              className="rounded-2xl border-border/70 p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold">{r.name}</p>
                    <Badge
                      variant={r.enabled ? "default" : "secondary"}
                      className={cn(!r.enabled && "opacity-60")}
                    >
                      {r.enabled ? "Active" : "Paused"}
                    </Badge>
                    <span className="font-mono text-[11px] font-semibold text-primary">
                      {r.step === 0
                        ? formatTime(r.start)
                        : `${formatTime(r.start)} – ${formatTime(r.end)}`}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {stepLabel(r.step)} ·{" "}
                    {r.days
                      .map((d) =>
                        DAY_ROWS.find((x) => x.dow === d)?.label.slice(0, 3),
                      )
                      .join(", ")}
                    {r.sections && r.sections.length > 0
                      ? ` · ${r.sections.map(sectionName).join(", ")}`
                      : " · All zones"}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Edit rule"
                    onClick={() => startEdit(r)}
                  >
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Delete rule"
                    className="text-destructive"
                    onClick={() => handleDeleteRule(r)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Rule editor */}
      {editing && (
        <Card className="rounded-2xl border-primary/40 p-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Wand2 className="size-4 text-primary" />
              {editing.id ? "Edit window" : "New service window"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="r-name">Window name *</Label>
                <Input
                  id="r-name"
                  value={editing.name}
                  onChange={(e) =>
                    setEditing({ ...editing, name: e.target.value })
                  }
                  placeholder="e.g. Dinner"
                />
              </div>
              <div className="space-y-2">
                <Label>Pacing</Label>
                <Select
                  value={String(editing.step)}
                  onValueChange={(v) =>
                    setEditing({ ...editing, step: Number(v) })
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STEP_OPTIONS.map((s) => (
                      <SelectItem key={s.value} value={String(s.value)}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Days</Label>
              <div className="flex flex-wrap gap-1.5">
                {DAY_ROWS.map((d) => {
                  const on = editing.days.includes(d.dow);
                  return (
                    <button
                      key={d.dow}
                      type="button"
                      onClick={() => toggleDay(d.dow)}
                      className={cn(
                        "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                        on
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-card text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {d.label.slice(0, 3)}
                    </button>
                  );
                })}
              </div>
            </div>

            {editing.step > 0 ? (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="r-start">First seating</Label>
                  <Input
                    id="r-start"
                    type="time"
                    value={editing.start}
                    onChange={(e) =>
                      setEditing({ ...editing, start: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="r-end">Last seating (inclusive)</Label>
                  <Input
                    id="r-end"
                    type="time"
                    value={editing.end}
                    onChange={(e) =>
                      setEditing({ ...editing, end: e.target.value })
                    }
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="r-fixed">Seating time</Label>
                <Input
                  id="r-fixed"
                  type="time"
                  value={editing.start}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      start: e.target.value,
                      end: e.target.value,
                    })
                  }
                />
              </div>
            )}

            <div className="space-y-2">
              <Label>Zones</Label>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setEditing({ ...editing, sections: [] })}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                    editing.sections.length === 0
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card text-muted-foreground hover:text-foreground",
                  )}
                >
                  All zones
                </button>
                {sections.map((s) => {
                  const on = editing.sections.includes(s._id);
                  return (
                    <button
                      key={s._id}
                      type="button"
                      onClick={() => toggleSection(s._id)}
                      className={cn(
                        "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                        on
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-card text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {s.name}
                    </button>
                  );
                })}
              </div>
            </div>

            <button
              type="button"
              onClick={() =>
                setEditing({ ...editing, enabled: !editing.enabled })
              }
              className={cn(
                "flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                editing.enabled
                  ? "border-emerald-600/30 bg-emerald-600/10 text-emerald-700 dark:text-emerald-400"
                  : "border-border bg-card text-muted-foreground",
              )}
            >
              <span
                className={cn(
                  "size-2 rounded-full",
                  editing.enabled ? "bg-emerald-500" : "bg-muted-foreground/40",
                )}
              />
              {editing.enabled ? "Active" : "Paused"}
            </button>

            {error && (
              <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            )}
            <div className="flex gap-2">
              <Button
                onClick={handleSaveRule}
                disabled={saving}
                className="flex-1"
              >
                {saving ? (
                  <>
                    <Loader2 className="size-4 animate-spin" /> Saving…
                  </>
                ) : (
                  <>
                    <Check className="size-4" />{" "}
                    {editing.id ? "Save window" : "Add window"}
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setEditing(null);
                  setError(null);
                }}
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Week preview */}
      <div>
        <p className="mb-2 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
          <CalendarDays className="size-3.5" /> What diners will see
        </p>
        <div className="no-scrollbar horizontal-rail flex gap-2 overflow-x-auto pb-1">
          {(week?.days ?? []).map((d, i) => (
            <button
              key={d.date}
              type="button"
              onClick={() => setPreviewIdx(i)}
              className={cn(
                "flex shrink-0 flex-col items-center rounded-xl border px-3 py-2 transition-colors",
                previewIdx === i
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:text-foreground",
              )}
            >
              <span className="text-[10px] font-medium uppercase opacity-80">
                {new Date(`${d.date}T00:00:00`).toLocaleDateString("en-US", {
                  weekday: "short",
                })}
              </span>
              <span className="text-lg font-bold leading-6">
                {new Date(`${d.date}T00:00:00`).getDate()}
              </span>
            </button>
          ))}
        </div>

        {week === undefined ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <Spinner className="size-4" /> Previewing…
          </div>
        ) : previewDay && !previewDay.open ? (
          <div className="rounded-xl border border-dashed border-border py-6 text-center text-sm text-muted-foreground">
            Closed on {formatDate(previewDay.date)} — enable this day under
            Hours.
          </div>
        ) : previewDay ? (
          <div className="space-y-2">
            {!week.useRules && (
              <p className="flex items-start gap-2 rounded-xl bg-primary/5 px-3.5 py-2.5 text-xs text-muted-foreground">
                <Lightbulb className="mt-0.5 size-3.5 shrink-0 text-primary" />
                Default 30-minute grid in effect. Add a window above to take
                control of pacing.
              </p>
            )}
            {week.useRules &&
              previewDay.sections.every((s) => s.times.length === 0) && (
                <p className="flex items-start gap-2 rounded-xl bg-amber-500/10 px-3.5 py-2.5 text-xs text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                  No windows match this weekday — diners will see no times. Add
                  a rule for this day or a one-off custom slot.
                </p>
              )}
            {previewDay.sections.map((s) => {
              const meta = KIND_LABEL[s.kind];
              const gap = detectGap(s.times);
              return (
                <Card
                  key={s._id}
                  className="rounded-2xl border-border/70 p-3.5 shadow-sm"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "flex size-6 items-center justify-center rounded-lg",
                        meta.cls,
                      )}
                    >
                      <meta.icon className="size-3.5" />
                    </span>
                    <p className="text-sm font-semibold">{s.name}</p>
                    <span className="ml-auto text-[10px] text-muted-foreground">
                      {s.times.length} time{s.times.length === 1 ? "" : "s"}
                    </span>
                  </div>
                  {s.times.length === 0 ? (
                    <p className="mt-2 text-xs text-muted-foreground">
                      {t("owner.noTimesThisDay")}
                    </p>
                  ) : (
                    <>
                      <div className="mt-2.5 flex flex-wrap gap-1.5">
                        {s.times.map((t) => (
                          <span
                            key={t}
                            className="rounded-lg border border-border bg-muted/40 px-2 py-1 text-[11px] font-medium"
                          >
                            {formatTime(t)}
                          </span>
                        ))}
                      </div>
                      {gap && (
                        <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-amber-500/10 px-2.5 py-1.5 text-[11px] text-amber-700 dark:text-amber-400">
                          <AlertTriangle className="mt-0.5 size-3 shrink-0" />
                          Gap of {gapLabel(gap.gapMin)} between{" "}
                          {formatTime(gap.from)} and {formatTime(gap.to)} — no
                          bookings in that window. Intentional?
                        </p>
                      )}
                    </>
                  )}
                </Card>
              );
            })}
          </div>
        ) : null}
      </div>

      {/* One-off custom slots */}
      <div>
        <p className="mb-2 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
          <CalendarPlus className="size-3.5" /> One-off slots (special events)
        </p>
        <Card className="rounded-2xl border-border/70 p-0 shadow-sm">
          <CardContent className="space-y-3 p-4">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="space-y-1.5">
                <Label htmlFor="c-date" className="text-xs">
                  Date
                </Label>
                <Input
                  id="c-date"
                  type="date"
                  min={todayKey}
                  value={custom.date}
                  onChange={(e) =>
                    setCustom({ ...custom, date: e.target.value })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="c-time" className="text-xs">
                  Time
                </Label>
                <Input
                  id="c-time"
                  type="time"
                  value={custom.time}
                  onChange={(e) =>
                    setCustom({ ...custom, time: e.target.value })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="c-zone" className="text-xs">
                  Zone
                </Label>
                <Select
                  value={custom.sectionId}
                  onValueChange={(v) => setCustom({ ...custom, sectionId: v })}
                >
                  <SelectTrigger id="c-zone" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All zones</SelectItem>
                    {sections.map((s) => (
                      <SelectItem key={s._id} value={s._id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="c-note" className="text-xs">
                  Note (optional)
                </Label>
                <Input
                  id="c-note"
                  value={custom.note}
                  onChange={(e) =>
                    setCustom({ ...custom, note: e.target.value })
                  }
                  placeholder="e.g. Jazz night"
                />
              </div>
            </div>
            {customError && (
              <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {customError}
              </p>
            )}
            <Button
              size="sm"
              onClick={handleAddCustom}
              disabled={customSaving}
              className="w-full sm:w-auto"
            >
              {customSaving ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <>
                  <Plus className="size-3.5" /> Add one-off slot
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {customSlots.length > 0 && (
          <div className="mt-2 space-y-2">
            {customSlots
              .slice()
              .sort((a, b) => a.date.localeCompare(b.date))
              .map((c) => (
                <Card
                  key={c._id}
                  className="rounded-2xl border-border/70 p-3.5 shadow-sm"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <CalendarPlus className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">
                        {formatDate(c.date)} · {formatTime(c.time)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {c.sectionId ? sectionName(c.sectionId) : "All zones"}
                        {c.note ? ` · ${c.note}` : ""}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Remove one-off slot"
                      className="shrink-0 text-destructive"
                      onClick={() => handleDeleteCustom(c._id)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </Card>
              ))}
          </div>
        )}
      </div>

      {/* KB-15: in-app delete confirmation (window.confirm is blocked in the
          sandboxed preview iframe) */}
      <AlertDialog
        open={!!deleteRuleConfirm}
        onOpenChange={(open) => {
          if (!open && !deleting) setDeleteRuleConfirm(null);
        }}
      >
        <AlertDialogContent className="max-w-sm rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="tracking-tight">
              Delete “{deleteRuleConfirm?.name}”?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This service window is removed and upcoming unbooked slots are
              rebuilt.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Keep it</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={deleting}
              onClick={(e) => {
                e.preventDefault();
                confirmDeleteRule();
              }}
            >
              {deleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Availability: per-date slot ledger with close/reopen
// ---------------------------------------------------------------------------

export function AvailabilityTab({ restaurantId }: { restaurantId: string }) {
  const todayKey = useToday();
  const [date, setDate] = useState(todayKey);
  const ensureForDate = useMutation(api.availability.ensureForDate);
  const setSlotClosed = useMutation(api.availability.setSlotClosed);
  const [busyId, setBusyId] = useState<string | null>(null);
  // Follow the calendar across midnight until the owner picks another day.
  const autoDayRef = useRef(todayKey);
  useEffect(() => {
    if (autoDayRef.current === todayKey) return;
    setDate((d) => (d === autoDayRef.current ? todayKey : d));
    autoDayRef.current = todayKey;
  }, [todayKey]);

  useEffect(() => {
    if (isPastDate(date)) return;
    ensureForDate({ restaurantId: restaurantId as never, date }).catch(
      () => undefined,
    );
  }, [date, ensureForDate, restaurantId]);

  const availability = useQuery(api.availability.forDate, {
    restaurantId: restaurantId as never,
    date,
  });

  // Recomputed per render so the strip stays anchored to the current day.
  const days = Array.from({ length: DAYS_TO_SHOW }, (_, i) => dateFromNow(i));

  const toggle = async (slotId: string, closed: boolean) => {
    setBusyId(slotId);
    try {
      await setSlotClosed({ slotId: slotId as never, closed: !closed });
      toast.success(closed ? "Slot reopened" : "Slot closed for this time");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not update slot.",
      );
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4 pb-6">
      <p className="text-sm text-muted-foreground">
        Live ledger for the selected day — generated from your weekly hours and
        slot rules. Tap a time to close or reopen it.
      </p>

      <div className="no-scrollbar horizontal-rail flex gap-2 overflow-x-auto pb-1">
        {days.map((d) => (
          <button
            key={d}
            onClick={() => setDate(d)}
            className={cn(
              "flex shrink-0 flex-col items-center rounded-xl border px-3 py-2 transition-colors",
              date === d
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            <span className="text-[10px] font-medium uppercase opacity-80">
              {new Date(`${d}T00:00:00`).toLocaleDateString("en-US", {
                weekday: "short",
              })}
            </span>
            <span className="text-lg font-bold leading-6">
              {new Date(`${d}T00:00:00`).getDate()}
            </span>
            <span className="text-[10px] opacity-80">
              {new Date(`${d}T00:00:00`).toLocaleDateString("en-US", {
                month: "short",
              })}
            </span>
          </button>
        ))}
      </div>

      {availability == null ? (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
          <Spinner className="size-4" /> Loading…
        </div>
      ) : !availability.open ? (
        <div className="rounded-xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
          Closed on {formatDate(date)} — enable this day under Hours.
        </div>
      ) : availability.sections.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
          Add a seating area to publish availability for this day.
        </div>
      ) : (
        availability.sections.map((s) => {
          const meta = KIND_LABEL[s.kind as Kind];
          const slots = s.slots.filter((sl) => !sl.closed && sl.remaining > 0);
          const closed = s.slots.filter((sl) => sl.closed);
          const soldOut = s.slots.filter(
            (sl) => !sl.closed && sl.remaining === 0,
          );
          return (
            <Card
              key={s._id}
              className="rounded-2xl border-border/70 p-4 shadow-sm"
            >
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "flex size-6 items-center justify-center rounded-lg",
                    meta.cls,
                  )}
                >
                  <meta.icon className="size-3.5" />
                </span>
                <p className="font-semibold">{s.name}</p>
                <Badge variant="secondary" className="ml-auto">
                  {s.capacity} seats
                </Badge>
              </div>

              {(slots.length > 0 || soldOut.length > 0) && (
                <>
                  <p className="mb-2 mt-3 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                    Free spots
                  </p>
                  <div className="grid grid-cols-4 gap-2">
                    {slots.map((sl) => (
                      <button
                        key={sl._id}
                        onClick={() => toggle(sl._id, false)}
                        disabled={busyId === sl._id}
                        className="rounded-xl border border-emerald-600/30 bg-emerald-600/5 p-2 text-center transition-all hover:bg-emerald-600/10"
                        title="Tap to close this time"
                      >
                        <span className="block text-xs font-semibold">
                          {formatTime(sl.time)}
                        </span>
                        <span className="block text-[10px] text-emerald-700 dark:text-emerald-400">
                          {sl.remaining} left
                        </span>
                      </button>
                    ))}
                    {soldOut.map((sl) => (
                      <button
                        key={sl._id}
                        onClick={() => toggle(sl._id, false)}
                        disabled={busyId === sl._id}
                        className="rounded-xl border border-border bg-muted/40 p-2 text-center transition-all hover:bg-muted/70"
                        title="Sold out — tap to close this time"
                      >
                        <span className="block text-xs font-semibold text-muted-foreground">
                          {formatTime(sl.time)}
                        </span>
                        <span className="block text-[10px] text-destructive">
                          sold out
                        </span>
                      </button>
                    ))}
                  </div>
                </>
              )}

              {closed.length > 0 && (
                <>
                  <p className="mb-2 mt-3 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                    Closed by you
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {closed.map((sl) => (
                      <button
                        key={sl._id}
                        onClick={() => toggle(sl._id, true)}
                        disabled={busyId === sl._id}
                        className="rounded-xl border border-border bg-card p-2 text-center opacity-70 transition-all hover:opacity-100"
                        title="Tap to reopen"
                      >
                        <span className="block text-xs font-medium line-through">
                          {formatTime(sl.time)}
                        </span>
                        <span className="block text-[10px] text-muted-foreground">
                          closed
                        </span>
                      </button>
                    ))}
                  </div>
                </>
              )}

              {s.slots.length === 0 && (
                <p className="mt-3 text-xs text-muted-foreground">
                  No slots generated for this day yet.
                </p>
              )}
            </Card>
          );
        })
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bookings: owner view with status transitions
// ---------------------------------------------------------------------------

// L-31: map booking status to badge color — green only for confirmed,
// destructive for no-shows, muted for terminal states.
const STATUS_BADGE: Record<string, string> = {
  confirmed: "bg-emerald-600/10 text-emerald-700 dark:text-emerald-400",
  completed: "bg-muted text-muted-foreground",
  no_show: "bg-destructive/10 text-destructive",
  cancelled: "bg-muted text-muted-foreground",
};

export function BookingsTab({ restaurantId }: { restaurantId: string }) {
  const todayKey = useToday();
  const [scope, setScope] = useState<"today" | "week" | "all">("all");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"date" | "name" | "status">("date");
  const [dateFilter, setDateFilter] = useState(""); // YYYY-MM-DD or empty
  const [visibleLimit, setVisibleLimit] = useState(OWNER_LIST_PAGE_SIZE);
  const debouncedSearch = useDebouncedValue(search);

  const bookings = useQuery(api.bookings.byRestaurant, {
    restaurantId: restaurantId as never,
    date: scope === "today" ? todayKey : undefined,
  });
  const waitlist = useQuery(api.waitlist.byRestaurant, {
    restaurantId: restaurantId as never,
    date: scope === "today" ? todayKey : undefined,
  });
  const updateStatus = useMutation(api.bookings.updateStatus);
  const [busyId, setBusyId] = useState<string | null>(null);

  const setStatus = async (
    bookingId: string,
    status: "confirmed" | "completed" | "no_show" | "cancelled",
  ) => {
    setBusyId(bookingId);
    try {
      await updateStatus({ bookingId: bookingId as never, status });
      toast.success("Booking updated");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not update booking.",
      );
    } finally {
      setBusyId(null);
    }
  };

  // Client-side search and filter
  const filtered = useMemo(() => {
    let list = bookings ?? [];

    // Date filter (specific date)
    if (dateFilter) {
      list = list.filter((b) => b.date === dateFilter);
    }

    // Week filter
    if (scope === "week") {
      const now = new Date();
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - now.getDay());
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      const startKey = weekStart.toISOString().slice(0, 10);
      const endKey = weekEnd.toISOString().slice(0, 10);
      list = list.filter((b) => b.date >= startKey && b.date <= endKey);
    }

    // Search by name, code, or phone
    if (debouncedSearch.trim()) {
      const q = debouncedSearch.trim().toLowerCase();
      list = list.filter(
        (b) =>
          b.name.toLowerCase().includes(q) ||
          b.code.toLowerCase().includes(q) ||
          (b.phone && b.phone.includes(q)),
      );
    }

    // Sort
    list = [...list].sort((a, b) => {
      if (sortBy === "name") return a.name.localeCompare(b.name);
      if (sortBy === "status") {
        const order = { confirmed: 0, completed: 1, no_show: 2, cancelled: 3 };
        return (order[a.status] ?? 4) - (order[b.status] ?? 4);
      }
      // default: by date+time
      return `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`);
    });

    return list;
  }, [bookings, scope, debouncedSearch, sortBy, dateFilter]);
  const visibleBookings = filtered.slice(0, visibleLimit);

  return (
    <div className="space-y-4 pb-6">
      {/* Filters row */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {[
            { key: "today" as const, label: "Today" },
            { key: "week" as const, label: "This week" },
            { key: "all" as const, label: "All" },
          ].map((t) => (
            <button
              key={t.key}
              onClick={() => {
                setScope(t.key);
                setDateFilter("");
              }}
              className={cn(
                "rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors",
                scope === t.key && !dateFilter
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
            </button>
          ))}
          <input
            type="date"
            value={dateFilter}
            onChange={(e) => {
              setDateFilter(e.target.value);
              setScope("all");
            }}
            className="h-8 rounded-full border border-border bg-card px-3 text-xs text-muted-foreground"
          />
        </div>
        <div className="flex items-center gap-2">
          <Input
            placeholder="Search name, code, or phone…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 w-48 rounded-full text-xs"
          />
          <Select
            value={sortBy}
            onValueChange={(v) => setSortBy(v as typeof sortBy)}
          >
            <SelectTrigger className="h-8 w-auto rounded-full text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="date">Sort by date</SelectItem>
              <SelectItem value="name">Sort by name</SelectItem>
              <SelectItem value="status">Sort by status</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Waitlist */}
      {(waitlist ?? []).length > 0 && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-amber-700 dark:text-amber-400">
            <BellRing className="size-3.5" /> Waitlist{" "}
            <span className="font-medium normal-case">
              ({waitlist!.length} waiting)
            </span>
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Diners get notified automatically when a cancellation frees a table.
          </p>
          <div className="mt-2.5 space-y-2">
            {waitlist!.slice(0, visibleLimit).map((w) => (
              <div
                key={w._id}
                className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-card px-3.5 py-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {w.name} · {w.partySize}{" "}
                    {w.partySize === 1 ? "guest" : "guests"}
                  </p>
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="size-3" /> {formatTime(w.time)} ·{" "}
                    {w.sectionName ?? "Best available"}
                  </p>
                </div>
                <Badge
                  className={cn(
                    "shrink-0",
                    w.status === "notified"
                      ? "bg-emerald-600/10 text-emerald-700 dark:text-emerald-400"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {w.status === "notified" ? "Notified" : "Waiting"}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      )}

      {bookings === undefined ? (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
          <Spinner className="size-4" /> Loading…
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
          {search || dateFilter
            ? "No bookings match your search."
            : scope === "today"
              ? "No bookings for today yet."
              : "No bookings yet."}
        </div>
      ) : (
        <div className="space-y-2">
          {visibleBookings.map((b) => (
            <Card
              key={b._id}
              className="rounded-2xl border-border/70 p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold">{b.name}</p>
                    {b.occasion && (
                      <Badge variant="secondary" className="gap-1">
                        {occasionEmoji(b.occasion)} {b.occasion}
                      </Badge>
                    )}
                    <Badge className="bg-muted text-muted-foreground">
                      {b.partySize} guests
                    </Badge>
                    <span className="font-mono text-xs font-semibold tracking-widest text-primary">
                      {b.code}
                    </span>
                  </div>
                  <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="size-3" /> {formatDate(b.date)} ·{" "}
                      {formatTime(b.time)}
                    </span>
                    {b.sectionName && <span>{b.sectionName}</span>}
                    {b.phone && (
                      <span className="flex items-center gap-1">
                        <Phone className="size-3" /> {b.phone}
                      </span>
                    )}
                  </p>
                  {b.guests && b.guests.length > 0 && (
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      Guests: {b.guests.map((g) => g.name).join(", ")}
                    </p>
                  )}
                  {b.notes && (
                    <p className="mt-1.5 rounded-lg bg-muted/50 px-2.5 py-1.5 text-xs italic text-muted-foreground">
                      “{b.notes}”
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  {b.checkedInAt && (
                    <Badge className="gap-1 bg-emerald-600/10 text-emerald-700 dark:text-emerald-400">
                      <CheckCircle2 className="size-3" /> Checked in
                    </Badge>
                  )}
                  <Badge
                    className={
                      STATUS_BADGE[b.status] ?? "bg-muted text-muted-foreground"
                    }
                  >
                    {b.status}
                  </Badge>
                </div>
              </div>
              <Separator className="my-3" />
              <div className="flex flex-wrap gap-2">
                {b.status === "confirmed" && (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busyId === b._id}
                      onClick={() => setStatus(b._id, "completed")}
                    >
                      <Check className="size-3.5" /> Complete
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busyId === b._id}
                      onClick={() => setStatus(b._id, "no_show")}
                    >
                      No-show
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive"
                      disabled={busyId === b._id}
                      onClick={() => setStatus(b._id, "cancelled")}
                    >
                      Cancel
                    </Button>
                  </>
                )}
                {b.status === "cancelled" && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busyId === b._id}
                    onClick={() => setStatus(b._id, "confirmed")}
                  >
                    Reinstate
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
      {filtered.length > visibleLimit && (
        <Button
          variant="outline"
          className="w-full"
          onClick={() => setVisibleLimit((n) => n + OWNER_LIST_PAGE_SIZE)}
        >
          Show more
        </Button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Customers: aggregated diner list from all bookings
// ---------------------------------------------------------------------------

type CustomerSummary = {
  userId: string;
  name: string;
  phone?: string;
  email?: string;
  totalVisits: number;
  totalGuests: number;
  lastVisit: string;
  statuses: string[];
};

export function OwnerCustomersTab({ restaurantId }: { restaurantId: string }) {
  const bookings = useQuery(api.bookings.byRestaurant, {
    restaurantId: restaurantId as never,
  });
  const restaurant = useQuery(api.restaurants.get, {
    id: restaurantId as never,
  });
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"visits" | "name" | "lastVisit">(
    "visits",
  );
  const [visibleLimit, setVisibleLimit] = useState(OWNER_LIST_PAGE_SIZE);
  const [exportConfirm, setExportConfirm] = useState(false);
  const debouncedSearch = useDebouncedValue(search);
  const addBlockedUser = useMutation(api.socialize.addBlockedUser);
  const removeBlockedUser = useMutation(api.socialize.removeBlockedUser);
  const [blockBusyId, setBlockBusyId] = useState<string | null>(null);

  const blockedIds = new Set(
    (restaurant?.restaurant.socialize?.blockedUserIds ?? []) as string[],
  );

  const customers = useMemo(() => {
    if (!bookings) return undefined;
    const map = new Map<string, CustomerSummary>();
    for (const b of bookings) {
      // H-19: group by the stable user id (phone/name are display-only fields)
      // so distinct guests sharing a name or phone aren't merged.
      const key = b.userId || b.phone || b.name;
      const existing = map.get(key);
      if (existing) {
        existing.totalVisits++;
        existing.totalGuests += b.partySize;
        if (b.date > existing.lastVisit) existing.lastVisit = b.date;
        if (!existing.statuses.includes(b.status))
          existing.statuses.push(b.status);
        if (b.phone && !existing.phone) existing.phone = b.phone;
        if (b.email && !existing.email) existing.email = b.email;
      } else {
        map.set(key, {
          userId: b.userId,
          name: b.name,
          phone: b.phone,
          email: b.email,
          totalVisits: 1,
          totalGuests: b.partySize,
          lastVisit: b.date,
          statuses: [b.status],
        });
      }
    }
    return Array.from(map.values());
  }, [bookings]);

  const filtered = useMemo(() => {
    if (!customers) return undefined;
    let list = customers;
    if (debouncedSearch.trim()) {
      const q = debouncedSearch.trim().toLowerCase();
      list = list.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.phone && c.phone.includes(q)) ||
          (c.email && c.email.toLowerCase().includes(q)),
      );
    }
    list = [...list].sort((a, b) => {
      if (sortBy === "name") return a.name.localeCompare(b.name);
      if (sortBy === "lastVisit") return b.lastVisit.localeCompare(a.lastVisit);
      return b.totalVisits - a.totalVisits;
    });
    return list;
  }, [customers, debouncedSearch, sortBy]);
  const visibleCustomers = filtered?.slice(0, visibleLimit);

  const handleExport = () => {
    if (!filtered) return;
    const headers = [
      "Name",
      "Phone",
      "Email",
      "Total visits",
      "Total guests",
      "Last visit",
      "Statuses",
    ];
    const rows = filtered.map((c) => [
      c.name,
      maskPhone(c.phone),
      maskEmail(c.email),
      c.totalVisits,
      c.totalGuests,
      c.lastVisit,
      c.statuses.join(", "),
    ]);
    const csv = [headers, ...rows]
      .map((row) => row.map(csvCell).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `customers-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    setExportConfirm(false);
    toast.success(`Exported ${filtered.length} customers to CSV.`);
  };

  return (
    <div className="space-y-4 pb-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          {customers
            ? `${customers.length} unique customer${customers.length === 1 ? "" : "s"} across ${bookings?.length ?? 0} bookings.`
            : "Loading…"}
        </p>
        <div className="flex items-center gap-2">
          <Input
            placeholder="Search name, phone, or email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 w-56 rounded-full text-xs"
          />
          <Select
            value={sortBy}
            onValueChange={(v) => setSortBy(v as typeof sortBy)}
          >
            <SelectTrigger className="h-8 w-auto rounded-full text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="visits">Most visits</SelectItem>
              <SelectItem value="name">Alphabetical</SelectItem>
              <SelectItem value="lastVisit">Recent</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setExportConfirm(true)}
            disabled={!filtered || filtered.length === 0}
          >
            <Download className="size-3.5" /> CSV
          </Button>
        </div>
      </div>

      {filtered === undefined ? (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
          <Spinner className="size-4" /> Loading…
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
          {search ? "No customers match your search." : "No customers yet."}
        </div>
      ) : (
        <div className="space-y-2">
          {visibleCustomers?.map((c) => (
            <Card
              key={c.userId}
              className={cn(
                "rounded-2xl border-border/70 p-4 shadow-sm",
                blockedIds.has(c.userId) && "opacity-60",
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 font-semibold">
                    {c.name}
                    {blockedIds.has(c.userId) && (
                      <Badge className="bg-destructive/10 text-destructive text-[10px]">
                        Blocked
                      </Badge>
                    )}
                  </p>
                  <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    {c.phone && (
                      <span className="flex items-center gap-1">
                        <Phone className="size-3" /> {c.phone}
                      </span>
                    )}
                    {c.email && <span>{c.email}</span>}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <div className="text-right">
                    <p className="text-sm font-semibold text-primary">
                      {c.totalVisits}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      visit{c.totalVisits === 1 ? "" : "s"}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className={cn(
                      "text-xs",
                      blockedIds.has(c.userId)
                        ? "text-primary hover:text-primary"
                        : "text-destructive hover:bg-destructive/10 hover:text-destructive",
                    )}
                    disabled={!c.userId || blockBusyId === c.userId}
                    onClick={async () => {
                      if (!c.userId) return;
                      setBlockBusyId(c.userId);
                      try {
                        if (blockedIds.has(c.userId)) {
                          await removeBlockedUser({
                            restaurantId: restaurantId as never,
                            userId: c.userId as never,
                          });
                        } else {
                          await addBlockedUser({
                            restaurantId: restaurantId as never,
                            userId: c.userId as never,
                          });
                        }
                      } finally {
                        setBlockBusyId(null);
                      }
                    }}
                  >
                    {blockedIds.has(c.userId) ? "Unblock" : "Block"}
                  </Button>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Users className="size-3" /> {c.totalGuests} total guests
                </span>
                <span>·</span>
                <span>Last: {formatDate(c.lastVisit)}</span>
                {c.statuses.length > 1 && (
                  <>
                    <span>·</span>
                    <span className="flex items-center gap-1">
                      {c.statuses.map((s) => (
                        <Badge
                          key={s}
                          variant="secondary"
                          className="text-[10px]"
                        >
                          {s}
                        </Badge>
                      ))}
                    </span>
                  </>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
      {filtered && filtered.length > visibleLimit && (
        <Button
          variant="outline"
          className="w-full"
          onClick={() => setVisibleLimit((n) => n + OWNER_LIST_PAGE_SIZE)}
        >
          Show more
        </Button>
      )}

      <AlertDialog open={exportConfirm} onOpenChange={setExportConfirm}>
        <AlertDialogContent className="max-w-sm rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Export customer data?</AlertDialogTitle>
            <AlertDialogDescription>
              The CSV contains masked contact details by default and may still
              contain sensitive customer history. Store it securely.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleExport}>
              Export masked CSV
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
