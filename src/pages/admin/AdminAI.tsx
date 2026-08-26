import { api } from "@/convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { useMutation, useQuery } from "convex/react";
import { Bot, Check, ChevronRight, Database, MessageSquare, Plus, RefreshCw, Save, Trash2, Workflow } from "lucide-react";
import { useState } from "react";
import type React from "react";
import { toast } from "sonner";

type Draft = { id?: string; title: string; category: string; content: string; priority: string; enabled: boolean };
type RuleDraft = { id?: string; name: string; description: string; instruction: string; priority: string; enabled: boolean };
const blankKnowledge: Draft = { title: "", category: "Platform", content: "", priority: "0", enabled: true };
const blankRule: RuleDraft = { name: "", description: "", instruction: "", priority: "0", enabled: true };

function dateLabel(ts: number) { return new Date(ts).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }); }

export default function AdminAI() {
  const data = useQuery(api.adminAi.overview);
  const selected = useState<string | null>(null);
  const [selectedId, setSelectedId] = selected;
  const thread = useQuery(api.adminAi.conversation, selectedId ? { id: selectedId as never } : "skip");
  const saveKnowledge = useMutation(api.adminAi.saveKnowledge);
  const deleteKnowledge = useMutation(api.adminAi.deleteKnowledge);
  const saveRule = useMutation(api.adminAi.saveRule);
  const deleteRule = useMutation(api.adminAi.deleteRule);
  const installDefaults = useMutation(api.adminAi.installDefaults);
  const [knowledgeDraft, setKnowledgeDraft] = useState<Draft | null>(null);
  const [ruleDraft, setRuleDraft] = useState<RuleDraft | null>(null);
  const [busy, setBusy] = useState(false);

  if (data === undefined) return <div className="flex justify-center py-20"><Spinner className="size-5" /></div>;

  const submitKnowledge = async () => {
    if (!knowledgeDraft || busy) return;
    setBusy(true);
    try { await saveKnowledge({ ...knowledgeDraft, id: knowledgeDraft.id as never, priority: Number(knowledgeDraft.priority) || 0 }); setKnowledgeDraft(null); toast.success("Knowledge entry saved."); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Could not save knowledge."); }
    finally { setBusy(false); }
  };
  const submitRule = async () => {
    if (!ruleDraft || busy) return;
    setBusy(true);
    try { await saveRule({ ...ruleDraft, id: ruleDraft.id as never, priority: Number(ruleDraft.priority) || 0 }); setRuleDraft(null); toast.success("Semantic rule saved."); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Could not save rule."); }
    finally { setBusy(false); }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><div className="flex items-center gap-2"><Bot className="size-5 text-primary" /><h1 className="text-2xl font-bold tracking-tight">AI workspace</h1></div>
        <p className="mt-1 text-sm text-muted-foreground">Review customer conversations and manage the agent’s prompt, knowledge, and semantic behavior.</p></div>
        <Button variant="outline" disabled={busy} onClick={async () => { setBusy(true); try { const result = await installDefaults({}); toast.success(`Installed ${result.knowledgeAdded} knowledge entries and ${result.rulesAdded} rules.`); } catch (error) { toast.error(error instanceof Error ? error.message : "Could not install defaults."); } finally { setBusy(false); } }}><RefreshCw className="size-4" /> Restore defaults</Button>
      </div>

      <section className="grid gap-4 lg:grid-cols-[330px_1fr]">
        <div className="rounded-2xl border border-border/70 bg-card">
          <div className="flex items-center justify-between border-b border-border/60 p-4"><div><h2 className="font-semibold">Conversations</h2><p className="text-xs text-muted-foreground">{data.conversations.length} threads · {data.messageCount} messages</p></div><MessageSquare className="size-4 text-muted-foreground" /></div>
          <div className="max-h-[520px] overflow-y-auto p-2">
            {data.conversations.length === 0 ? <p className="p-4 text-sm text-muted-foreground">No agent conversations yet.</p> : data.conversations.map((c) => (
              <button key={c._id} onClick={() => setSelectedId(c._id)} className={`w-full rounded-xl p-3 text-left transition-colors ${selectedId === c._id ? "bg-primary/10" : "hover:bg-muted/60"}`}>
                <div className="flex items-start justify-between gap-2"><span className="truncate text-sm font-medium">{c.customerName}</span><ChevronRight className="size-4 shrink-0 text-muted-foreground" /></div>
                <p className="mt-1 truncate text-xs text-muted-foreground">{c.title || "Dining concierge conversation"}</p>
                <p className="mt-2 text-[11px] text-muted-foreground">{dateLabel(c.lastMessageAt)} · {c.messageCount} messages</p>
              </button>
            ))}
          </div>
        </div>
        <div className="min-h-[360px] rounded-2xl border border-border/70 bg-card">
          {/* Loading vs empty are distinct states (L-41) */}
          {selectedId && thread === undefined ? (
            <div className="flex h-full min-h-[360px] items-center justify-center p-8"><Spinner className="size-5" /></div>
          ) : !thread ? <div className="flex h-full min-h-[360px] items-center justify-center p-8 text-center text-sm text-muted-foreground">Select a conversation to inspect the complete agent/customer discussion.</div> : (
            <><div className="border-b border-border/60 p-5"><h2 className="font-semibold">{thread.customer?.name || "Customer"}</h2><p className="text-xs text-muted-foreground">{thread.customer?.phone || thread.customer?.email || "Customer profile"}</p></div><div className="max-h-[470px] space-y-4 overflow-y-auto p-5">
              {thread.messages.map((m) => <div key={m._id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}><div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm ${m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted/60"}`}><div className="mb-1 text-[10px] font-semibold uppercase tracking-wide opacity-70">{m.role === "user" ? "Customer" : "Kamix AI"}</div><p className="whitespace-pre-wrap">{m.content}</p><p className="mt-2 text-[10px] opacity-60">{dateLabel(m.createdAt)}</p></div></div>)}
            </div></>
          )}
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <ConfigCard title="Knowledge layer" icon={<Database className="size-4 text-primary" />} description="Facts the agent can use when answering customers. Keep entries short, sourced, and operationally true." onAdd={() => setKnowledgeDraft(blankKnowledge)}>
          {[...data.knowledge].sort((a, b) => b.priority - a.priority).map((item) => <div key={item._id} className="rounded-xl border border-border/60 p-3"><div className="flex items-start justify-between gap-3"><div><div className="flex items-center gap-2"><span className="font-medium">{item.title}</span><Badge variant={item.enabled ? "secondary" : "outline"}>{item.enabled ? "Active" : "Off"}</Badge></div><p className="mt-1 text-xs text-muted-foreground">{item.category} · priority {item.priority}</p></div><div className="flex gap-1"><Button variant="ghost" size="icon" onClick={() => setKnowledgeDraft({ id: item._id, title: item.title, category: item.category, content: item.content, priority: String(item.priority), enabled: item.enabled })}><Save className="size-4" /></Button><Button variant="ghost" size="icon" onClick={() => { deleteKnowledge({ id: item._id }).then(() => toast.success("Knowledge removed.")).catch((e) => toast.error(e instanceof Error ? e.message : "Could not remove knowledge.")); }}><Trash2 className="size-4 text-destructive" /></Button></div></div><p className="mt-2 text-sm text-muted-foreground">{item.content}</p></div>)}
          {knowledgeDraft && <KnowledgeForm draft={knowledgeDraft} setDraft={setKnowledgeDraft} onSave={submitKnowledge} busy={busy} />}
        </ConfigCard>
        <ConfigCard title="Semantic layer" icon={<Workflow className="size-4 text-primary" />} description="Rules that shape interpretation, ranking, safety, and response behavior before recommendations are generated." onAdd={() => setRuleDraft(blankRule)}>
          {[...data.rules].sort((a, b) => b.priority - a.priority).map((item) => <div key={item._id} className="rounded-xl border border-border/60 p-3"><div className="flex items-start justify-between gap-3"><div><div className="flex items-center gap-2"><span className="font-medium">{item.name}</span><Badge variant={item.enabled ? "secondary" : "outline"}>{item.enabled ? "Active" : "Off"}</Badge></div><p className="mt-1 text-xs text-muted-foreground">priority {item.priority} · {item.description || "No description"}</p></div><div className="flex gap-1"><Button variant="ghost" size="icon" onClick={() => setRuleDraft({ id: item._id, name: item.name, description: item.description, instruction: item.instruction, priority: String(item.priority), enabled: item.enabled })}><Save className="size-4" /></Button><Button variant="ghost" size="icon" onClick={() => { deleteRule({ id: item._id }).then(() => toast.success("Rule removed.")).catch((e) => toast.error(e instanceof Error ? e.message : "Could not remove rule.")); }}><Trash2 className="size-4 text-destructive" /></Button></div></div><p className="mt-2 text-sm text-muted-foreground">{item.instruction}</p></div>)}
          {ruleDraft && <RuleForm draft={ruleDraft} setDraft={setRuleDraft} onSave={submitRule} busy={busy} />}
        </ConfigCard>
      </section>
      <p className="text-xs text-muted-foreground">The system prompt itself is managed in <a className="text-primary underline" href="/admin/settings">Settings → AI system prompt</a>. Changes are applied to new requests immediately.</p>
    </div>
  );
}

function ConfigCard({ title, icon, description, onAdd, children }: { title: string; icon: React.ReactNode; description: string; onAdd: () => void; children: React.ReactNode }) {
  return <div className="rounded-2xl border border-border/70 bg-card p-4"><div className="flex items-start justify-between gap-3"><div><div className="flex items-center gap-2"><span>{icon}</span><h2 className="font-semibold">{title}</h2></div><p className="mt-1 text-xs text-muted-foreground">{description}</p></div><Button size="sm" variant="outline" onClick={onAdd}><Plus className="size-4" /> Add</Button></div><div className="mt-4 space-y-3">{children}</div></div>;
}

function KnowledgeForm({ draft, setDraft, onSave, busy }: { draft: Draft; setDraft: (v: Draft | null) => void; onSave: () => void; busy: boolean }) {
  return <div className="space-y-3 rounded-xl bg-muted/40 p-3"><div className="grid gap-3 sm:grid-cols-2"><div><Label>Title</Label><Input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></div><div><Label>Category</Label><Input value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} /></div></div><div><Label>Content</Label><Textarea value={draft.content} onChange={(e) => setDraft({ ...draft, content: e.target.value })} /></div><div className="flex items-end gap-3"><div><Label>Priority</Label><Input className="w-24" type="number" value={draft.priority} onChange={(e) => setDraft({ ...draft, priority: e.target.value })} /></div><Button onClick={onSave} disabled={busy}><Check className="size-4" /> Save</Button><Button variant="ghost" onClick={() => setDraft(null)}>Cancel</Button></div></div>;
}

function RuleForm({ draft, setDraft, onSave, busy }: { draft: RuleDraft; setDraft: (v: RuleDraft | null) => void; onSave: () => void; busy: boolean }) {
  return <div className="space-y-3 rounded-xl bg-muted/40 p-3"><div><Label>Name</Label><Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></div><div><Label>Description</Label><Input value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></div><div><Label>Instruction</Label><Textarea value={draft.instruction} onChange={(e) => setDraft({ ...draft, instruction: e.target.value })} /></div><div className="flex items-end gap-3"><div><Label>Priority</Label><Input className="w-24" type="number" value={draft.priority} onChange={(e) => setDraft({ ...draft, priority: e.target.value })} /></div><Button onClick={onSave} disabled={busy}><Check className="size-4" /> Save</Button><Button variant="ghost" onClick={() => setDraft(null)}>Cancel</Button></div></div>;
}
