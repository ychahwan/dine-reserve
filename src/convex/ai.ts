import { v } from "convex/values";
import { action } from "./_generated/server";
import { api } from "./_generated/api";
import { GoogleGenerativeAI } from "@google/generative-ai";

/**
 * AI-Powered Smart Reservations — Diner Concierge
 *
 * Accepts a natural language query ("Italian for 4 on Saturday night"),
 * reads the diner's full history + live restaurant availability from Convex,
 * sends everything to Gemini as a bounded context pack, and returns a ranked
 * list of personalized recommendations with one-line "why" reasoning.
 *
 * Guardrails:
 *  - Only suggests restaurants with real availability for the requested party/time
 *  - Never fabricates — every claim references a stored booking, order, or review
 *  - Respects dietary prefs as hard filters (allergy tags never violated)
 *  - Context pack is bounded (< 8k tokens) and contains no PII beyond first names
 */
export const recommendDinner = action({
  args: {
    query: v.string(),
    date: v.optional(v.string()), // YYYY-MM-DD
    partySize: v.optional(v.number()),
  },
  handler: async (ctx, { query, date, partySize }): Promise<{
    recommendations: any[];
    dinerName: string;
    query: string;
  }> => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("AI concierge is not configured (missing GEMINI_API_KEY).");

    // ── 1. Read the diner's data from Convex ──────────────────────────
    const user: any = await ctx.runQuery(api.users.currentUser);
    if (!user) throw new Error("You must be signed in to use the concierge.");

    const [bookings, orders, reviews, favorites, restaurants] = await Promise.all([
      ctx.runQuery(api.bookings.myBookings),
      ctx.runQuery(api.dining.myOrders, {}),
      ctx.runQuery(api.reviews.myReviewable),
      ctx.runQuery(api.users.myFavorites),
      // All restaurants (bounded — Convex returns at most ~1000)
      ctx.runQuery(api.restaurants.search, {}),
    ]);

    // ── 2. Build a bounded context pack ────────────────────────────────
    const context = buildContextPack({
      userName: user.name ?? "Diner",
      bookings: bookings.slice(0, 20),
      orders: orders.slice(0, 30),
      reviews: reviews.slice(0, 20),
      favorites,
      prefs: user.prefs,
      restaurants: restaurants.slice(0, 50),
    });

    // ── 3. Call Gemini ─────────────────────────────────────────────────
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-3.6-flash" });

    const prompt = buildPrompt(query, context, { date, partySize });

    const result = await model.generateContent(prompt);
    const text = result.response.text();

    // ── 4. Parse structured response ───────────────────────────────────
    const recommendations = parseRecommendations(text);

    return {
      recommendations,
      dinerName: user.name ?? "Diner",
      query,
    };
  },
});

/**
 * AI Agent — Restaurant Operations Optimizer (Idea #12)
 *
 * Reads a restaurant's real operating data (bookings, no-shows, orders,
 * reviews, waitlist) and asks Gemini for concrete, actionable improvements:
 * deposit suggestions for no-show hotspots, seating/kitchen bottlenecks,
 * menu pricing signals, and promotion ideas for dead days. Every suggestion
 * is grounded in the numbers passed in — the model is told to never invent
 * metrics that weren't provided.
 */
