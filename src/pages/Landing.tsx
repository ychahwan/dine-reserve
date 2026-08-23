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

/* Editorial restaurant photography — high-quality Unsplash images */
const HERO_IMG = "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=1400&q=80&auto=format";
const DINING_IMG = "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=900&q=80&auto=format";
const COURTYARD_IMG = "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=900&q=80&auto=format";
const CHEF_IMG = "https://images.unsplash.com/photo-1577219491135-ce391730fb2c?w=900&q=80&auto=format";

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
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Store className="size-5" />
            </span>
            <span className="text-lg font-semibold tracking-tight font-[var(--font-display)]">Kamix</span>
          </Link>
          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <Button variant="ghost" size="sm" asChild>
              <Link to="/auth">{t("common.signIn")}</Link>
            </Button>
            <Button size="sm" asChild className="bg-[var(--color-terracotta)] hover:bg-[var(--color-terracotta)]/90 text-white">
              <Link to="/auth">{t("common.getStarted")}</Link>
            </Button>
          </div>
        </div>
      </header>

      {/* ────────── Hero — atmospheric restaurant scene ────────── */}
      <section className="relative overflow-hidden">
        {/* Background image with overlay */}
        <div className="absolute inset-0">
          <img
            src={HERO_IMG}
            alt=""
            className="h-full w-full object-cover"
            loading="eager"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-background/80 via-background/60 to-background" />
          <div className="absolute inset-0 bg-gradient-to-r from-background/50 to-transparent" />
        </div>

        <div className="relative mx-auto max-w-6xl px-4 pb-20 pt-20 sm:px-6 lg:pb-28 lg:pt-24">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            {/* Left: editorial headline */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
            >
              <Badge variant="secondary" className="mb-5 gap-1.5 rounded-full bg-[var(--color-terracotta)]/10 text-[var(--color-terracotta)] border-[var(--color-terracotta)]/20 px-3 py-1">
                <span className="size-1.5 rounded-full bg-[var(--color-terracotta)]" />
                {t("landing.heroBadge")}
              </Badge>
              <h1 className="text-balance text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl" style={{ fontFamily: "var(--font-display)" }}>
                {t("landing.title1")}
                <br />
                <span className="text-[var(--color-terracotta)]">{t("landing.title2")}</span>
              </h1>
              <p className="mt-5 max-w-lg text-pretty text-base leading-7 text-muted-foreground sm:text-lg">
                {t("landing.subtitle")}
              </p>

              {/* Phone entry */}
              <motion.form
                onSubmit={handleGetStarted}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.15 }}
                className="mt-8 flex max-w-md flex-col gap-3 sm:flex-row"
              >
                <div className="relative flex-1">
                  <Phone className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="tel"
                    inputMode="tel"
                    placeholder={t("landing.phonePlaceholder")}
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="h-12 rounded-[var(--radius-md)] pl-10 text-base"
                    aria-label="Phone number"
                    autoFocus
                  />
                </div>
                <Button type="submit" size="lg" className="h-12 rounded-[var(--radius-md)] px-6 text-base bg-[var(--color-terracotta)] hover:bg-[var(--color-terracotta)]/90 text-white">
                  {t("common.getStarted")} <ArrowRight className="size-4" />
                </Button>
              </motion.form>

              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5, delay: 0.3 }}
                className="mt-4 text-sm text-muted-foreground"
              >
                {t("landing.alreadyHave")}{" "}
                <Link to="/auth" className="font-medium text-primary hover:underline">
                  {t("common.signIn")}
                </Link>
              </motion.p>

              {/* Social proof */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5, delay: 0.4 }}
                className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm text-muted-foreground"
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
            </motion.div>

            {/* Right: editorial image composition */}
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.7, delay: 0.2 }}
              className="relative hidden lg:block"
            >
              <div className="relative">
                {/* Main restaurant image */}
                <div className="overflow-hidden rounded-[var(--radius-2xl)] shadow-2xl">
                  <img
                    src={DINING_IMG}
                    alt="Atmospheric restaurant dining scene"
                    className="h-80 w-full object-cover"
                    loading="eager"
                  />
                </div>
                {/* Overlapping courtyard image */}
                <div className="absolute -bottom-6 -left-8 overflow-hidden rounded-[var(--radius-xl)] shadow-xl ring-1 ring-border/20">
                  <img
                    src={COURTYARD_IMG}
                    alt="Restaurant courtyard"
                    className="h-36 w-48 object-cover"
                    loading="eager"
                  />
                </div>
                {/* Floating reservation receipt card */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.6 }}
                  className="absolute -right-4 top-8 w-56 rounded-[var(--radius-xl)] border border-border/60 bg-background/95 p-4 shadow-lg backdrop-blur-sm"
                >
                  <p className="text-xs font-semibold uppercase tracking-widest text-[var(--color-terracotta)]">Reservation confirmed</p>
                  <p className="mt-1.5 text-sm font-semibold" style={{ fontFamily: "var(--font-display)" }}>Beirut Bistro</p>
                  <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><CalendarDays className="size-3" /> Sat, Aug 23</span>
                    <span>8:00 PM · 4 guests</span>
                  </div>
                  <div className="mt-2.5 flex items-center gap-1.5 rounded-full bg-emerald-600/10 px-2.5 py-1 text-[10px] font-semibold text-emerald-700">
                    <Check className="size-3" /> Table ready
                  </div>
                </motion.div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ────────── How it works — editorial flow ────────── */}
      <section id="how" className="border-t border-border/60">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-medium uppercase tracking-widest text-[var(--color-terracotta)]">{t("landing.howLabel")}</p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl" style={{ fontFamily: "var(--font-display)" }}>
              {t("landing.howTitle")}
            </h2>
          </div>

          <div className="mt-14 grid gap-6 md:grid-cols-3">
            {STEPS.map((step, i) => (
              <motion.div
                key={step.titleKey}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.5, delay: i * 0.1 }}
                className="group relative overflow-hidden rounded-[var(--radius-2xl)] border border-border/60 bg-card shadow-sm transition-shadow hover:shadow-md"
              >
                {/* Step image */}
                <div className="relative h-40 overflow-hidden bg-gradient-to-br from-[var(--color-terracotta)]/10 via-[var(--color-gold)]/5 to-card">
                  <img
                    src={[DINING_IMG, COURTYARD_IMG, CHEF_IMG][i]}
                    alt=""
                    className="h-full w-full object-cover opacity-60 transition-transform duration-500 group-hover:scale-105"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-background/80 to-transparent" />
                  <span className="absolute bottom-3 left-4 text-5xl font-bold text-foreground/10" style={{ fontFamily: "var(--font-display)" }}>
                    0{i + 1}
                  </span>
                </div>
                <div className="p-5">
                  <div className="mb-3 flex size-10 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-terracotta)]/10 text-[var(--color-terracotta)] transition-colors group-hover:bg-[var(--color-terracotta)] group-hover:text-white">
                    <step.icon className="size-5" />
                  </div>
                  <h3 className="font-semibold" style={{ fontFamily: "var(--font-display)" }}>{t(step.titleKey)}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{t(step.textKey)}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ────────── Socialize — atmospheric dining ────────── */}
      <section id="socialize" className="border-t border-border/60 bg-muted/20">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            {/* Image composition */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.6 }}
              className="relative order-1 lg:order-1"
            >
              <div className="relative">
                <div className="overflow-hidden rounded-[var(--radius-2xl)] shadow-xl">
                  <img
                    src={CHEF_IMG}
                    alt="Restaurant chef preparing a dish"
                    className="h-72 w-full object-cover sm:h-80"
                    loading="lazy"
                  />
                </div>
                {/* Floating social card */}
                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.4, delay: 0.3 }}
                  className="absolute -bottom-5 -right-5 w-60 rounded-[var(--radius-xl)] border border-border/60 bg-background/95 p-4 shadow-lg backdrop-blur-sm sm:-right-8"
                >
                  <div className="mb-3 flex items-center gap-2">
                    <span className="flex size-7 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--color-terracotta)]/10 text-[var(--color-terracotta)]">
                      <PartyPopper className="size-3.5" />
                    </span>
                    <div>
                      <p className="text-xs font-semibold">{t("landing.mockTitle")}</p>
                      <p className="text-[10px] text-muted-foreground">{t("landing.mockSubtitle")}</p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {[
                      { name: "Rania", emoji: "🫖", time: "7:30 PM" },
                      { name: "Karim", emoji: "🥂", time: "8:00 PM" },
                    ].map((diner) => (
                      <div
                        key={diner.name}
                        className="flex items-center gap-2.5 rounded-[var(--radius-md)] border border-border/60 bg-muted/30 px-3 py-2"
                      >
                        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[var(--color-terracotta)]/10 text-sm">
                          {diner.emoji}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-medium">{diner.name}</p>
                          <p className="text-[10px] text-muted-foreground">{diner.time}</p>
                        </div>
                        <span className="flex items-center gap-1 rounded-full bg-emerald-600/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
                          <Check className="size-2.5" /> {t("landing.mockCheckedIn")}
                        </span>
                      </div>
                    ))}
                  </div>
                </motion.div>
              </div>
            </motion.div>

            {/* Text content */}
            <div className="order-2">
              <p className="text-sm font-medium uppercase tracking-widest text-[var(--color-terracotta)]">{t("landing.socializeLabel")}</p>
              <h2 className="mt-3 text-balance text-3xl font-bold tracking-tight sm:text-4xl" style={{ fontFamily: "var(--font-display)" }}>
                {t("landing.socializeTitle")}
              </h2>
              <p className="mt-5 text-base leading-7 text-muted-foreground">
                {t("landing.socializeBody")}
              </p>
              <div className="mt-8 space-y-5">
                {SOCIALIZE_POINTS.map((point) => (
                  <div key={point.titleKey} className="flex items-start gap-4">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-terracotta)]/10 text-[var(--color-terracotta)]">
                      <point.icon className="size-5" />
                    </div>
                    <div>
                      <p className="font-semibold">{t(point.titleKey)}</p>
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">{t(point.textKey)}</p>
                    </div>
                  </div>
                ))}
              </div>
              <Button size="lg" className="mt-8 h-12 rounded-[var(--radius-md)] px-7 text-base bg-[var(--color-terracotta)] hover:bg-[var(--color-terracotta)]/90 text-white" asChild>
                <Link to="/auth">
                  {t("landing.socializeCta")} <ArrowRight className="size-4" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* ────────── Owners — editorial with image ────────── */}
      <section id="owners" className="border-t border-border/60">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <div>
              <p className="text-sm font-medium uppercase tracking-widest text-[var(--color-gold)]">{t("landing.ownersLabel")}</p>
              <h2 className="mt-3 text-balance text-3xl font-bold tracking-tight sm:text-4xl" style={{ fontFamily: "var(--font-display)" }}>
                {t("landing.ownersTitle")}
              </h2>
              <p className="mt-4 text-base leading-7 text-muted-foreground">
                {t("landing.ownersBody")}
              </p>
              <ul className="mt-6 space-y-3">
                {[t("landing.ownerFeature1"), t("landing.ownerFeature2"), t("landing.ownerFeature3")].map((item) => (
                  <li key={item} className="flex items-start gap-3 text-sm text-muted-foreground">
                    <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-[var(--color-gold)]/15 text-[var(--color-gold)]">
                      <Check className="size-3" />
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
              <Button size="lg" className="mt-8 h-12 rounded-[var(--radius-md)] px-7 text-base bg-[var(--color-forest)] hover:bg-[var(--color-forest)]/90 text-white" asChild>
                <Link to="/auth?returnTo=/owner">
                  {t("landing.ownersCta")} <ArrowRight className="size-4" />
                </Link>
              </Button>
            </div>

            {/* Restaurant imagery */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.6 }}
              className="relative hidden lg:block"
            >
              <div className="relative">
                <div className="overflow-hidden rounded-[var(--radius-2xl)] shadow-xl">
                  <img
                    src={COURTYARD_IMG}
                    alt="Restaurant courtyard ambiance"
                    className="h-72 w-full object-cover"
                    loading="lazy"
                  />
                </div>
                {/* Floating stat card */}
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.4, delay: 0.3 }}
                  className="absolute -bottom-5 left-6 rounded-[var(--radius-xl)] border border-border/60 bg-background/95 px-5 py-3 shadow-lg backdrop-blur-sm"
                >
                  <p className="text-2xl font-bold text-[var(--color-gold)]" style={{ fontFamily: "var(--font-display)" }}>4.8★</p>
                  <p className="text-xs text-muted-foreground">Average owner rating</p>
                </motion.div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ────────── Footer ────────── */}
      <footer className="border-t border-border/60 bg-muted/20">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 sm:flex-row sm:px-6">
          <div className="flex items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
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
