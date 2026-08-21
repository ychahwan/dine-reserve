import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowRight,
  CalendarDays,
  Check,
  Gift,
  MessageSquareText,
  PartyPopper,
  Phone,
  Search,
  Store,
  Users,
} from "lucide-react";
import { motion } from "framer-motion";
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
  // Real partner count from the backend (not a hard-coded claim).
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
      {/* ---------- Nav ---------- */}
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Store className="size-5" />
            </span>
            <span className="text-lg font-semibold tracking-tight">Kamix</span>
          </Link>
          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <Button variant="ghost" size="sm" asChild>
              <Link to="/auth">{t("common.signIn")}</Link>
            </Button>
            <Button size="sm" asChild>
              <Link to="/auth">{t("common.getStarted")}</Link>
            </Button>
          </div>
        </div>
      </header>

      {/* ---------- Hero: phone-first signup ---------- */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute -top-32 left-1/2 h-72 w-[46rem] -translate-x-1/2 rounded-full bg-primary/8 blur-3xl" />
        <div className="relative mx-auto max-w-3xl px-4 pb-20 pt-16 text-center sm:px-6 lg:pb-24 lg:pt-20">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <Badge variant="secondary" className="mb-5 gap-1.5 rounded-full px-3 py-1">
              <span className="size-1.5 rounded-full bg-primary" />
              {t("landing.heroBadge")}
            </Badge>
            <h1 className="text-balance text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
              {t("landing.title1")}
              <br />
              <span className="text-primary">{t("landing.title2")}</span>
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-pretty text-base leading-7 text-muted-foreground sm:text-lg">
              {t("landing.subtitle")}
            </p>
          </motion.div>

          {/* Phone entry → signup */}
          <motion.form
            onSubmit={handleGetStarted}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="mx-auto mt-8 flex max-w-md flex-col gap-3 sm:flex-row"
          >
            <div className="relative flex-1">
              <Phone className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="tel"
                inputMode="tel"
                placeholder={t("landing.phonePlaceholder")}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="h-12 pl-10 text-base"
                aria-label="Phone number"
                autoFocus
              />
            </div>
            <Button type="submit" size="lg" className="h-12 px-6 text-base">
              {t("common.getStarted")} <ArrowRight className="size-4" />
            </Button>
          </motion.form>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.25 }}
            className="mt-4 text-sm text-muted-foreground"
          >
            {t("landing.alreadyHave")}{" "}
            <Link to="/auth" className="font-medium text-primary hover:underline">
              {t("common.signIn")}
            </Link>
          </motion.p>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="mt-8 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-sm text-muted-foreground"
          >
            <span className="flex items-center gap-2">
              <Users className="size-4" />{" "}
              {restaurantCount !== null
                ? t("landing.partner", { count: restaurantCount })
                : t("landing.loadingPartners")}
            </span>
            {cityCount !== null && cityCount > 0 && (
              <span className="flex items-center gap-2">
                <Store className="size-4" /> {t("landing.city", { count: cityCount })}
              </span>
            )}
            <span className="flex items-center gap-2">
              <Check className="size-4" /> {t("landing.freeToJoin")}
            </span>
          </motion.div>
        </div>
      </section>

      {/* ---------- How it works ---------- */}
      <section id="how" className="border-t border-border/60">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-medium uppercase tracking-widest text-primary">{t("landing.howLabel")}</p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
              {t("landing.howTitle")}
            </h2>
          </div>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {STEPS.map((step, i) => (
              <motion.div
                key={step.titleKey}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-80px" }}
                transition={{ duration: 0.4, delay: i * 0.08 }}
                className="group relative rounded-2xl border border-border bg-card p-6"
              >
                <span className="absolute right-5 top-5 text-4xl font-bold text-border/70">
                  0{i + 1}
                </span>
                <div className="mb-4 flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                  <step.icon className="size-5" />
                </div>
                <h3 className="font-semibold">{t(step.titleKey)}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{t(step.textKey)}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- Socialize ---------- */}
      <section id="socialize" className="border-t border-border/60 bg-muted/30">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <div className="grid items-center gap-10 lg:grid-cols-2">
            <div>
              <p className="text-sm font-medium uppercase tracking-widest text-primary">{t("landing.socializeLabel")}</p>
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
              <Button size="lg" className="mt-8 h-12 px-7 text-base" asChild>
                <Link to="/auth">
                  {t("landing.socializeCta")} <ArrowRight className="size-4" />
                </Link>
              </Button>
            </div>

            {/* Mini Socialize mock */}
            <div className="relative order-1 lg:order-2">
              <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
                <div className="mb-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <PartyPopper className="size-4" />
                    </span>
                    <div>
                      <p className="text-sm font-semibold">{t("landing.mockTitle")}</p>
                      <p className="text-xs text-muted-foreground">{t("landing.mockSubtitle")}</p>
                    </div>
                  </div>
                  <Badge variant="secondary" className="text-xs">{t("landing.mockVisible")}</Badge>
                </div>
                <div className="space-y-3">
                  {[
                    { name: "Rania", emoji: "🫖", time: "7:30 PM" },
                    { name: "Karim", emoji: "🥂", time: "8:00 PM" },
                    { name: "Lina", emoji: "🍰", time: "8:00 PM" },
                  ].map((diner) => (
                    <div
                      key={diner.name}
                      className="flex items-center gap-3 rounded-xl border border-border/70 bg-muted/30 px-3.5 py-2.5"
                    >
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-lg">
                        {diner.emoji}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{diner.name}</p>
                        <p className="text-xs text-muted-foreground">{diner.time}</p>
                      </div>
                      <span className="flex items-center gap-1 rounded-full bg-emerald-600/10 px-2 py-1 text-[10px] font-medium text-emerald-700 dark:text-emerald-400">
                        <Check className="size-3" /> {t("landing.mockCheckedIn")}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex items-center justify-between rounded-xl bg-primary/5 px-3.5 py-2.5 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <Gift className="size-3.5 text-primary" /> {t("landing.mockSendGift")}
                  </span>
                  <span className="font-medium text-primary">+$9</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- Owners ---------- */}
      <section id="owners" className="border-t border-border/60 bg-background">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <div className="grid items-center gap-8 lg:grid-cols-2">
            <div>
              <p className="text-sm font-medium uppercase tracking-widest text-primary">{t("landing.ownersLabel")}</p>
              <h2 className="mt-3 text-balance text-3xl font-bold tracking-tight sm:text-4xl">
                {t("landing.ownersTitle")}
              </h2>
              <p className="mt-4 text-base leading-7 text-muted-foreground">
                {t("landing.ownersBody")}
              </p>
              <ul className="mt-6 space-y-3">
                {[
                  t("landing.ownerFeature1"),
                  t("landing.ownerFeature2"),
                  t("landing.ownerFeature3"),
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3 text-sm text-muted-foreground">
                    <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <Check className="size-3" />
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <Button size="lg" className="h-12 px-7 text-base lg:justify-self-start" asChild>
              <Link to="/auth?returnTo=/owner">
                {t("landing.ownersCta")} <ArrowRight className="size-4" />
              </Link>
            </Button>
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