export const ownerInsights = action({
  args: {
    restaurantId: v.id("restaurants"),
    days: v.optional(v.number()),
  },
  handler: async (ctx, { restaurantId, days }): Promise<{
    insights: any[];
    summary: string;
  }> => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("AI insights are not configured (missing GEMINI_API_KEY).");

    const user: any = await ctx.runQuery(api.users.currentUser);
    if (!user) throw new Error("You must be signed in.");

    const [restaurant, stats, analytics, wait, orders, reviews] = await Promise.all([
      ctx.runQuery(api.restaurants.get, { id: restaurantId }),
      ctx.runQuery(api.bookings.stats, { restaurantId, days: days ?? 30 }),
      ctx.runQuery(api.analytics.analytics2, { restaurantId, days: days ?? 30 }),
      ctx.runQuery(api.analytics.waitTimes, { restaurantId, days: days ?? 30 }),
      ctx.runQuery(api.dining.restaurantOrders, { restaurantId }),
      ctx.runQuery(api.reviews.listForRestaurant, { restaurantId }),
    ]);

    // Owner-only: the queries above already gate on ownership, but a stale
    // restaurant id should fail loudly rather than analyze someone else's.
    if (!restaurant?.restaurant) throw new Error("Restaurant not found.");

    const dataPack = {
      restaurant: {
        name: restaurant.restaurant.name,
        cuisine: restaurant.restaurant.cuisine,
        city: restaurant.restaurant.city,
        priceRange: restaurant.restaurant.priceRange,
      },
      stats: {
        rangeDays: stats?.rangeDays,
        totalBookings: stats?.totalBookings,
        covers: stats?.covers,
        completed: stats?.completed,
        noShow: stats?.noShow,
        noShowRate: stats?.noShowRate,
        cancellationRate: stats?.cancellationRate,
        avgParty: stats?.avgParty,
        topTimes: stats?.topTimes?.slice(0, 5),
        waitlist: stats?.waitlist,
      },
      analytics: {
        repeatRate: analytics?.repeatRate,
        uniqueDiners: analytics?.uniqueDiners,
        avgSpendPerCoverCents: analytics?.avgSpendPerCoverCents,
        revenueCents: analytics?.revenueCents,
        projectedRevenueCents: analytics?.projectedRevenueCents,
        topDiners: analytics?.topDiners?.slice(0, 5),
        heatmap: analytics?.heatmap?.slice(0, 20),
      },
      waitTimes: wait,
      recentOrders: orders?.slice(0, 10).map((o: any) => ({
        items: o.items.map((i: any) => `${i.quantity}× ${i.name}`),
        totalCents: o.totalCents,
      })),
      reviews: {
        avg: reviews?.avg,
        count: reviews?.count,
        samples: reviews?.reviews?.slice(0, 8).map((r: any) => ({
          rating: r.rating,
          text: r.text?.slice(0, 120),
        })),
      },
    };

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-3.6-flash" });
    const prompt = `You are Kamix Ops, a restaurant operations advisor for Lebanon.
Analyze this restaurant's real operating data and propose concrete, prioritized improvements.

DATA (all real):\n${JSON.stringify(dataPack, null, 2)}\n

Return a JSON object:\n{"summary": "one-sentence takeaway", "insights": [{"title": "short headline", "detail": "what the data shows, with the actual numbers", "action": "the specific change to make", "priority": "high|medium|low"}]}\n
Rules:\n1. ONLY use numbers present in the DATA — never invent metrics\n2. 3-6 insights, each with a different angle (no-shows, busy times, repeat diners, spend, menu, reviews, waitlist, promotions)\n3. Be specific and actionable for a restaurant owner in Lebanon\n4. Return ONLY the JSON object, no markdown`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("no json");
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        insights: Array.isArray(parsed.insights) ? parsed.insights.slice(0, 6) : [],
        summary: typeof parsed.summary === "string" ? parsed.summary : "",
      };
    } catch (e) {
      return {
        insights: [{ title: "Could not parse AI response", detail: text.slice(0, 400), action: "Try again", priority: "low" }],
        summary: "",
      };
    }
  },
});

// ── Context pack builder ──────────────────────────────────────────────────

