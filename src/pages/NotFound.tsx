import { Button } from "@/components/ui/button";
import { Store, UtensilsCrossed } from "lucide-react";
import { Link } from "react-router";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-5 bg-background px-4 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <UtensilsCrossed className="size-7" />
      </div>
      <div>
        <p className="text-sm font-medium uppercase tracking-widest text-primary">404</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">Table not found</h1>
        <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
          The page you&apos;re looking for was moved, or never made it to the menu.
        </p>
      </div>
      <div className="flex gap-3">
        <Button variant="outline" asChild>
          <Link to="/">Back home</Link>
        </Button>
        <Button asChild>
          <Link to="/explore">
            <Store className="size-4" /> Find a table
          </Link>
        </Button>
      </div>
    </div>
  );
}
