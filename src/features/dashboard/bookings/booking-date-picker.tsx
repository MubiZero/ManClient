"use client";

import { CalendarDays } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/features/ui-kit/button";
import { Calendar } from "@/features/ui-kit/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/features/ui-kit/popover";

export function BookingDatePicker({ date, buildHref }: { date: string; buildHref: (date: string) => string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const selected = new Date(`${date}T00:00:00`);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="secondary" size="sm">
          <CalendarDays className="size-4" />
          {selected.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="p-0">
        <Calendar
          mode="single"
          selected={selected}
          onSelect={(value) => {
            if (!value) return;
            setOpen(false);
            const isoDate = `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
            router.push(buildHref(isoDate));
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
