import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowRight,
  CalendarDays,
  Check,
  Clock,
  Flame,
  MapPin,
  Menu as MenuIcon,
  MessageSquareText,
  Search,
  ShieldCheck,
  Sofa,
  Star,
  Store,
  Users,
  Wind,
} from "lucide-react";
import { motion } from "framer-motion";
import { Link } from "react-router";

const CUISINES = [
  { label: "Italian", emoji: "🍝", img: "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=400&q=60" },
  { label: "Japanese", emoji: "🍣", img: "https://images.unsplash.com/photo-1579871494447-9811cf80d66c?w=400&q=60" },
  { label: "Steakhouse", emoji: "🥩", img: "https://images.unsplash.com/photo-1600891964092-4316c288032e?w=400&q=60" },
  { label: "Mediterranean", emoji: "🫒", img: "https://images.unsplash.com/photo-1550966871-3ed3cdb5ed0c?w=400&q=60" },
  { label: "Mexican", emoji: "🌮", img: "https://images.unsplash.com/photo-1565299585323-38d6b0865b47?w=400&q=60" },
  { label: "French", emoji: "🥖", img: "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=400&q=60" },
];

const STEPS = [
  {
    icon: Search,
    title: "Search live availability",
    text: "See which tables are actually free — inside, on the terrace, or at the bar — before you ever pick up the phone.",
  },
  {
    icon: CalendarDays,
    title: "Book in one tap",
    text: "Pick your party size, seating vibe and time. Your table is locked in instantly with a confirmation code.",
  },
  {
    icon: MessageSquareText,
    title: "Get confirmed by SMS",
    text: "Instant booking confirmations and reminders straight to your phone, so nobody waits at the door.",
  },
];

