import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/features/ui-kit/cn";

export function StatCard({
  label,
  value,
  icon: Icon,
  trend,
  action,
}: {
  label: string;
  value: string;
  icon?: LucideIcon;
  trend?: { direction: "up" | "down" | "flat"; label: string };
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{label}</span>
        {Icon ? <Icon className="size-4 text-muted-foreground" aria-hidden /> : null}
      </div>
      <strong className="text-3xl font-semibold tabular-nums text-foreground">{value}</strong>
      {trend ? (
        <span
          className={cn(
            "text-xs font-medium",
            trend.direction === "up" && "text-brand-600 dark:text-brand-400",
            trend.direction === "down" && "text-destructive",
            trend.direction === "flat" && "text-muted-foreground",
          )}
        >
          {trend.direction === "up" ? "↑" : trend.direction === "down" ? "↓" : "→"} {trend.label}
        </span>
      ) : null}
      {action}
    </div>
  );
}