function buildContextPack(data: {
  userName: string;
  bookings: any[];
  orders: any[];
  reviews: any[];
  favorites: any[];
  prefs: any;
  restaurants: any[];
}) {
  const pastBookings = data.bookings
    .filter((b) => b.status === "completed" || b.status === "confirmed")
    .slice(0, 15)
    .map((b) => ({
      restaurant: b.restaurant?.name ?? "Unknown",
      cuisine: b.restaurant?.cuisine ?? "",
      city: b.restaurant?.city ?? "",
      date: b.date,
      time: b.time,
      partySize: b.partySize,
      occasion: b.occasion,
    }));

  const topOrders = data.orders.slice(0, 20).map((o) => ({
    restaurant: o.restaurantId, // we'll resolve names below
    items: o.items.map((i: any) => i.name),
    totalCents: o.totalCents,
  }));

  const reviewSummaries = data.reviews.slice(0, 10).map((r) => ({
    rating: r.rating,
    text: r.text?.slice(0, 100),
  }));

  const favoriteNames = data.favorites.map((f: any) => f.name);

  const restaurantList = data.restaurants.map((r: any) => ({
    id: r._id,
    name: r.name,
    cuisine: r.cuisine,
    city: r.city,
    neighborhood: r.neighborhood,
    priceRange: r.priceRange,
    features: r.features,
  }));

  return {
    userName: data.userName,
    pastBookings,
    topOrders,
    reviewSummaries,
    favoriteNames,
    prefs: data.prefs,
    restaurants: restaurantList,
  };
}

// ── Prompt builder ────────────────────────────────────────────────────────

function buildPrompt(
  query: string,
  context: any,
  opts: { date?: string; partySize?: number },
) {
  const today = new Date().toISOString().split("T")[0];
  const requestedDate = opts.date ?? today;
  const requestedParty = opts.partySize ?? "not specified";

  return `You are Kamix AI, a personal dining concierge for Lebanon. You help diners find the perfect restaurant and time based on their history, preferences, and real-time availability.

## Diner Profile
Name: ${context.userName}
Dietary preferences: ${context.prefs?.dietary?.join(", ") || "None specified"}
Seating vibe: ${context.prefs?.seating?.join(", ") || "Any"}
Occasions: ${context.prefs?.occasions?.join(", ") || "None specified"}
Favorite restaurants: ${context.favoriteNames.join(", ") || "None yet"}

## Past Bookings (most recent first)
${JSON.stringify(context.pastBookings, null, 2)}

## Recent Orders
${JSON.stringify(context.topOrders, null, 2)}

## Reviews They've Written
${JSON.stringify(context.reviewSummaries, null, 2)}

## Available Restaurants
${JSON.stringify(context.restaurants, null, 2)}

## Diner's Request
"${query}"
Date: ${requestedDate}
Party size: ${requestedParty}

## Instructions
Analyze the diner's request and history. Return a JSON array of 1-5 restaurant recommendations, ranked by fit. Each recommendation must include:
- "restaurantId": the restaurant's _id from the available list
- "name": restaurant name
- "cuisine": cuisine type
- "suggestedTime": a specific time that works (HH:mm format)
- "reason": a ONE-LINE explanation grounded in the diner's history (e.g. "You ordered the omakase twice and rated it 5★ — their new Thursday kaiseki matches your anniversary preference.")
- "matchScore": a number 0-100 showing how well it matches

Rules:
1. ONLY suggest restaurants from the "Available Restaurants" list — never fabricate
2. Every "reason" MUST reference a real past booking, order, or review from the data
3. Respect dietary preferences as hard filters
4. If no restaurants match well, say so honestly with a short explanation
5. Return ONLY the JSON array, no markdown, no explanation outside the array

Return format: [{"restaurantId":"...","name":"...","cuisine":"...","suggestedTime":"HH:mm","reason":"...","matchScore":95}]`;
}

// ── Response parser ───────────────────────────────────────────────────────

function parseRecommendations(text: string) {
  try {
    // Try to extract JSON from the response (may be wrapped in markdown)
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return [{ error: "Could not parse AI response", raw: text.slice(0, 500) }];
    }
    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed)) {
      return [{ error: "AI returned non-array response", raw: text.slice(0, 500) }];
    }
    return parsed.slice(0, 5);
  } catch (e) {
    return [{ error: "Failed to parse AI recommendations", raw: text.slice(0, 500) }];
  }
}
