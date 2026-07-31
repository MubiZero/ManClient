"use client";

import { DayPicker, type DayPickerProps } from "react-day-picker";
import "react-day-picker/style.css";

import { cn } from "@/features/ui-kit/cn";

export function Calendar({ className, classNames, ...props }: DayPickerProps) {
  return (
    <DayPicker
      className={cn("rounded-lg border border-border bg-card p-3", className)}
      classNames={{
        month_caption: "flex items-center justify-center text-sm font-medium text-foreground mb-2",
        nav: "flex items-center gap-1",
        button_previous: "size-7 rounded-md text-muted-foreground hover:bg-secondary flex items-center justify-center",
        button_next: "size-7 rounded-md text-muted-foreground hover:bg-secondary flex items-center justify-center",
        weekday: "text-xs font-medium text-muted-foreground",
        day: "text-sm text-foreground rounded-md hover:bg-secondary",
        selected: "!bg-primary !text-primary-foreground",
        today: "font-semibold text-primary",
        outside: "text-muted-foreground/40",
        disabled: "text-muted-foreground/30",
        ...classNames,
      }}
      {...props}
    />
  );
}
