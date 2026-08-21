import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { Send, Sparkles, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

/**
 * Restaurant stories (Idea #8): owners share short behind-the-scenes updates
 * (new dish, chef's special, event night) that appear on the Explore feed
 * and the restaurant page — building a connection that drives repeat visits.
 */
export function OwnerStoriesTab({ restaurantId }: { restaurantId: string }) {
  const stories = useQuery(api.stories.mine, { restaurantId: restaurantId as never });
  const post = useMutation(api.stories.post);
  const remove = useMutation(api.stories.remove);

  const [emoji, setEmoji] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const handlePost = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = text.trim();
    if (!clean || busy) return;
    setBusy(true);
    try {
      await post({
        restaurantId: restaurantId as never,
        text: clean,
        emoji: emoji.trim() || undefined,
      });
      setText("");
      setEmoji("");
      toast.success("Story published to the Explore feed.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not post the story.");
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async (id: string) => {
    try {
      await remove({ id: id as never });
      toast.success("Story removed.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not remove the story.");
    }
  };

  return (
    <div className="space-y-4 pb-6">
      <p className="text-sm text-muted-foreground">
        Short updates that appear on the Explore feed and your restaurant page — new dishes,
        chef's specials, event nights. Stories build the connection that brings diners back.
      </p>

      {/* Composer */}
      <Card className="rounded-2xl border-border/70 p-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="size-4 text-primary" /> Share an update
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handlePost} className="space-y-3">
            <div className="flex gap-2">
              <Input
                value={emoji}
                onChange={(e) => setEmoji(e.target.value.slice(0, 4))}
                placeholder="🍝"
                className="w-16 text-center"
                aria-label="Story emoji"
              />
              <Textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                maxLength={240}
                rows={2}
                placeholder="e.g. Fresh burrata special tonight — the chef's grandmother's recipe!"
                required
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{text.length}/240</span>
              <Button type="submit" size="sm" className="gap-1.5" disabled={busy || !text.trim()}>
                {busy ? <Spinner className="size-3.5" /> : <Send className="size-3.5" />}
                Publish story
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* List */}
      {stories === undefined ? (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
          <Spinner className="size-4" /> Loading stories…
        </div>
      ) : stories.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
          No stories yet — share your first update above.
        </div>
      ) : (
        <div className="space-y-2">
          {stories.map((s) => (
            <div key={s._id} className="flex items-start gap-3 rounded-xl border border-border/70 bg-card px-3.5 py-3">
              <span className="text-xl">{s.emoji ?? "🍽️"}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm">{s.text}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">{timeAgo(s.createdAt)}</p>
              </div>
              <button
                onClick={() => handleRemove(s._id)}
                className="flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground/60 transition-colors hover:bg-destructive/10 hover:text-destructive"
                aria-label="Delete story"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
