import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/convex/_generated/api";
import { useMutation } from "convex/react";
import { Eye, EyeOff, Loader2, UserCog } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export default function AdminTag() {
  const tagAsRestaurant = useMutation(api.admin.tagAsRestaurant);
  const ensureOwnerPassword = useMutation(api.admin.ensureOwnerPassword);

  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [tempPassword, setTempPassword] = useState("");
  const [showTagPass, setShowTagPass] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleTag = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const result = await tagAsRestaurant({ phone, name: name || undefined });
      if (tempPassword.length >= 8) {
        await ensureOwnerPassword({ phone, tempPassword });
      }
      toast.success(`Account tagged as restaurant (${result?.name || phone}).`);
      setPhone(""); setName(""); setTempPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not tag the account.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <UserCog className="size-5" /> Tag an account as restaurant
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Promote an existing account to restaurant owner.
        </p>
      </div>

      <Card className="rounded-2xl border-border/70">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <UserCog className="size-4 text-primary" /> Tag owner
          </CardTitle>
          <CardDescription>
            They must set a new password on their next login.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleTag} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="t-phone">Account phone *</Label>
              <Input id="t-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+961 71 123 456" type="tel" required disabled={saving} />
              <p className="text-xs text-muted-foreground">The account must already exist (registered with this phone).</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="t-name">Owner name</Label>
              <Input id="t-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Optional" disabled={saving} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="t-pass">Temporary password (optional)</Label>
              <div className="relative">
                <Input id="t-pass" value={tempPassword} onChange={(e) => setTempPassword(e.target.value)} placeholder="At least 8 characters — if the account has none" type={showTagPass ? "text" : "password"} disabled={saving} className="pr-10" />
                <button type="button" tabIndex={-1} onClick={() => setShowTagPass((v) => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {showTagPass ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>
            {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={saving}>
              {saving ? (<><Loader2 className="size-4 animate-spin" /> Tagging…</>) : "Tag as restaurant"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
