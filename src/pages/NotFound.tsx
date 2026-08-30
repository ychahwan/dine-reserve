import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";
import { Store, UtensilsCrossed } from "lucide-react";
import { Link } from "react-router";

export default function NotFound() {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-5 bg-background px-4 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <UtensilsCrossed className="size-7" />
      </div>
      <div>
        <p className="text-sm font-medium uppercase tracking-widest text-primary">404</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">{t("notfound.title")}</h1>
        <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
          {t("notfound.desc")}
        </p>
      </div>
      <div className="flex gap-3">
        <Button variant="outline" asChild>
          <Link to="/">{t("notfound.backHome")}</Link>
        </Button>
        <Button asChild>
          <Link to="/explore">
            <Store className="size-4" /> {t("notfound.findTable")}
          </Link>
        </Button>
      </div>
    </div>
  );
}
