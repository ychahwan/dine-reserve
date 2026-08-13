import { Sofa, Users, Wind } from "lucide-react";

export type Kind = "inside" | "outside" | "bar";

export const KIND_LABEL: Record<Kind, { label: string; icon: typeof Sofa; cls: string }> = {
  inside: { label: "Inside", icon: Sofa, cls: "bg-primary/10 text-primary" },
  outside: { label: "Outside", icon: Wind, cls: "bg-sky-500/10 text-sky-600" },
  bar: { label: "Bar", icon: Users, cls: "bg-amber-500/10 text-amber-600" },
};

export const DAY_ROWS = [
  { dow: 1, label: "Monday" },
  { dow: 2, label: "Tuesday" },
  { dow: 3, label: "Wednesday" },
  { dow: 4, label: "Thursday" },
  { dow: 5, label: "Friday" },
  { dow: 6, label: "Saturday" },
  { dow: 0, label: "Sunday" },
];

/** How many days of slots the owner availability view offers. */
export const DAYS_TO_SHOW = 14;
