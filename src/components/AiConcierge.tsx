import { useState, useRef, useEffect } from "react";
import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import {
  Sparkles,
  Send,
  X,
  MapPin,
  Clock,
  Users,
  Star,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Recommendation {
  restaurantId?: string;
  name?: string;
  cuisine?: string;
  suggestedTime?: string;
  reason?: string;
  matchScore?: number;
  error?: string;
  raw?: string;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  recommendations?: Recommendation[];
}

const QUICK_PROMPTS = [
  "Italian for 2 tonight",
  "Quiet dinner for anniversary",
  "Best sushi in Beirut",
  "Family brunch this Sunday",
  "Quick lunch near Hamra",
];

export default function AiConcierge() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recommendDinner = useAction(api.ai.recommendDinner);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async (text?: string) => {
    const query = text || input.trim();
    if (!query || isLoading) return;

    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: query }]);
    setIsLoading(true);

    try {
      const result = await recommendDinner({ query });
      const recs = result.recommendations as Recommendation[];

      const hasError = recs.some((r) => r.error);
      if (hasError) {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: "I had trouble finding matches for that. Could you try rephrasing? For example: 'Italian for 2 on Saturday night' or 'Best sushi in Beirut'.",
          },
        ]);
      } else {
        const summary = `Here are my top picks for "${query}":`;
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: summary, recommendations: recs },
        ]);
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Sorry, I couldn't process that request. ${err instanceof Error ? err.message : "Please try again."}`,
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      {/* Floating button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 z-50 flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 transition-all hover:scale-105 hover:shadow-xl"
          aria-label="Open AI concierge"
        >
          <Sparkles className="size-6" />
        </button>
      )}

      {/* Chat panel */}
      {isOpen && (
        <Card className="fixed bottom-6 right-6 z-50 flex w-[380px] max-w-[calc(100vw-2rem)] flex-col rounded-2xl border-border/70 shadow-2xl" style={{ height: "min(600px, calc(100vh - 6rem))" }}>
          <CardHeader className="flex flex-row items-center justify-between border-b border-border/60 pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <span className="flex size-8 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Sparkles className="size-4" />
              </span>
              <div>
                <p className="font-semibold">Kamix Concierge</p>
                <p className="text-[11px] font-normal text-muted-foreground">AI-powered dining assistant</p>
              </div>
            </CardTitle>
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              onClick={() => setIsOpen(false)}
            >
              <X className="size-4" />
            </Button>
          </CardHeader>

          <CardContent className="flex flex-1 flex-col overflow-hidden p-0">
            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.length === 0 && (
                <div className="space-y-4">
                  <p className="text-center text-sm text-muted-foreground">
                    Tell me what you're craving and I'll find the perfect table for you.
                  </p>
                  <div className="space-y-2">
                    {QUICK_PROMPTS.map((prompt) => (
                      <button
                        key={prompt}
                        onClick={() => handleSend(prompt)}
                        className="w-full rounded-xl border border-border/60 bg-muted/30 px-3 py-2.5 text-left text-sm transition-colors hover:bg-muted/60"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((msg, i) => (
                <div key={i} className={cn("flex", msg.role === "user" ? "justify-end" : "justify-start")}>
                  <div
                    className={cn(
                      "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm",
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted/50 text-foreground",
                    )}
                  >
                    <p>{msg.content}</p>

                    {/* Recommendation cards */}
                    {msg.recommendations && msg.recommendations.length > 0 && (
                      <div className="mt-3 space-y-2">
                        {msg.recommendations.map((rec, j) => (
                          <RecommendationCard key={j} rec={rec} />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {isLoading && (
                <div className="flex justify-start">
                  <div className="flex items-center gap-2 rounded-2xl bg-muted/50 px-4 py-3 text-sm">
                    <Spinner className="size-4" />
                    <span>Finding the best tables for you…</span>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="border-t border-border/60 p-3">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSend();
                }}
                className="flex items-center gap-2"
              >
                <Input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="What are you craving?"
                  disabled={isLoading}
                  className="flex-1"
                />
                <Button
                  type="submit"
                  size="icon"
                  disabled={isLoading || !input.trim()}
                  className="size-9 shrink-0"
                >
                  <Send className="size-4" />
                </Button>
              </form>
            </div>
          </CardContent>
        </Card>
      )}
    </>
  );
}

function RecommendationCard({ rec }: { rec: Recommendation }) {
  if (rec.error) return null;

  const scoreColor =
    (rec.matchScore ?? 0) >= 80
      ? "text-emerald-600"
      : (rec.matchScore ?? 0) >= 60
        ? "text-amber-600"
        : "text-muted-foreground";

  return (
    <div className="rounded-xl border border-border/60 bg-card/80 p-3 text-left">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-foreground">{rec.name}</p>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {rec.cuisine && (
              <Badge variant="secondary" className="text-[10px]">
                {rec.cuisine}
              </Badge>
            )}
            {rec.suggestedTime && (
              <span className="flex items-center gap-1">
                <Clock className="size-3" /> {rec.suggestedTime}
              </span>
            )}
            {rec.matchScore != null && (
              <span className={cn("font-medium", scoreColor)}>
                <Star className="size-3 inline" /> {rec.matchScore}%
              </span>
            )}
          </div>
        </div>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
      </div>
      {rec.reason && (
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          {rec.reason}
        </p>
      )}
    </div>
  );
}
