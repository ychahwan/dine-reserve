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
  Clock,
  Lightbulb,
  Loader2,
  Pencil,
  Phone,
  Plus,
  Trash2,
  Wand2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { dateFromNow, formatDate, formatTime, isPastDate, occasionEmoji, today } from "@/lib/format";
import { detectGap, gapLabel, stepLabel } from "@/lib/slotgen";
import { DAY_ROWS, DAYS_TO_SHOW, KIND_LABEL, type Kind } from "@/lib/seating";
import { toast } from "sonner";

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
  { title: "Casual pace", desc: "Every 30 min — cafés & fast-casual", step: 30, start: "12:00", end: "23:00" },
  { title: "Fine dining", desc: "Every hour — relaxed seatings", step: 60, start: "18:00", end: "23:00" },
  { title: "Fixed seatings", desc: "Set times only (chef's table)", step: 0, start: "19:00", end: "19:00" },
];

export function SlotRulesTab({ restaurantId, sections }: { restaurantId: string; sections: SectionBrief[] }) {
  const data = useQuery(api.slotRules.list, { restaurantId: restaurantId as never });
  const week = useQuery(api.slotRules.previewWeek, { restaurantId: restaurantId as never });
  const saveRule = useMutation(api.slotRules.saveRule);
  const deleteRule = useMutation(api.slotRules.deleteRule);
  const addCustomSlot = useMutation(api.slotRules.addCustomSlot);
  const deleteCustomSlot = useMutation(api.slotRules.deleteCustomSlot);

  const [editing, setEditing] = useState<RuleDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [custom, setCustom] = useState({ date: today(), time: "19:00", sectionId: "__all__", note: "" });
  const [previewIdx, setPreviewIdx] = useState(0);

  const rules = data?.rules ?? [];
  const customSlots = data?.customSlots ?? [];
  const sectionName = (id: string) => sections.find((s) => s._id === id)?.name ?? "Zone";

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
    setEditing({ name: "Service window", days: [1, 2, 3, 4, 5, 6], start: p.start, end: p.end, step: p.step, sections: [], enabled: true });
    setError(null);
  };

  const toggleDay = (dow: number) => {
    if (!editing) return;
    const days = editing.days.includes(dow) ? editing.days.filter((d) => d !== dow) : [...editing.days, dow];
    setEditing({ ...editing, days });
  };

  const toggleSection = (sid: string) => {
    if (!editing) return;
    const has = editing.sections.includes(sid);
    setEditing({ ...editing, sections: has ? editing.sections.filter((s) => s !== sid) : [...editing.sections, sid] });
  };

  const handleSaveRule = async () => {
    if (!editing) return;
    setError(null);
    if (!editing.name.trim()) { setError("Give the window a name, e.g. “Dinner”."); return; }
    if (editing.days.length === 0) { setError("Pick at least one day."); return; }
    if (editing.step > 0 && editing.start > editing.end) { setError("First seating must be before the last seating."); return; }
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
        sections: editing.sections.length > 0 ? (editing.sections as never) : undefined,
        enabled: editing.enabled,
      });
      toast.success(editing.id ? "Window updated — availability rebuilt" : "Window added — availability rebuilt");
      setEditing(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save window.");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRule = async (id: string) => {
    if (!window.confirm("Delete this window? Upcoming unbooked slots will be rebuilt.")) return;
    try {
      await deleteRule({ id: id as never });
      toast.success("Window deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete window.");
    }
  };

  const handleAddCustom = async () => {
    setError(null);
    if (!custom.time || isPastDate(custom.date)) { setError("Pick a future date and a time for the one-off slot."); return; }
    setSaving(true);
    try {
      await addCustomSlot({
        restaurantId: restaurantId as never,
        date: custom.date,
        time: custom.time,
        sectionId: custom.sectionId === "__all__" ? undefined : (custom.sectionId as never),
        note: custom.note || undefined,
      });
      setCustom({ date: today(), time: "19:00", sectionId: "__all__", note: "" });
      toast.success("One-off slot added");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add one-off slot.");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCustom = async (id: string) => {
    try {
      await deleteCustomSlot({ id: id as never });
      toast.success("One-off slot removed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not remove slot.");
    }
  };

  const previewDay = week?.days[previewIdx];

  return (
    <div className="space-y-4 pb-6">
      <p className="text-sm text-muted-foreground">
        Define your own service windows instead of the default 30-minute grid — different pacing
        per window (lunch vs dinner), fixed seatings, or zone-only hours. Saving a window rebuilds
        upcoming availability; booked tables are kept.
      </p>

      {/* Presets */}
      <div>
        <p className="mb-2 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">Start from a preset</p>
        <div className="grid grid-cols-3 gap-2">
          {RULE_PRESETS.map((p) => (
            <button
              key={p.title}
              type="button"
              onClick={() => applyPreset(p)}
              className="rounded-xl border border-border/70 bg-card p-3 text-left transition-colors hover:border-primary/50 hover:bg-primary/5"
            >
              <p className="text-xs font-semibold">{p.title}</p>
              <p className="mt-0.5 text-[10px] leading-snug text-muted-foreground">{p.desc}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Rules list */}
      {rules.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-xs text-muted-foreground">
          No custom windows yet — diners currently see the default 30-minute grid.
        </div>
      ) : (
        <div className="space-y-2">
          {rules.map((r) => (
            <Card key={r._id} className="rounded-2xl border-border/70 p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold">{r.name}</p>
                    <Badge variant={r.enabled ? "default" : "secondary"} className={cn(!r.enabled && "opacity-60")}>
                      {r.enabled ? "Active" : "Paused"}
                    </Badge>
                    <span className="font-mono text-[11px] font-semibold text-primary">
                      {r.step === 0 ? formatTime(r.start) : `${formatTime(r.start)} – ${formatTime(r.end)}`}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {stepLabel(r.step)} ·{" "}
                    {r.days.map((d) => DAY_ROWS.find((x) => x.dow === d)?.label.slice(0, 3)).join(", ")}
                    {r.sections && r.sections.length > 0 ? ` · ${r.sections.map(sectionName).join(", ")}` : " · All zones"}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button variant="ghost" size="icon-sm" aria-label="Edit rule" onClick={() => startEdit(r)}>
                    <Pencil className="size-4" />
                  </Button>
                  <Button variant="ghost" size="icon-sm" aria-label="Delete rule" className="text-destructive" onClick={() => handleDeleteRule(r._id)}>
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
                <Input id="r-name" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="e.g. Dinner" />
              </div>
              <div className="space-y-2">
                <Label>Pacing</Label>
                <Select value={String(editing.step)} onValueChange={(v) => setEditing({ ...editing, step: Number(v) })}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STEP_OPTIONS.map((s) => (
                      <SelectItem key={s.value} value={String(s.value)}>{s.label}</SelectItem>
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
                  <Input id="r-start" type="time" value={editing.start} onChange={(e) => setEditing({ ...editing, start: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="r-end">Last seating (inclusive)</Label>
                  <Input id="r-end" type="time" value={editing.end} onChange={(e) => setEditing({ ...editing, end: e.target.value })} />
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="r-fixed">Seating time</Label>
                <Input
                  id="r-fixed"
                  type="time"
                  value={editing.start}
                  onChange={(e) => setEditing({ ...editing, start: e.target.value, end: e.target.value })}
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
              onClick={() => setEditing({ ...editing, enabled: !editing.enabled })}
              className={cn(
                "flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                editing.enabled
                  ? "border-emerald-600/30 bg-emerald-600/10 text-emerald-700 dark:text-emerald-400"
                  : "border-border bg-card text-muted-foreground",
              )}
            >
              <span className={cn("size-2 rounded-full", editing.enabled ? "bg-emerald-500" : "bg-muted-foreground/40")} />
              {editing.enabled ? "Active" : "Paused"}
            </button>

            {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
            <div className="flex gap-2">
              <Button onClick={handleSaveRule} disabled={saving} className="flex-1">
                {saving ? <><Loader2 className="size-4 animate-spin" /> Saving…</> : <><Check className="size-4" /> {editing.id ? "Save window" : "Add window"}</>}
              </Button>
              <Button variant="outline" onClick={() => { setEditing(null); setError(null); }}>
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
        <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
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
                {new Date(`${d.date}T00:00:00`).toLocaleDateString("en-US", { weekday: "short" })}
              </span>
              <span className="text-lg font-bold leading-6">{new Date(`${d.date}T00:00:00`).getDate()}</span>
            </button>
          ))}
        </div>

        {week === undefined ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <Spinner className="size-4" /> Previewing…
          </div>
        ) : previewDay && !previewDay.open ? (
          <div className="rounded-xl border border-dashed border-border py-6 text-center text-sm text-muted-foreground">
            Closed on {formatDate(previewDay.date)} — enable this day under Hours.
          </div>
        ) : previewDay ? (
          <div className="space-y-2">
            {!week.useRules && (
              <p className="flex items-start gap-2 rounded-xl bg-primary/5 px-3.5 py-2.5 text-xs text-muted-foreground">
                <Lightbulb className="mt-0.5 size-3.5 shrink-0 text-primary" />
                Default 30-minute grid in effect. Add a window above to take control of pacing.
              </p>
            )}
            {week.useRules && previewDay.sections.every((s) => s.times.length === 0) && (
              <p className="flex items-start gap-2 rounded-xl bg-amber-500/10 px-3.5 py-2.5 text-xs text-amber-700 dark:text-amber-400">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                No windows match this weekday — diners will see no times. Add a rule for this day or a one-off custom slot.
              </p>
            )}
            {previewDay.sections.map((s) => {
              const meta = KIND_LABEL[s.kind];
              const gap = detectGap(s.times);
              return (
                <Card key={s._id} className="rounded-2xl border-border/70 p-3.5 shadow-sm">
                  <div className="flex items-center gap-2">
                    <span className={cn("flex size-6 items-center justify-center rounded-lg", meta.cls)}>
                      <meta.icon className="size-3.5" />
                    </span>
                    <p className="text-sm font-semibold">{s.name}</p>
                    <span className="ml-auto text-[10px] text-muted-foreground">
                      {s.times.length} time{s.times.length === 1 ? "" : "s"}
                    </span>
                  </div>
                  {s.times.length === 0 ? (
                    <p className="mt-2 text-xs text-muted-foreground">No times this day.</p>
                  ) : (
                    <>
                      <div className="mt-2.5 flex flex-wrap gap-1.5">
                        {s.times.map((t) => (
                          <span key={t} className="rounded-lg border border-border bg-muted/40 px-2 py-1 text-[11px] font-medium">
                            {formatTime(t)}
                          </span>
                        ))}
                      </div>
                      {gap && (
                        <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-amber-500/10 px-2.5 py-1.5 text-[11px] text-amber-700 dark:text-amber-400">
                          <AlertTriangle className="mt-0.5 size-3 shrink-0" />
                          Gap of {gapLabel(gap.gapMin)} between {formatTime(gap.from)} and {formatTime(gap.to)} — no bookings in that window. Intentional?
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
                <Label htmlFor="c-date" className="text-xs">Date</Label>
                <Input id="c-date" type="date" min={today()} value={custom.date} onChange={(e) => setCustom({ ...custom, date: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="c-time" className="text-xs">Time</Label>
                <Input id="c-time" type="time" value={custom.time} onChange={(e) => setCustom({ ...custom, time: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="c-zone" className="text-xs">Zone</Label>
                <Select value={custom.sectionId} onValueChange={(v) => setCustom({ ...custom, sectionId: v })}>
                  <SelectTrigger id="c-zone" className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All zones</SelectItem>
                    {sections.map((s) => (
                      <SelectItem key={s._id} value={s._id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="c-note" className="text-xs">Note (optional)</Label>
                <Input id="c-note" value={custom.note} onChange={(e) => setCustom({ ...custom, note: e.target.value })} placeholder="e.g. Jazz night" />
              </div>
            </div>
            {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
            <Button size="sm" onClick={handleAddCustom} disabled={saving} className="w-full sm:w-auto">
              {saving ? <Loader2 className="size-3.5 animate-spin" /> : <><Plus className="size-3.5" /> Add one-off slot</>}
            </Button>
          </CardContent>
        </Card>

        {customSlots.length > 0 && (
          <div className="mt-2 space-y-2">
            {customSlots
              .slice()
              .sort((a, b) => a.date.localeCompare(b.date))
              .map((c) => (
                <Card key={c._id} className="rounded-2xl border-border/70 p-3.5 shadow-sm">
                  <div className="flex items-center gap-3">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <CalendarPlus className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{formatDate(c.date)} · {formatTime(c.time)}</p>
                      <p className="text-xs text-muted-foreground">
                        {c.sectionId ? sectionName(c.sectionId) : "All zones"}
                        {c.note ? ` · ${c.note}` : ""}
                      </p>
                    </div>
                    <Button variant="ghost" size="icon-sm" aria-label="Remove one-off slot" className="shrink-0 text-destructive" onClick={() => handleDeleteCustom(c._id)}>
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </Card>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Availability: per-date slot ledger with close/reopen
// ---------------------------------------------------------------------------

export function AvailabilityTab({ restaurantId }: { restaurantId: string }) {
  const [date, setDate] = useState(today());
  const ensureForDate = useMutation(api.availability.ensureForDate);
  const setSlotClosed = useMutation(api.availability.setSlotClosed);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (isPastDate(date)) return;
    ensureForDate({ restaurantId: restaurantId as never, date }).catch(() => undefined);
  }, [date, ensureForDate, restaurantId]);

  const availability = useQuery(api.availability.forDate, {
    restaurantId: restaurantId as never,
    date,
  });

  const days = useMemo(() => Array.from({ length: DAYS_TO_SHOW }, (_, i) => dateFromNow(i)), []);

  const toggle = async (slotId: string, closed: boolean) => {
    setBusyId(slotId);
    try {
      await setSlotClosed({ slotId: slotId as never, closed: !closed });
      toast.success(closed ? "Slot reopened" : "Slot closed for this time");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update slot.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4 pb-6">
      <p className="text-sm text-muted-foreground">
        Live ledger for the selected day — generated from your weekly hours and slot rules.
        Tap a time to close or reopen it.
      </p>

      <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
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
              {new Date(`${d}T00:00:00`).toLocaleDateString("en-US", { weekday: "short" })}
            </span>
            <span className="text-lg font-bold leading-6">{new Date(`${d}T00:00:00`).getDate()}</span>
            <span className="text-[10px] opacity-80">
              {new Date(`${d}T00:00:00`).toLocaleDateString("en-US", { month: "short" })}
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
          const soldOut = s.slots.filter((sl) => !sl.closed && sl.remaining === 0);
          return (
            <Card key={s._id} className="rounded-2xl border-border/70 p-4 shadow-sm">
              <div className="flex items-center gap-2">
                <span className={cn("flex size-6 items-center justify-center rounded-lg", meta.cls)}>
                  <meta.icon className="size-3.5" />
                </span>
                <p className="font-semibold">{s.name}</p>
                <Badge variant="secondary" className="ml-auto">{s.capacity} seats</Badge>
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
                        <span className="block text-xs font-semibold">{formatTime(sl.time)}</span>
                        <span className="block text-[10px] text-emerald-700 dark:text-emerald-400">
                          {sl.remaining} left
                        </span>
                      </button>
                    ))}
                    {soldOut.map((sl) => (
                      <button
                        key={sl._id}
                        onClick={() => toggle(sl._id, false)}
                        className="rounded-xl border border-border bg-muted/40 p-2 text-center transition-all hover:bg-muted/70"
                        title="Sold out — tap to reopen after a cancellation"
                      >
                        <span className="block text-xs font-semibold text-muted-foreground">{formatTime(sl.time)}</span>
                        <span className="block text-[10px] text-destructive">sold out</span>
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
                        <span className="block text-xs font-medium line-through">{formatTime(sl.time)}</span>
                        <span className="block text-[10px] text-muted-foreground">closed</span>
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

export function BookingsTab({ restaurantId }: { restaurantId: string }) {
  // default to All so a booking made for any date is visible right away
  const [scope, setScope] = useState<"today" | "all">("all");
  const bookings = useQuery(api.bookings.byRestaurant, {
    restaurantId: restaurantId as never,
    date: scope === "today" ? today() : undefined,
  });
  const waitlist = useQuery(api.waitlist.byRestaurant, {
    restaurantId: restaurantId as never,
    date: scope === "today" ? today() : undefined,
  });
  const updateStatus = useMutation(api.bookings.updateStatus);
  const [busyId, setBusyId] = useState<string | null>(null);

  const setStatus = async (bookingId: string, status: "confirmed" | "completed" | "no_show" | "cancelled") => {
    setBusyId(bookingId);
    try {
      await updateStatus({ bookingId: bookingId as never, status });
      toast.success("Booking updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update booking.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4 pb-6">
      <div className="flex gap-2">
        {[
          { key: "today" as const, label: "Today" },
          { key: "all" as const, label: "All" },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setScope(t.key)}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors",
              scope === t.key
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Waitlist */}
      {(waitlist ?? []).length > 0 && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-amber-700 dark:text-amber-400">
            <BellRing className="size-3.5" /> Waitlist{" "}
            <span className="font-medium normal-case">({waitlist!.length} waiting)</span>
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Diners get notified automatically when a cancellation frees a table.
          </p>
          <div className="mt-2.5 space-y-2">
            {waitlist!.map((w) => (
              <div
                key={w._id}
                className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-card px-3.5 py-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {w.name} · {w.partySize} {w.partySize === 1 ? "guest" : "guests"}
                  </p>
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="size-3" /> {formatTime(w.time)} · {w.sectionName ?? "Best available"}
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
      ) : bookings.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
          {scope === "today" ? "No bookings for today yet." : "No bookings yet."}
        </div>
      ) : (
        <div className="space-y-2">
          {bookings.map((b) => (
            <Card key={b._id} className="rounded-2xl border-border/70 p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold">{b.name}</p>
                    {b.occasion && (
                      <Badge variant="secondary" className="gap-1">
                        {occasionEmoji(b.occasion)} {b.occasion}
                      </Badge>
                    )}
                    <Badge className="bg-muted text-muted-foreground">{b.partySize} guests</Badge>
                    <span className="font-mono text-xs font-semibold tracking-widest text-primary">{b.code}</span>
                  </div>
                  <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><Clock className="size-3" /> {formatDate(b.date)} · {formatTime(b.time)}</span>
                    {b.sectionName && <span>{b.sectionName}</span>}
                    {b.phone && <span className="flex items-center gap-1"><Phone className="size-3" /> {b.phone}</span>}
                  </p>
                  {b.notes && <p className="mt-1.5 rounded-lg bg-muted/50 px-2.5 py-1.5 text-xs italic text-muted-foreground">“{b.notes}”</p>}
                </div>
                <Badge className="bg-emerald-600/10 text-emerald-700 dark:text-emerald-400">{b.status}</Badge>
              </div>
              <Separator className="my-3" />
              <div className="flex flex-wrap gap-2">
                {b.status === "confirmed" && (
                  <>
                    <Button size="sm" variant="outline" disabled={busyId === b._id} onClick={() => setStatus(b._id, "completed")}>
                      <Check className="size-3.5" /> Complete
                    </Button>
                    <Button size="sm" variant="outline" disabled={busyId === b._id} onClick={() => setStatus(b._id, "no_show")}>
                      No-show
                    </Button>
                    <Button size="sm" variant="ghost" className="text-destructive" disabled={busyId === b._id} onClick={() => setStatus(b._id, "cancelled")}>
                      Cancel
                    </Button>
                  </>
                )}
                {b.status === "cancelled" && (
                  <Button size="sm" variant="outline" disabled={busyId === b._id} onClick={() => setStatus(b._id, "confirmed")}>
                    Reinstate
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
