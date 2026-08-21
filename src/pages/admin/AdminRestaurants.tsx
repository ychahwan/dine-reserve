import { Spinner } from "@/components/ui/spinner";
import { api } from "@/convex/_generated/api";
import { useQuery } from "convex/react";
import { Link } from "react-router";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Ban } from "lucide-react";
import { Stars, EmptyNote } from "./AdminUI";
import { formatPrice } from "@/lib/format";

export default function AdminRestaurants() {
  const rows = useQuery(api.adminView.listRestaurants);

  if (rows === undefined) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
        <Spinner className="size-4" /> Loading restaurants…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Restaurants</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          All {rows.length} restaurants on the platform. Select one to see its full operational detail.
        </p>
      </div>

      {rows.length === 0 ? (
        <EmptyNote>No restaurants yet.</EmptyNote>
      ) : (
        <div className="rounded-2xl border border-border/70 bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Restaurant</TableHead>
                <TableHead className="hidden md:table-cell">Owner</TableHead>
                <TableHead>Rating</TableHead>
                <TableHead className="hidden sm:table-cell">Bookings</TableHead>
                <TableHead className="hidden sm:table-cell">Orders</TableHead>
                <TableHead className="hidden lg:table-cell">Revenue</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r._id}>
                  <TableCell>
                    <Link to={`/admin/restaurants/${r._id}`} className="group block">
                      <p className="flex items-center gap-2 font-medium group-hover:text-primary">
                        {r.name}
                        {r.disabled && (
                          <Badge className="gap-1 bg-destructive/10 text-destructive">
                            <Ban className="size-3" /> Disabled
                          </Badge>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {r.cuisine} · {r.city}
                      </p>
                    </Link>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <span className="font-medium">{r.ownerName ?? "—"}</span>
                    <p className="text-xs text-muted-foreground">{r.ownerPhone ?? ""}</p>
                  </TableCell>
                  <TableCell>
                    {r.rating.count > 0 ? (
                      <span className="inline-flex items-center gap-1.5">
                        <Stars rating={r.rating.avg} />
                        <span className="text-xs text-muted-foreground">({r.rating.count})</span>
                      </span>
                    ) : (
                      <Badge variant="outline">No reviews</Badge>
                    )}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">{r.bookingCount}</TableCell>
                  <TableCell className="hidden sm:table-cell">{r.orderCount}</TableCell>
                  <TableCell className="hidden lg:table-cell">{formatPrice(r.revenueCents)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
