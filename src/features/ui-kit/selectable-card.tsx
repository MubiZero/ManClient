import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes, ReactNode } from "react";

import { cn } from "@/features/ui-kit/cn";

const selectableCardVariants = cva(
  "flex w-full items-center gap-3 rounded-lg border border-border bg-card text-left text-sm text-foreground shadow-sm transition-colors hover:border-primary/50 hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-[pressed=true]:border-primary aria-[pressed=true]:bg-brand-50 aria-[pressed=true]:ring-1 aria-[pressed=true]:ring-primary dark:aria-[pressed=true]:bg-brand-950/40",
  {
    variants: {
      size: {
        md: "px-4 py-3",
        sm: "px-3 py-2",
      },
    },
    defaultVariants: { size: "md" },
  },
);

export function SelectableCard({
  className,
  size,
  icon,
  title,
  subtitle,
  selected,
  ...props
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type"> &
  VariantProps<typeof selectableCardVariants> & {
    icon?: ReactNode;
    title: ReactNode;
    subtitle?: ReactNode;
    selected?: boolean;
  }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cn(selectableCardVariants({ size }), className)}
      {...props}
    >
      {icon}
      <span className="flex flex-1 flex-col gap-0.5">
        <span className="font-medium">{title}</span>
        {subtitle ? <span className="text-xs text-muted-foreground">{subtitle}</span> : null}
      </span>
    </button>
  );
}
