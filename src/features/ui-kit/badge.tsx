import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";

import { cn } from "@/features/ui-kit/cn";

const badgeVariants = cva("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium", {
  variants: {
    variant: {
      neutral: "bg-secondary text-secondary-foreground",
      success: "bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300",
      warning: "bg-warning-50 text-warning-700 dark:bg-warning-500/10 dark:text-warning-500",
      danger: "bg-danger-50 text-danger-700 dark:bg-danger-500/10 dark:text-danger-500",
      info: "bg-info-50 text-info-700 dark:bg-info-500/10 dark:text-info-500",
    },
  },
  defaultVariants: { variant: "neutral" },
});

export function Badge({
  className,
  variant,
  dot,
  ...props
}: HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants> & { dot?: boolean }) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props}>
      {dot ? <span className="size-1.5 rounded-full bg-current" aria-hidden /> : null}
      {props.children}
    </span>
  );
}
