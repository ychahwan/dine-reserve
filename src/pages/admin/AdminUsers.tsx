import { Spinner } from "@/components/ui/spinner";
import { api } from "@/convex/_generated/api";
import { useQuery } from "convex/react";
import { Link } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Ban } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { roleBadge, EmptyNote } from "./AdminUI";
import { formatPrice } from "@/lib/format";

export default function AdminUsers() {
  const rows = useQuery(api.adminView.listUsers);

  if (rows === undefined) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
        <Spinner className="size-4" /> Loading users…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Users</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          All {rows.length} accounts. Select one to see their bookings, orders and interactions.
        </p>
      </div>

      {rows.length === 0 ? (
        <EmptyNote>No users yet.</EmptyNote>
      ) : (
        <div className="rounded-2xl border border-border/70 bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Role</TableHead>
                <TableHead className="hidden md:table-cell">Contact</TableHead>
                <TableHead className="hidden sm:table-cell">Bookings</TableHead>
                <TableHead className="hidden sm:table-cell">Orders</TableHead>
                <TableHead className="hidden lg:table-cell">Reviews</TableHead>
                <TableHead className="hidden lg:table-cell">Spend</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((u) => (
                <TableRow key={u._id}>
                  <TableCell>
                    <Link to={`/admin/users/${u._id}`} className="group block">
                      <p className="flex items-center gap-2 font-medium group-hover:text-primary">
                        {u.name ?? "Unnamed"}
                        {u.disabled && (
                          <Badge className="gap-1 bg-destructive/10 text-destructive">
                            <Ban className="size-3" /> Disabled
                          </Badge>
                        )}
                      </p>
                      {u.ownedRestaurants.length > 0 && (
                        <p className="text-xs text-muted-foreground">
                          owns {u.ownedRestaurants.map((r) => r.name).join(", ")}
                        </p>
                      )}
                    </Link>
                  </TableCell>
                  <TableCell>{roleBadge(u.role)}</TableCell>
                  <TableCell className="hidden md:table-cell">
                    <p className="text-sm">{u.phone ?? ""}</p>
                    {u.email && <p className="text-xs text-muted-foreground">{u.email}</p>}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">{u.bookingCount}</TableCell>
                  <TableCell className="hidden sm:table-cell">{u.orderCount}</TableCell>
                  <TableCell className="hidden lg:table-cell">{u.reviewCount}</TableCell>
                  <TableCell className="hidden lg:table-cell">{formatPrice(u.totalSpendCents)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
