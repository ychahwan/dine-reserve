import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { api } from "@/convex/_generated/api";
import { useAction, useMutation } from "convex/react";
import {
  BadgeCheck,
  Bot,
  Check,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  MessageSquareText,
  RotateCcw,
  Save,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type SettingRow = {
  key: string;
  configured: boolean;
  masked: string;
  source: "db" | "env" | "unset";
  updatedAt: number;
};

/** Friendly metadata for each known setting key. */
const META: Record<string, { label: string; group: string; hint: string; secret: boolean; placeholder: string }> = {
  GEMINI_API_KEY: {
    label: "Gemini API key",
    group: "AI",
    hint: "Used by the diner concierge and the owner ops advisor (Google AI Studio).",
    secret: true,
    placeholder: "Paste the Gemini API key",
  },
  AI_SYSTEM_PROMPT: {
    label: "AI system prompt",
    group: "AI",
    hint: "Base behavior used by the diner concierge. Customer data, knowledge, and semantic rules are appended at runtime.",
    secret: false,
    placeholder: "Describe how Kamix AI should behave…",
  },
  AI_MODEL: {
    label: "AI model",
    group: "AI agent",
    hint: "Stable Gemini model used by the concierge and owner advisor.",
    secret: false,
    placeholder: "gemini-2.0-flash",
  },
  TWILIO_ENABLED: {
    label: "Twilio enabled",
    group: "SMS",
    hint: "Kill-switch for all SMS sending. Use \"true\" to enable, \"false\" to disable.",
    secret: false,
    placeholder: "true / false",
  },
  TWILIO_ACCOUNT_SID: {
    label: "Twilio account SID",
    group: "SMS",
    hint: "Your Twilio account identifier (starts with AC…).",
    secret: false,
    placeholder: "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  },
  TWILIO_AUTH_TOKEN: {
    label: "Twilio auth token",
    group: "SMS",
    hint: "Main account auth token — only needed when you're not using an API key pair.",
    secret: true,
    placeholder: "Paste the auth token",
  },
  TWILIO_API_KEY_SID: {
    label: "Twilio API key SID",
    group: "SMS",
    hint: "API-key auth: the key SID (starts with SK…). Preferred over the main auth token.",
    secret: false,
    placeholder: "SKxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  },
  TWILIO_API_KEY_SECRET: {
    label: "Twilio API key secret",
    group: "SMS",
    hint: "API-key auth: the secret for the key SID above.",
    secret: true,
    placeholder: "Paste the API key secret",
  },
  TWILIO_MESSAGING_SERVICE_SID: {
    label: "Twilio messaging service SID",
    group: "SMS",
    hint: "Optional — a messaging service with a registered sender (e.g. \"Beity\") routes more reliably.",
    secret: false,
    placeholder: "MGxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  },
  TWILIO_FROM_NUMBER: {
    label: "Twilio from number",
    group: "SMS",
    hint: "Fallback sender when no messaging service is set (E.164, e.g. +1XXXXXXXXXX).",
    secret: false,
    placeholder: "+1XXXXXXXXXX",
  },
};

function formatUpdated(ts: number) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function AdminSettings() {
  const listSettings = useAction(api.settings.listSettings);
  const setSetting = useMutation(api.settings.setSetting);
  const [rows, setRows] = useState<SettingRow[] | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  // Separate maps: revealing the masked stored value and toggling the input's
  // plain-text mode are independent choices (L-41).
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [inputRevealed, setInputRevealed] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [clearKey, setClearKey] = useState<string | null>(null);

  const load = async () => {
    try {
      const data = await listSettings();
      setRows(data as SettingRow[]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load settings.");
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const groups = useMemo(() => {
    if (!rows) return [];
    const out: { name: string; items: SettingRow[] }[] = [];
    for (const row of rows) {
      const meta = META[row.key];
      const groupName = meta?.group ?? "Other";
      let g = out.find((x) => x.name === groupName);
      if (!g) {
        g = { name: groupName, items: [] };
        out.push(g);
      }
      g.items.push(row);
    }
    return out;
  }, [rows]);

  const isDirty = (key: string) => {
    const d = (drafts[key] ?? "").trim();
    if (!d) return false;
    return true;
  };

  const handleSave = async (key: string) => {
    const value = (drafts[key] ?? "").trim();
    if (!value || saving) return;
    setSaving(key);
    try {
      await setSetting({ key, value });
      setDrafts((p) => ({ ...p, [key]: "" }));
      toast.success(`${META[key]?.label ?? key} saved.`);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save setting.");
    } finally {
      setSaving(null);
    }
  };

  const handleClear = async (key: string) => {
    if (saving) return;
    setSaving(key);
    try {
      await setSetting({ key, value: "" });
      setDrafts((p) => ({ ...p, [key]: "" }));
      toast.success(`${META[key]?.label ?? key} cleared — falling back to environment.`);
      setClearKey(null);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not clear setting.");
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          API keys and platform configuration. Values saved here override the deployment's environment
          variables instantly — no redeploy needed. Secrets are stored server-side and masked here.
        </p>
      </div>

      {rows === null ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
          <Spinner className="size-4" /> Loading settings…
        </div>
      ) : (
        groups.map((group) => (
          <section key={group.name} className="space-y-3">
            <div className="flex items-center gap-2">
              {group.name === "AI" ? (
                <Bot className="size-4 text-primary" />
              ) : group.name === "SMS" ? (
                <MessageSquareText className="size-4 text-primary" />
              ) : (
                <KeyRound className="size-4 text-primary" />
              )}
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {group.name}
              </h2>
            </div>
            <div className="space-y-3">
              {group.items.map((row) => {
                const meta = META[row.key];
                if (!meta) return null;
                const dirty = isDirty(row.key);
                const show = revealed[row.key] ?? false;
                const showInput = inputRevealed[row.key] ?? false;
                const isEnv = row.source === "env";
                return (
                  <div key={row.key} className="rounded-2xl border border-border/70 bg-card p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold">{meta.label}</p>
                          {row.configured ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                              <BadgeCheck className="size-3" /> Stored
                            </span>
                          ) : isEnv ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
                              <ShieldCheck className="size-3" /> From environment
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                              Not set
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">{meta.hint}</p>
                      </div>
                      <span className="shrink-0 text-right text-[11px] text-muted-foreground">
                        <span className="block">Updated {formatUpdated(row.updatedAt)}</span>
                      </span>
                    </div>

                    {row.configured && (
                      <div className="mt-2 flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-1.5 text-xs text-muted-foreground">
                        <KeyRound className="size-3 shrink-0" />
                        {meta.secret ? (
                          <span className="font-mono tracking-widest">{show ? row.masked : "••••••••" + row.masked.slice(-5)}</span>
                        ) : (
                          <span className="font-mono">{row.masked}</span>
                        )}
                        {meta.secret && (
                          <button
                            onClick={() => setRevealed((p) => ({ ...p, [row.key]: !p[row.key] }))}
                            className="ml-auto text-muted-foreground transition-colors hover:text-foreground"
                            aria-label={show ? "Hide value" : "Show value"}
                          >
                            {show ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                          </button>
                        )}
                      </div>
                    )}

                    <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                      <div className="flex flex-1 items-center gap-2">
                        <Input
                          type={meta.secret && !showInput ? "password" : "text"}
                          value={drafts[row.key] ?? ""}
                          onChange={(e) => setDrafts((p) => ({ ...p, [row.key]: e.target.value }))}
                          placeholder={meta.placeholder}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") void handleSave(row.key);
                          }}
                          className={cn("font-mono text-sm", dirty && "border-primary/50")}
                        />
                        {meta.secret && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-9 shrink-0 text-muted-foreground"
                            onClick={() => setInputRevealed((p) => ({ ...p, [row.key]: !p[row.key] }))}
                            aria-label={showInput ? "Hide input" : "Show input"}
                          >
                            {showInput ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                          </Button>
                        )}
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <Button
                          variant="default"
                          size="sm"
                          disabled={!dirty || saving === row.key}
                          onClick={() => void handleSave(row.key)}
                        >
                          {saving === row.key ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <Save className="size-4" />
                          )}
                          Save
                        </Button>
                        {row.configured && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-muted-foreground hover:text-destructive"
                            disabled={saving === row.key}
                            onClick={() => setClearKey(row.key)}
                          >
                            <RotateCcw className="size-4" />
                            Clear
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))
      )}

      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Check className="size-3.5" /> Stored values take effect immediately. To remove a stored value and
        fall back to the environment, use Clear.
      </p>

      <AlertDialog open={!!clearKey} onOpenChange={(open) => !open && !saving && setClearKey(null)}>
        <AlertDialogContent className="max-w-sm rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="tracking-tight">Clear {clearKey ? META[clearKey]?.label : ""}?</AlertDialogTitle>
            <AlertDialogDescription>
              The stored value is removed and the app falls back to the deployment's environment variable.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!saving}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={!!saving}
              onClick={(e) => {
                e.preventDefault();
                if (clearKey) void handleClear(clearKey);
              }}
            >
              {saving ? <Loader2 className="size-4 animate-spin" /> : "Clear value"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
