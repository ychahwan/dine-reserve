import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  ArrowRight,
  CalendarDays,
  Check,
  Gift,
  MapPin,
  MessageSquareText,
  PartyPopper,
  Phone,
  Search,
  Sparkles,
  Store,
  Users,
  Utensils,
} from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { Input } from "@/components/ui/input";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useTranslation } from "react-i18next";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

const STEPS = [
  { icon: Search, titleKey: "landing.step1Title", textKey: "landing.step1Text" },
  { icon: CalendarDays, titleKey: "landing.step2Title", textKey: "landing.step2Text" },
  { icon: MessageSquareText, titleKey: "landing.step3Title", textKey: "landing.step3Text" },
];

const SOCIALIZE_POINTS = [
  { icon: PartyPopper, titleKey: "landing.soc1Title", textKey: "landing.soc1Text" },
  { icon: Gift, titleKey: "landing.soc2Title", textKey: "landing.soc2Text" },
  { icon: Check, titleKey: "landing.soc3Title", textKey: "landing.soc3Text" },
];

export default function Landing() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [phone, setPhone] = useState("");
  const stats = useQuery(api.restaurants.stats);
  const restaurantCount = stats?.restaurantCount ?? null;
  const cityCount = stats?.cityCount ?? null;

  const handleGetStarted = (e: React.FormEvent) => {
    e.preventDefault();
    const q = phone.trim() ? `?phone=${encodeURIComponent(phone.trim())}` : "";
    navigate(`/auth${q}`);
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* ────────── Nav ────────── */}
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Store className="size-4" />
            </span>
            <span className="font-semibold tracking-tight" style={{ fontFamily: "var(--font-display)" }}>Kamix</span>
          </Link>
          <div className="flex items-center gap-1.5">
            <LanguageSwitcher />
            <Button variant="ghost" size="sm" asChild>
              <Link to="/auth">{t("common.signIn")}</Link>
            </Button>
            <Button size="sm" asChild className="bg-primary hover:bg-primary/90 text-primary-foreground">
              <Link to="/auth">{t("common.getStarted")}</Link>
            </Button>
          </div>
        </div>
      </header>

      {/* ────────── Hero ────────── */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/[0.04] via-transparent to-transparent" />

        <div className="relative mx-auto max-w-6xl px-4 pb-16 pt-14 sm:px-6 lg:pb-24 lg:pt-20">
          <div className="mx-auto max-w-2xl text-center">
            <div className="animate-fade-in-up">
              <Badge variant="secondary" className="mb-5 gap-1.5 rounded-full bg-primary/10 text-primary border-primary/20 px-3 py-1">
                <span className="size-1.5 rounded-full bg-primary" />
                {t("landing.heroBadge")}
              </Badge>

              <h1 className="text-balance text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
                {t("landing.title1")}
                <br />
                <span className="text-primary">{t("landing.title2")}</span>
              </h1>

              <p className="mt-5 mx-auto max-w-lg text-pretty text-base leading-7 text-muted-foreground sm:text-lg">
                {t("landing.subtitle")}
              </p>
            </div>

            {/* Phone entry */}
            <form
              onSubmit={handleGetStarted}
              className="animate-fade-in-up mt-8 mx-auto flex max-w-md flex-col gap-3 sm:flex-row"
              style={{ animationDelay: '0.15s' }}
            >
              <div className="relative flex-1">
                <Phone className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="tel"
                  inputMode="tel"
                  placeholder={t("landing.phonePlaceholder")}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="h-11 rounded-xl pl-10"
                  aria-label="Phone number"
                  autoFocus
                />
              </div>
              <Button type="submit" size="lg" className="h-11 rounded-xl px-6 bg-primary hover:bg-primary/90 text-primary-foreground">
                {t("common.getStarted")} <ArrowRight className="size-4" />
              </Button>
            </form>

            <p
              className="animate-fade-in mt-4 text-sm text-muted-foreground"
              style={{ animationDelay: '0.3s' }}
            >
              {t("landing.alreadyHave")}{" "}
              <Link to="/auth" className="font-medium text-primary hover:underline">
                {t("common.signIn")}
              </Link>
            </p>

            {/* Social proof */}
            <div
              className="animate-fade-in mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-3 text-sm text-muted-foreground"
              style={{ animationDelay: '0.4s' }}
            >
              <span className="flex items-center gap-2">
                <Utensils className="size-4 text-primary" />{" "}
                {restaurantCount !== null
                  ? t("landing.partner", { count: restaurantCount })
                  : t("landing.loadingPartners")}
              </span>
              {cityCount !== null && cityCount > 0 && (
                <span className="flex items-center gap-2">
                  <MapPin className="size-4 text-primary" /> {t("landing.city", { count: cityCount })}
                </span>
              )}
              <span className="flex items-center gap-2">
                <Check className="size-4 text-primary" /> {t("landing.freeToJoin")}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ────────── How it works ────────── */}
      <section id="how" className="border-t border-border/60">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-xs font-semibold uppercase tracking-widest text-primary">{t("landing.howLabel")}</p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
              {t("landing.howTitle")}
            </h2>
          </div>

          <div className="mt-14 grid gap-6 md:grid-cols-3">
            {STEPS.map((step, i) => (
              <div
                key={step.titleKey}
                className="animate-fade-in-up"
                style={{ animationDelay: `${i * 0.1}s` }}
              >
                <Card className="group relative overflow-hidden rounded-2xl border-border/70 p-6 transition-shadow hover:shadow-md">
                  <div className="mb-4 flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                    <step.icon className="size-6" />
                  </div>
                  <span className="absolute right-4 top-4 text-4xl font-bold text-muted-foreground/20" style={{ fontFamily: "var(--font-display)" }}>
                    0{i + 1}
                  </span>
                  <h3 className="font-semibold text-lg">{t(step.titleKey)}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{t(step.textKey)}</p>
                </Card>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ────────── Socialize ────────── */}
      <section id="socialize" className="border-t border-border/60 bg-muted/20">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            {/* Text content */}
            <div className="animate-fade-in-up">
              <p className="text-xs font-semibold uppercase tracking-widest text-primary">{t("landing.socializeLabel")}</p>
              <h2 className="mt-3 text-balance text-3xl font-bold tracking-tight sm:text-4xl">
                {t("landing.socializeTitle")}
              </h2>
              <p className="mt-5 text-base leading-7 text-muted-foreground">
                {t("landing.socializeBody")}
              </p>
              <div className="mt-8 space-y-5">
                {SOCIALIZE_POINTS.map((point) => (
                  <div key={point.titleKey} className="flex items-start gap-4">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <point.icon className="size-5" />
                    </div>
                    <div>
                      <p className="font-semibold">{t(point.titleKey)}</p>
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">{t(point.textKey)}</p>
                    </div>
                  </div>
                ))}
              </div>
              <Button size="lg" className="mt-8 h-11 rounded-xl px-7 bg-primary hover:bg-primary/90 text-primary-foreground" asChild>
                <Link to="/auth">
                  {t("landing.socializeCta")} <ArrowRight className="size-4" />
                </Link>
              </Button>
            </div>

            {/* Mock social card */}
            <div
              className="animate-fade-in-up flex justify-center"
              style={{ animationDelay: '0.1s' }}
            >
              <Card className="w-full max-w-sm rounded-2xl border-border/70 p-5">
                <div className="mb-4 flex items-center gap-3">
                  <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <PartyPopper className="size-5" />
                  </div>
                  <div>
                    <p className="font-semibold" style={{ fontFamily: "var(--font-display)" }}>{t("landing.mockTitle")}</p>
                    <p className="text-xs text-muted-foreground">{t("landing.mockSubtitle")}</p>
                  </div>
                </div>
                <div className="space-y-2.5">
                  {[
                    { name: "Rania", emoji: "🫖", time: "7:30 PM" },
                    { name: "Karim", emoji: "🥂", time: "8:00 PM" },
                    { name: "Layla", emoji: "🍝", time: "8:15 PM" },
                  ].map((diner) => (
                    <div
                      key={diner.name}
                      className="flex items-center gap-3 rounded-xl border border-border/60 bg-muted/30 px-3.5 py-2.5"
                    >
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm">
                        {diner.emoji}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{diner.name}</p>
                        <p className="text-xs text-muted-foreground">{diner.time}</p>
                      </div>
                      <span className="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                        <Check className="size-3" /> {t("landing.mockCheckedIn")}
                      </span>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* ────────── Owners ────────── */}
      <section id="owners" className="border-t border-border/60">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <div className="animate-fade-in-up">
              <p className="text-xs font-semibold uppercase tracking-widest text-primary">{t("landing.ownersLabel")}</p>
              <h2 className="mt-3 text-balance text-3xl font-bold tracking-tight sm:text-4xl">
                {t("landing.ownersTitle")}
              </h2>
              <p className="mt-4 text-base leading-7 text-muted-foreground">
                {t("landing.ownersBody")}
              </p>
              <ul className="mt-6 space-y-3">
                {[t("landing.ownerFeature1"), t("landing.ownerFeature2"), t("landing.ownerFeature3")].map((item) => (
                  <li key={item} className="flex items-start gap-3 text-sm text-muted-foreground">
                    <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                      <Check className="size-3" />
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
              <Button size="lg" className="mt-8 h-11 rounded-xl px-7 bg-primary hover:bg-primary/90 text-primary-foreground" asChild>
                <Link to="/auth?returnTo=/owner">
                  {t("landing.ownersCta")} <ArrowRight className="size-4" />
                </Link>
              </Button>
            </div>

            {/* Stats cards */}
            <div
              className="animate-fade-in-up grid grid-cols-2 gap-4"
              style={{ animationDelay: '0.1s' }}
            >
              <Card className="rounded-2xl border-border/70 p-5 text-center">
                <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <CalendarDays className="size-6" />
                </div>
                <p className="text-2xl font-bold text-primary" style={{ fontFamily: "var(--font-display)" }}>
                  {restaurantCount !== null ? restaurantCount : "—"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{t("landing.partner", { count: restaurantCount ?? 0 })}</p>
              </Card>
              <Card className="rounded-2xl border-border/70 p-5 text-center">
                <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Sparkles className="size-6" />
                </div>
                <p className="text-2xl font-bold text-primary" style={{ fontFamily: "var(--font-display)" }}>4.8★</p>
                <p className="mt-1 text-xs text-muted-foreground">Average owner rating</p>
              </Card>
              <Card className="col-span-2 rounded-2xl border-border/70 p-5">
                <div className="flex items-center gap-4">
                  <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Store className="size-6" />
                  </div>
                  <div>
                    <p className="font-semibold">Fill your free tables, live.</p>
                    <p className="text-sm text-muted-foreground">Walk-ins, callers and app bookings — never oversell a table.</p>
                  </div>
                </div>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* ────────── CTA Banner ────────── */}
      <section className="border-t border-border/60 bg-primary/[0.04]">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <div className="animate-fade-in-up mx-auto max-w-xl text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              {t("landing.title1")}<br />
              <span className="text-primary">{t("landing.title2")}</span>
            </h2>
            <p className="mt-4 text-muted-foreground">
              {t("landing.subtitle")}
            </p>
            <Button size="lg" className="mt-8 h-11 rounded-xl px-8 bg-primary hover:bg-primary/90 text-primary-foreground" asChild>
              <Link to="/auth">
                {t("common.getStarted")} <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* ────────── Footer ────────── */}
      <footer className="border-t border-border/60 bg-muted/20">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 sm:flex-row sm:px-6">
          <div className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Store className="size-4" />
            </span>
            <span className="font-semibold tracking-tight" style={{ fontFamily: "var(--font-display)" }}>Kamix</span>
          </div>
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} Kamix · {t("landing.footerTagline")}
          </p>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <Link to="/auth" className="transition-colors hover:text-foreground">{t("common.signIn")}</Link>
            <Link to="/auth?returnTo=/owner" className="transition-colors hover:text-foreground">{t("landing.footerOwners")}</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
