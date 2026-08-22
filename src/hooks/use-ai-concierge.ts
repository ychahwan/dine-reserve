import { useAction } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";

export interface Recommendation {
  restaurantId?: string;
  name?: string;
  cuisine?: string;
  suggestedTime?: string;
  reason?: string;
  matchScore?: number;
  error?: string;
  raw?: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  recommendations?: Recommendation[];
}

export function useAiConcierge() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recommendDinner = useAction(api.ai.recommendDinner);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const send = async (query: string) => {
    if (!query.trim() || isLoading) return;
    setMessages((prev) => [...prev, { role: "user", content: query }]);
    setIsLoading(true);
    try {
      const result = await recommendDinner({ query, conversationId: conversationId as never });
      setConversationId(result.conversationId);
      const recs = result.recommendations as Recommendation[];
      if (recs.some((r) => r.error)) {
        setMessages((prev) => [...prev, { role: "assistant", content: "I had trouble finding matches for that. Could you try rephrasing?" }]);
      } else {
        setMessages((prev) => [...prev, { role: "assistant", content: `Here are my top picks for "${query}":`, recommendations: recs }]);
      }
    } catch (err) {
      setMessages((prev) => [...prev, { role: "assistant", content: `Sorry, I couldn't process that request. ${err instanceof Error ? err.message : "Please try again."}` }]);
    } finally { setIsLoading(false); }
  };

  return { messages, isLoading, messagesEndRef, send };
}