const FEATURES = [
  {
    icon: Sofa,
    title: "Seating preferences",
    text: "Filter by inside, outside, bar, smoking and non-smoking zones — exactly how you like to dine.",
  },
  {
    icon: MenuIcon,
    title: "Menus before you book",
    text: "Browse full menus and price ranges up front. No surprises when the check arrives.",
  },
  {
    icon: ShieldCheck,
    title: "No-overbooking engine",
    text: "Every seat is booked atomically through a fair FIFO queue — restaurants can't oversell, even at peak hour.",
  },
  {
    icon: Wind,
    title: "Real-time availability",
    text: "Restaurant owners publish free spots live, so the calendar you see is always current.",
  },
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* ---------- Nav ---------- */}
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
              <Store className="size-5" />
            </span>
            <span className="text-lg font-semibold tracking-tight">Kamix</span>
          </Link>
          <nav className="hidden items-center gap-1 md:flex">
            <a href="#how" className="rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground">
              How it works
            </a>
            <a href="#cuisines" className="rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground">
              Explore
            </a>
            <a href="#owners" className="rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground">
              For restaurants
            </a>
          </nav>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild className="hidden sm:inline-flex">
              <Link to="/auth">Sign in</Link>
            </Button>
            <Button size="sm" asChild>
              <Link to="/auth">Find a table</Link>
            </Button>
          </div>
        </div>
      </header>

      {/* ---------- Hero ---------- */}
      <section className="relative overflow-hidden">
        <div className="texture-dots pointer-events-none absolute inset-0 opacity-60" />
        <div className="pointer-events-none absolute -top-32 left-1/2 h-96 w-[52rem] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 pb-20 pt-16 sm:px-6 lg:grid-cols-2 lg:pb-28 lg:pt-24">
          <div>
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              <Badge variant="secondary" className="mb-5 gap-1.5 rounded-full px-3 py-1">
                <span className="size-1.5 rounded-full bg-primary" />
                Live table availability, in real time
              </Badge>
              <h1 className="text-balance text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
                Skip the wait.
                <br />
                <span className="text-primary">Book your table</span> before you leave.
              </h1>
              <p className="mt-5 max-w-lg text-pretty text-base leading-7 text-muted-foreground sm:text-lg">
                Kamix shows you exactly which tables restaurants have free —
                inside, outside, at the bar — with real menus and instant SMS
                confirmations. Dine on your terms.
              </p>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="mt-8 flex flex-col gap-3 sm:flex-row"
            >
              <Button size="lg" asChild className="h-12 px-7 text-base">
                <Link to="/auth">
                  Start exploring <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild className="h-12 px-7 text-base">
                <Link to="/auth?returnTo=/owner">I run a restaurant</Link>
              </Button>
            </motion.div>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.25 }}
              className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-3 text-sm text-muted-foreground"
            >
              <span className="flex items-center gap-2">
                <span className="flex items-center gap-0.5 text-amber-500">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={i} className="size-3.5 fill-current" />
                  ))}
                </span>
                4.9 from 2,300+ diners
              </span>
              <span className="flex items-center gap-2">
                <Users className="size-4" /> 120+ partner restaurants
              </span>
            </motion.div>
          </div>

          {/* ---------- Demo card ---------- */}
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.6, delay: 0.15 }}
            className="relative mx-auto w-full max-w-md"
          >
            <div className="absolute -inset-4 rounded-[2rem] bg-gradient-to-br from-primary/15 via-transparent to-amber-400/10 blur-xl" />
            <div className="relative overflow-hidden rounded-3xl border border-border bg-card shadow-xl shadow-primary/5">
              <div className="flex items-center justify-between border-b border-border/70 px-5 py-4">
                <div>
                  <p className="font-semibold">Trullo</p>
                  <p className="text-xs text-muted-foreground">Italian · Milan · Brera</p>
                </div>
                <Badge className="gap-1 bg-emerald-600/10 text-emerald-700 dark:text-emerald-400">
                  <span className="size-1.5 rounded-full bg-emerald-500" /> Open now
                </Badge>
              </div>
              <div className="space-y-3 p-5">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Party size</span>
                  <span className="rounded-lg bg-muted px-2.5 py-1 font-medium">2 guests</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Date</span>
                  <span className="rounded-lg bg-muted px-2.5 py-1 font-medium">Tonight, 7:30 PM</span>
                </div>
                <div className="rounded-2xl border border-border/80 bg-muted/40 p-3">
                  <p className="mb-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Seating preference
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { icon: Sofa, label: "Inside", active: true },
                      { icon: Wind, label: "Outside", active: true },
                      { icon: Users, label: "Bar", active: false },
                    ].map((s) => (
                      <span
                        key={s.label}
                        className={
                          "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors " +
                          (s.active
                            ? "border-primary/30 bg-primary/10 text-primary"
                            : "border-border text-muted-foreground")
                        }
                      >
                        <s.icon className="size-3.5" /> {s.label}
                      </span>
                    ))}
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground">
                      <ShieldCheck className="size-3.5" /> Non-smoking
                    </span>
                  </div>
                </div>
                <div className="rounded-2xl bg-primary p-4 text-primary-foreground shadow-lg shadow-primary/25">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold">Terrace · Table 9</p>
                      <p className="mt-0.5 text-xs opacity-80">Confirmation KMX-7K2M9</p>
                    </div>
                    <Check className="size-5" />
                  </div>
                </div>
                <p className="flex items-center gap-1.5 text-center text-xs text-muted-foreground">
                  <MessageSquareText className="size-3.5" /> Confirmation &amp; reminders sent by SMS
                </p>
              </div>
            </div>
            {/* floating chips */}
            <div className="absolute -left-6 top-24 hidden rounded-2xl border border-border bg-card px-3.5 py-2.5 shadow-lg sm:flex sm:items-center sm:gap-2">
              <Clock className="size-4 text-primary" />
              <span className="text-xs font-medium">Table held in 0.4s</span>
            </div>
            <div className="absolute -right-4 bottom-24 hidden rounded-2xl border border-border bg-card px-3.5 py-2.5 shadow-lg sm:flex sm:items-center sm:gap-2">
              <Flame className="size-4 text-amber-500" />
              <span className="text-xs font-medium">7 spots left at 8:00</span>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ---------- How it works ---------- */}
      <section id="how" className="border-t border-border/60 bg-muted/40">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-medium uppercase tracking-widest text-primary">How it works</p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
              From hungry to seated in three steps
            </h2>
          </div>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {STEPS.map((step, i) => (
              <motion.div
                key={step.title}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-80px" }}
                transition={{ duration: 0.4, delay: i * 0.08 }}
                className="group relative rounded-2xl border border-border bg-card p-6 shadow-sm transition-all hover:-translate-y-1 hover:shadow-md"
              >
                <span className="absolute right-5 top-5 text-4xl font-bold text-border/70">
                  0{i + 1}
                </span>
                <div className="mb-4 flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                  <step.icon className="size-5" />
                </div>
                <h3 className="font-semibold">{step.title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{step.text}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- Cuisines ---------- */}
      <section id="cuisines" className="border-t border-border/60">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-sm font-medium uppercase tracking-widest text-primary">Browse by type</p>
              <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
                What are you craving?
              </h2>
            </div>
            <Button variant="outline" asChild>
              <Link to="/auth">
                See all restaurants <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>
          <div className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {CUISINES.map((c, i) => (
              <motion.div
                key={c.label}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.35, delay: i * 0.05 }}
                className="group relative overflow-hidden rounded-2xl border border-border shadow-sm"
              >
                <img
                  src={c.img}
                  alt={c.label}
                  loading="lazy"
                  className="aspect-[4/5] w-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 p-3.5">
                  <p className="text-lg">{c.emoji}</p>
                  <p className="font-semibold text-white">{c.label}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- Features ---------- */}
      <section className="border-t border-border/60 bg-muted/40">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-medium uppercase tracking-widest text-primary">Why Kamix</p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
              Built around how you actually dine
            </h2>
          </div>
          <div className="mt-12 grid gap-6 sm:grid-cols-2">
            {FEATURES.map((f, i) => (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.35, delay: i * 0.06 }}
                className="flex gap-4 rounded-2xl border border-border bg-card p-6 shadow-sm"
              >
                <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <f.icon className="size-5" />
                </div>
                <div>
                  <h3 className="font-semibold">{f.title}</h3>
                  <p className="mt-1.5 text-sm leading-6 text-muted-foreground">{f.text}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- Owners ---------- */}
      <section id="owners" className="border-t border-border/60">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-20 sm:px-6 lg:grid-cols-2">
          <div className="relative order-2 lg:order-1">
            <div className="rounded-3xl border border-border bg-card p-5 shadow-lg">
              <div className="mb-4 flex items-center justify-between">
                <p className="font-semibold">Tonight at La Brasa</p>
                <Badge variant="secondary">Owner view</Badge>
              </div>
              {[
                { t: "7:00 PM", inside: 9, bar: 4, terrace: 6 },
                { t: "8:00 PM", inside: 4, bar: 2, terrace: 0 },
                { t: "9:00 PM", inside: 7, bar: 8, terrace: 5 },
              ].map((row) => (
                <div key={row.t} className="mb-3 flex items-center gap-3 rounded-xl border border-border/70 bg-muted/30 px-4 py-3">
                  <span className="w-16 text-sm font-medium">{row.t}</span>
                  <div className="flex flex-1 gap-2">
                    <span className="flex-1 rounded-md bg-primary/15 py-1.5 text-center text-xs font-medium text-primary">
                      {row.inside} inside
                    </span>
                    <span className="flex-1 rounded-md bg-amber-500/15 py-1.5 text-center text-xs font-medium text-amber-600">
                      {row.bar} bar
                    </span>
                    <span className="flex-1 rounded-md bg-sky-500/15 py-1.5 text-center text-xs font-medium text-sky-600">
                      {row.terrace} outside
                    </span>
                  </div>
                </div>
              ))}
              <p className="flex items-center gap-2 rounded-xl bg-emerald-600/10 px-4 py-2.5 text-sm text-emerald-700 dark:text-emerald-400">
                <MapPin className="size-4" /> 120 tables freed up this week — zero double-bookings.
              </p>
            </div>
          </div>
          <div className="order-1 lg:order-2">
            <p className="text-sm font-medium uppercase tracking-widest text-primary">For restaurant owners</p>
            <h2 className="mt-3 text-balance text-3xl font-bold tracking-tight sm:text-4xl">
              Publish your free spots and fill them, live.
            </h2>
            <p className="mt-5 text-base leading-7 text-muted-foreground">
              Set your sections, hours and menus once — Kamix keeps your
              availability ledger up to the minute. Walk-ins, callers and app
              bookings all draw from the same count, so you never oversell a
              table again.
            </p>
            <ul className="mt-6 space-y-3">
              {[
                "Inside, terrace, bar & smoking zones — fully configurable",
                "Menu manager with live pricing and availability",
                "Per-slot close/reopen controls during service",
                "Bookings & no-shows tracked with one dashboard",
              ].map((item) => (
                <li key={item} className="flex items-start gap-3 text-sm text-muted-foreground">
                  <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Check className="size-3" />
                  </span>
                  {item}
                </li>
              ))}
            </ul>
            <Button size="lg" className="mt-8 h-12 px-7 text-base" asChild>
              <Link to="/auth?returnTo=/owner">
                Claim your restaurant <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* ---------- Final CTA ---------- */}
      <section className="border-t border-border/60">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <div className="relative overflow-hidden rounded-3xl bg-primary px-6 py-14 text-center text-primary-foreground shadow-xl shadow-primary/25 sm:px-16">
            <div className="texture-dots pointer-events-none absolute inset-0 opacity-20" />
            <div className="relative">
              <h2 className="mx-auto max-w-2xl text-balance text-3xl font-bold tracking-tight sm:text-4xl">
                Your table is waiting. Don&apos;t keep it.
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-pretty text-primary-foreground/85">
                Join Kamix free — book restaurants across the city in seconds,
                or put your restaurant on the map.
              </p>
              <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
                <Button
                  size="lg"
                  variant="secondary"
                  asChild
                  className="h-12 px-7 text-base"
                >
                  <Link to="/auth">Find a table</Link>
                </Button>
                <Button
                  size="lg"
                  asChild
                  className="h-12 border border-primary-foreground/30 bg-primary-foreground/10 px-7 text-base text-primary-foreground hover:bg-primary-foreground/20"
                >
                  <Link to="/auth?returnTo=/owner">List my restaurant</Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- Footer ---------- */}
      <footer className="border-t border-border/60">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 sm:flex-row sm:px-6">
          <div className="flex items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Store className="size-4" />
            </span>
            <span className="font-semibold tracking-tight">Kamix</span>
          </div>
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} Kamix · Live restaurant availability
          </p>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <Link to="/auth" className="transition-colors hover:text-foreground">Sign in</Link>
            <Link to="/auth?returnTo=/owner" className="transition-colors hover:text-foreground">Owners</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
