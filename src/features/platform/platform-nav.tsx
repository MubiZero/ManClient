"use client";

import { Building2, CreditCard, LayoutDashboard, Menu, Plug, ScrollText } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { cn } from "@/features/ui-kit/cn";
import { Sheet, SheetContent } from "@/features/ui-kit/sheet";
import { ThemeToggle } from "@/features/ui-kit/theme-toggle";

const items = [
  { href: "/platform", label: "Обзор", icon: LayoutDashboard },
  { href: "/platform/businesses", label: "Бизнесы", icon: Building2 },
  { href: "/platform/payments", label: "Оплаты", icon: CreditCard },
  { href: "/platform/integrations", label: "Интеграции", icon: Plug },
  { href: "/platform/audit", label: "Журнал", icon: ScrollText },
];

function isActive(href: string, pathname: string) {
  return href === "/platform" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

function NavLinks({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <nav className="flex flex-1 flex-col gap-1">
      {items.map(({ href, label, icon: Icon }) => {
        const active = isActive(href, pathname);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary hover:text-foreground",
            )}
          >
            <Icon className="size-4" aria-hidden />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

export function PlatformNav({ signOutAction }: { signOutAction: () => Promise<void> }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <>
      <aside className="hidden w-64 shrink-0 flex-col gap-6 border-r border-border bg-card p-5 md:flex">
        <div className="flex flex-col">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">ManClient</span>
          <strong className="text-lg text-foreground">Платформа</strong>
        </div>
        <NavLinks pathname={pathname} />
        <div className="flex items-center justify-between border-t border-border pt-4">
          <ThemeToggle />
          <form action={signOutAction}>
            <button type="submit" className="text-sm font-medium text-muted-foreground hover:text-foreground">
              Выйти
            </button>
          </form>
        </div>
      </aside>

      <header className="flex items-center justify-between border-b border-border bg-card px-4 py-3 md:hidden">
        <strong className="text-foreground">ManClient · Платформа</strong>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Открыть меню"
            className="inline-flex size-9 items-center justify-center rounded-md border border-border text-foreground"
          >
            <Menu className="size-4" />
          </button>
        </div>
      </header>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="flex max-w-72 flex-col gap-6">
          <strong className="text-lg text-foreground">Платформа</strong>
          <NavLinks pathname={pathname} onNavigate={() => setOpen(false)} />
          <form action={signOutAction} className="border-t border-border pt-4">
            <button type="submit" className="text-sm font-medium text-muted-foreground hover:text-foreground">
              Выйти
            </button>
          </form>
        </SheetContent>
      </Sheet>
    </>
  );
}
