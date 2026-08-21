import { useTranslation } from "react-i18next";
import { Languages, Check } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { SUPPORTED_LANGS, switchLanguage, type Lang } from "@/i18n";
import { cn } from "@/lib/utils";

const LABELS: Record<Lang, string> = {
  en: "English",
  ar: "العربية",
  fr: "Français",
};

/**
 * Compact language switcher. Renders as a globe icon button that opens a small
 * menu with the three supported languages (English, العربية, Français).
 */
export function LanguageSwitcher({ align = "right" }: { align?: "left" | "right" }) {
  const { i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const current = (SUPPORTED_LANGS as readonly string[]).includes(i18n.language)
    ? (i18n.language as Lang)
    : "en";

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Language"
        title="Language"
        className="flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
      >
        <Languages className="size-4.5" />
      </button>
      {open && (
        <div
          className={cn(
            "absolute top-11 z-50 min-w-36 overflow-hidden rounded-xl border border-border bg-popover shadow-lg",
            align === "right" ? "right-0" : "left-0",
          )}
        >
          {SUPPORTED_LANGS.map((lang) => (
            <button
              key={lang}
              type="button"
              onClick={() => {
                switchLanguage(lang);
                setOpen(false);
              }}
              className={cn(
                "flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-sm transition-colors hover:bg-muted/60",
                current === lang ? "font-semibold text-primary" : "text-foreground",
              )}
            >
              <span>{LABELS[lang]}</span>
              {current === lang && <Check className="size-4" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
