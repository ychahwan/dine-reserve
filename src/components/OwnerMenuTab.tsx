import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api } from "@/convex/_generated/api";
import { useAction, useMutation } from "convex/react";
import { ImagePlus, Loader2, Pencil, Plus, Star, Trash2, Upload, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { formatPrice } from "@/lib/format";
import { ALLERGENS, DIETARY_TAGS, FEATURE_TAGS, SPICE_LEVELS, spiceLabel } from "@/lib/menu";
import { toast } from "sonner";

export type OwnerMenuItem = {
  _id: string;
  name: string;
  description?: string;
  priceCents: number;
  category?: string;
  popular?: boolean;
  available: boolean;
  imageUrl?: string;
  tags?: string[];
  allergens?: string[];
  ingredients?: string[];
  spiceLevel?: string;
};

export type OwnerMenuDoc = {
  _id: string;
  name: string;
  description?: string;
  items: OwnerMenuItem[];
};

const MAX_PHOTO_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_INGREDIENTS = 12;

// ---------------------------------------------------------------------------
// Main tab
// ---------------------------------------------------------------------------

export function OwnerMenuTab({ restaurantId, menuDocs }: { restaurantId: string; menuDocs: OwnerMenuDoc[] }) {
  const createMenu = useMutation(api.restaurants.createMenu);
  const deleteMenu = useMutation(api.restaurants.deleteMenu);
  const deleteItem = useMutation(api.restaurants.deleteMenuItem);

  const [newMenuName, setNewMenuName] = useState("");
  const [saving, setSaving] = useState(false);
  const [dialog, setDialog] = useState<{ open: boolean; menuId: string; item: OwnerMenuItem | null }>({
    open: false,
    menuId: "",
    item: null,
  });
  // KB-15: native window.confirm is blocked in the sandboxed preview iframe
  // and would silently do nothing — confirm destructive deletes in-app.
  const [deleteConfirm, setDeleteConfirm] = useState<
    | { kind: "menu"; id: string; name: string }
    | { kind: "item"; id: string; name: string }
    | null
  >(null);
  const [deleting, setDeleting] = useState(false);

  const confirmDelete = async () => {
    if (!deleteConfirm || deleting) return;
    setDeleting(true);
    try {
      if (deleteConfirm.kind === "menu") {
        await deleteMenu({ id: deleteConfirm.id as never });
        toast.success("Menu deleted");
      } else {
        await deleteItem({ id: deleteConfirm.id as never });
        toast.success("Item deleted");
      }
      setDeleteConfirm(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete.");
    } finally {
      setDeleting(false);
    }
  };

  const handleAddMenu = async () => {
    if (!newMenuName.trim()) return;
    setSaving(true);
    try {
      await createMenu({ restaurantId: restaurantId as never, name: newMenuName });
      setNewMenuName("");
      toast.success("Menu added");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not add menu.");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteMenu = (m: OwnerMenuDoc) => setDeleteConfirm({ kind: "menu", id: m._id, name: m.name });
  const handleDeleteItem = (it: OwnerMenuItem) => setDeleteConfirm({ kind: "item", id: it._id, name: it.name });

  const openAdd = (menuId: string) => setDialog({ open: true, menuId, item: null });
  const openEdit = (menuId: string, item: OwnerMenuItem) => setDialog({ open: true, menuId, item });

  return (
    <div className="space-y-4 pb-6">
      {menuDocs.length === 0 && (
        <p className="rounded-xl bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
          Add your first menu to show dishes to diners before they book.
        </p>
      )}

      {menuDocs.map((m) => (
        <Card key={m._id} className="rounded-2xl border-border/70 p-0 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-3">
            <div>
              <CardTitle className="text-base">{m.name}</CardTitle>
              {m.description && <p className="mt-0.5 text-xs text-muted-foreground">{m.description}</p>}
            </div>
            <div className="flex shrink-0 gap-1">
              <Button variant="ghost" size="sm" className="h-8" onClick={() => openAdd(m._id)}>
                <Plus className="size-3.5" /> Item
              </Button>
              <Button variant="ghost" size="icon-sm" aria-label="Delete menu" className="text-destructive" onClick={() => handleDeleteMenu(m)}>
                <Trash2 className="size-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {m.items.length === 0 && <p className="text-xs text-muted-foreground">No items yet.</p>}
            {m.items.map((it) => (
              <ItemRow key={it._id} item={it} onEdit={() => openEdit(m._id, it)} onDelete={() => handleDeleteItem(it)} />
            ))}
          </CardContent>
        </Card>
      ))}

      <Card className="rounded-2xl border-border/70 p-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">New menu</CardTitle>
        </CardHeader>
        <CardContent className="flex gap-2">
          <Input
            value={newMenuName}
            onChange={(e) => setNewMenuName(e.target.value)}
            placeholder="e.g. Lunch menu"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleAddMenu();
              }
            }}
          />
          <Button onClick={handleAddMenu} disabled={saving || !newMenuName.trim()}>
            <Plus className="size-4" /> Add
          </Button>
        </CardContent>
      </Card>

      <ItemFormDialog
        open={dialog.open}
        menuId={dialog.menuId}
        item={dialog.item}
        onClose={() => setDialog({ open: false, menuId: "", item: null })}
      />

      {/* KB-15: in-app delete confirmation (window.confirm is blocked in the
          sandboxed preview iframe) */}
      <AlertDialog
        open={!!deleteConfirm}
        onOpenChange={(open) => {
          if (!open && !deleting) setDeleteConfirm(null);
        }}
      >
        <AlertDialogContent className="max-w-sm rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="tracking-tight">
              {deleteConfirm?.kind === "menu"
                ? `Delete “${deleteConfirm.name}” and all its items?`
                : `Delete “${deleteConfirm?.name}”?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteConfirm?.kind === "menu"
                ? "This menu and every dish in it will be removed from the diner menu."
                : "This dish will be removed from the diner menu."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>{deleteConfirm ? "Keep it" : ""}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={deleting}
              onClick={(e) => {
                e.preventDefault();
                confirmDelete();
              }}
            >
              {deleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Item row
// ---------------------------------------------------------------------------

function ItemRow({ item, onEdit, onDelete }: { item: OwnerMenuItem; onEdit: () => void; onDelete: () => void }) {
  const updateItem = useMutation(api.restaurants.updateMenuItem);
  const [busy, setBusy] = useState(false);

  const toggleAvailable = async () => {
    setBusy(true);
    try {
      await updateItem({ id: item._id as never, available: !item.available });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update item.");
    } finally {
      setBusy(false);
    }
  };

  const tags = item.tags ?? [];
  const allergens = item.allergens ?? [];
  const ingredients = item.ingredients ?? [];
  const spice = item.spiceLevel ? spiceLabel(item.spiceLevel) : null;

  return (
    <div className="flex items-start gap-3 rounded-xl border border-border/70 px-3 py-2.5">
      {item.imageUrl ? (
        <img src={item.imageUrl} alt={item.name} className="size-14 shrink-0 rounded-lg object-cover" />
      ) : (
        <div className="flex size-14 shrink-0 items-center justify-center rounded-lg bg-muted/60 text-muted-foreground">
          <ImagePlus className="size-5" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <p className="truncate text-sm font-medium">
            {item.name}
            {item.popular && <Star className="ml-1.5 inline size-3.5 fill-amber-400 text-amber-400" />}
          </p>
          {spice && <span className="text-[11px] text-orange-600 dark:text-orange-400" title={`Spice: ${spice}`}>{spice}</span>}
        </div>
        <p className="text-xs text-muted-foreground">
          {formatPrice(item.priceCents)}
          {item.category ? ` · ${item.category}` : ""}
        </p>
        {(tags.length > 0 || allergens.length > 0) && (
          <div className="mt-1 flex flex-wrap gap-1">
            {tags.slice(0, 4).map((t) => (
              <span key={t} className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                {t}
              </span>
            ))}
            {tags.length > 4 && <span className="text-[10px] text-muted-foreground">+{tags.length - 4}</span>}
            {allergens.length > 0 && (
              <span
                className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400"
                title={`Contains: ${allergens.join(", ")}`}
              >
                ⚠ {allergens.length} allergen{allergens.length === 1 ? "" : "s"}
              </span>
            )}
          </div>
        )}
        {ingredients.length > 0 && (
          <p className="mt-1 truncate text-[11px] text-muted-foreground" title={ingredients.join(", ")}>
            🥘 {ingredients.join(", ")}
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <button
          onClick={toggleAvailable}
          disabled={busy}
          className={cn(
            "rounded-full border px-2.5 py-1 text-[10px] font-medium transition-colors",
            item.available
              ? "border-emerald-600/30 bg-emerald-600/10 text-emerald-700 dark:text-emerald-400"
              : "border-border bg-muted/40 text-muted-foreground",
          )}
          title="Toggle availability"
        >
          {item.available ? "Available" : "Hidden"}
        </button>
        <Button variant="ghost" size="icon-sm" aria-label="Edit item" onClick={onEdit}>
          <Pencil className="size-3.5" />
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label="Delete item" className="text-destructive" onClick={onDelete}>
          <Trash2 className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Add / edit dialog (photo + attributes + ingredients)
// ---------------------------------------------------------------------------

function ItemFormDialog({
  open,
  menuId,
  item,
  onClose,
}: {
  open: boolean;
  menuId: string;
  item: OwnerMenuItem | null;
  onClose: () => void;
}) {
  const createItem = useMutation(api.restaurants.createMenuItem);
  const updateItem = useMutation(api.restaurants.updateMenuItem);
  const generateUploadUrl = useAction(api.uploads.generateUploadUrl);

  const [form, setForm] = useState({ name: "", price: "", category: "", description: "" });
  const [popular, setPopular] = useState(false);
  const [available, setAvailable] = useState(true);
  const [tags, setTags] = useState<string[]>([]);
  const [allergens, setAllergens] = useState<string[]>([]);
  const [ingredients, setIngredients] = useState<string[]>([]);
  const [ingInput, setIngInput] = useState("");
  const [spice, setSpice] = useState<string>("");
  const [currentImage, setCurrentImage] = useState<string | null>(null);
  const [newUpload, setNewUpload] = useState<{ storageId: string; preview: string } | null>(null);
  const [urlInput, setUrlInput] = useState("");
  const [removeImage, setRemoveImage] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Prefill whenever the dialog opens for a different item.
  useEffect(() => {
    if (!open) return;
    setForm({
      name: item?.name ?? "",
      price: item ? (item.priceCents / 100).toFixed(2) : "",
      category: item?.category ?? "",
      description: item?.description ?? "",
    });
    setPopular(item?.popular ?? false);
    setAvailable(item?.available ?? true);
    setTags(item?.tags ?? []);
    setAllergens(item?.allergens ?? []);
    setIngredients(item?.ingredients ?? []);
    setIngInput("");
    setSpice(item?.spiceLevel ?? "");
    setCurrentImage(item?.imageUrl ?? null);
    setNewUpload(null);
    setUrlInput("");
    setRemoveImage(false);
    setError(null);
  }, [open, item]);

  const toggleTag = (list: string[], setList: (v: string[]) => void, value: string) =>
    setList(list.includes(value) ? list.filter((t) => t !== value) : [...list, value]);

  const addIngredient = (raw: string) => {
    const parts = raw.split(",").map((p) => p.trim()).filter(Boolean);
    if (parts.length === 0) return;
    setIngredients((prev) => {
      const seen = new Set(prev.map((i) => i.toLowerCase()));
      const next = [...prev];
      for (const p of parts) {
        const key = p.toLowerCase();
        if (!seen.has(key) && next.length < MAX_INGREDIENTS) {
          seen.add(key);
          next.push(p.slice(0, 40));
        }
      }
      return next;
    });
    setIngInput("");
  };

  const handleFile = async (file: File | undefined | null) => {
    if (!file) return;
    if (file.size > MAX_PHOTO_BYTES) {
      setError("Photo must be under 5 MB.");
      return;
    }
    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file (JPG, PNG, WebP…).");
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const uploadUrl = await generateUploadUrl();
      const res = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!res.ok) throw new Error("Upload failed — try again.");
      const data = (await res.json()) as { storageId: string };
      setNewUpload({ storageId: data.storageId, preview: URL.createObjectURL(file) });
      setUrlInput("");
      setRemoveImage(false);
      toast.success("Photo uploaded — save the item to keep it");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not upload the photo.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const previewSrc = newUpload?.preview ?? (currentImage && !removeImage ? currentImage : null);

  const handleSave = async () => {
    const priceCents = Math.round((parseFloat(form.price) || 0) * 100);
    if (!form.name.trim() || priceCents <= 0) {
      setError("Item name and a valid price are required.");
      return;
    }
    setError(null);
    setSaving(true);

    // One photo wins: a fresh upload beats a pasted URL; Remove clears both.
    const hasNewUpload = newUpload !== null;
    const hasUrl = urlInput.trim() !== "" && !hasNewUpload;
    const payload = {
      name: form.name,
      priceCents,
      category: form.category.trim() || undefined,
      description: form.description.trim() || undefined,
      popular,
      tags,
      allergens,
      ingredients,
      spiceLevel: spice || undefined,
      imageStorageId: hasNewUpload ? (newUpload!.storageId as never) : undefined,
      imageUrl: hasUrl ? urlInput.trim() : undefined,
    };

    try {
      if (item) {
        await updateItem({
          id: item._id as never,
          ...payload,
          available,
          removeImage: removeImage || undefined,
        });
        toast.success("Item updated");
      } else {
        await createItem({ menuId: menuId as never, ...payload });
        toast.success("Item added");
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the item.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && !uploading && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{item ? "Edit item" : "Add item"}</DialogTitle>
          <DialogDescription>
            {item ? `Update “${item.name}” — photo and attributes show on the diner menu.` : "Photos and tags help diners find and trust your dishes."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Basics */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="f-name">Dish name *</Label>
              <Input id="f-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Cacio e pepe" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="f-price">Price *</Label>
              <Input id="f-price" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder="14.50" inputMode="decimal" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="f-category">Category</Label>
              <Input id="f-category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="e.g. Pasta" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="f-spice">Spice level</Label>
              <Select value={spice} onValueChange={(v) => setSpice(v === "" ? "" : v)}>
                <SelectTrigger id="f-spice" className="w-full">
                  <SelectValue placeholder="Not spicy" />
                </SelectTrigger>
                <SelectContent>
                  {SPICE_LEVELS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="f-desc">Description</Label>
            <Input id="f-desc" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Short description (optional)" />
          </div>

          {/* Photo */}
          <div className="space-y-2">
            <Label>Photo</Label>
            <div className="flex items-center gap-3">
              {previewSrc ? (
                <div className="relative">
                  <img src={previewSrc} alt="Item preview" className="size-16 rounded-xl object-cover" />
                  <button
                    type="button"
                    aria-label="Remove photo"
                    onClick={() => {
                      setNewUpload(null);
                      setRemoveImage(true);
                    }}
                    className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full bg-destructive text-white"
                  >
                    <X className="size-3" />
                  </button>
                </div>
              ) : (
                <div className="flex size-16 items-center justify-center rounded-xl border border-dashed border-border text-muted-foreground">
                  <ImagePlus className="size-5" />
                </div>
              )}
              <div className="flex-1 space-y-2">
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleFile(e.target.files?.[0])} />
                <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
                  {uploading ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />} Upload photo
                </Button>
                <div className="flex gap-2">
                  <Input
                    value={urlInput}
                    onChange={(e) => {
                      setUrlInput(e.target.value);
                      if (e.target.value.trim()) {
                        setNewUpload(null);
                        setRemoveImage(false);
                      }
                    }}
                    placeholder="…or paste an image URL"
                    className="h-8 text-xs"
                  />
                  {newUpload && (
                    <Button type="button" variant="ghost" size="sm" className="h-8 shrink-0" onClick={() => setNewUpload(null)}>
                      Cancel upload
                    </Button>
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground">JPG, PNG or WebP · up to 5 MB. You can upload a photo or link one from the web.</p>
              </div>
            </div>
          </div>

          {/* Ingredients */}
          <div>
            <p className="text-sm font-medium">Ingredients</p>
            <p className="mb-1.5 text-[11px] text-muted-foreground">
              List the dish&apos;s ingredients — diners can remove any of these when they order at the table.
            </p>
            {ingredients.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {ingredients.map((ing) => (
                  <span
                    key={ing}
                    className="flex items-center gap-1 rounded-full border border-border bg-card px-2.5 py-1 text-[11px] font-medium text-foreground"
                  >
                    {ing}
                    <button
                      type="button"
                      aria-label={`Remove ${ing}`}
                      onClick={() => setIngredients((prev) => prev.filter((i) => i !== ing))}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <Input
                value={ingInput}
                onChange={(e) => setIngInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === ",") {
                    e.preventDefault();
                    addIngredient(ingInput);
                  }
                }}
                onBlur={() => {
                  if (ingInput.trim()) addIngredient(ingInput);
                }}
                placeholder="e.g. Pecorino romano — Enter to add"
                className="h-8 text-xs"
                disabled={ingredients.length >= MAX_INGREDIENTS}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 shrink-0"
                onClick={() => addIngredient(ingInput)}
                disabled={!ingInput.trim() || ingredients.length >= MAX_INGREDIENTS}
              >
                <Plus className="size-3.5" /> Add
              </Button>
            </div>
            <p className="mt-1 text-[10px] text-muted-foreground">
              {ingredients.length}/{MAX_INGREDIENTS} · separate with commas
            </p>
          </div>

          {/* Tags */}
          <TagGroup
            label="Dietary"
            hint="Labels diners filter by"
            options={DIETARY_TAGS as readonly string[]}
            selected={tags}
            onToggle={(v) => toggleTag(tags, setTags, v)}
          />
          <TagGroup
            label="Features"
            hint="Chef's special, house-made, shareable…"
            options={FEATURE_TAGS as readonly string[]}
            selected={tags}
            onToggle={(v) => toggleTag(tags, setTags, v)}
          />
          <TagGroup
            label="Allergens"
            hint="Tell diners what's inside — especially the EU Big-14"
            options={ALLERGENS as readonly string[]}
            selected={allergens}
            onToggle={(v) => toggleTag(allergens, setAllergens, v)}
            warn
          />

          {/* Flags */}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setPopular(!popular)}
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                popular
                  ? "border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-400"
                  : "border-border bg-card text-muted-foreground hover:text-foreground",
              )}
            >
              <Star className={cn("size-3.5", popular && "fill-amber-400 text-amber-400")} /> Popular
            </button>
            {item && (
              <button
                type="button"
                onClick={() => setAvailable(!available)}
                className={cn(
                  "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                  available
                    ? "border-emerald-600/30 bg-emerald-600/10 text-emerald-700 dark:text-emerald-400"
                    : "border-border bg-card text-muted-foreground hover:text-foreground",
                )}
              >
                {available ? "Available to diners" : "Hidden from diners"}
              </button>
            )}
          </div>

          {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
        </div>

        <div className="mt-5 flex gap-3">
          <Button variant="outline" className="flex-1" onClick={onClose} disabled={saving || uploading}>
            Cancel
          </Button>
          <Button className="flex-1" onClick={handleSave} disabled={saving || uploading}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : item ? "Save changes" : "Add item"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Chip group for tags / allergens
// ---------------------------------------------------------------------------

function TagGroup({
  label,
  hint,
  options,
  selected,
  onToggle,
  warn,
}: {
  label: string;
  hint: string;
  options: readonly string[];
  selected: string[];
  onToggle: (value: string) => void;
  warn?: boolean;
}) {
  return (
    <div>
      <p className="text-sm font-medium">{label}</p>
      <p className="mb-1.5 text-[11px] text-muted-foreground">{hint}</p>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const on = selected.includes(o);
          return (
            <button
              key={o}
              type="button"
              onClick={() => onToggle(o)}
              className={cn(
                "rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
                on
                  ? warn
                    ? "border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-400"
                    : "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:text-foreground",
              )}
            >
              {o}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default OwnerMenuTab;
