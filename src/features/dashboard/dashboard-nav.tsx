"use client";

import { Building2, Calendar, LayoutDashboard, Menu, MessageCircle, Package, Palette, Plug, Receipt, Settings, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { cn } from "@/features/ui-kit/cn";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/features/ui-kit/dropdown-menu";
import { Sheet, SheetContent } from "@/features/ui-kit/sheet";
import { ThemeToggle } from "@/features/ui-kit/theme-toggle";

type DashboardRole = "OWNER" | "ADMIN" | "STAFF";
type NavigationItem = { href: string; label: string; group: "work" | "settings"; icon: typeof LayoutDashboard; mobile: "primary" | "more"; adminOnly?: boolean };

const allItems: NavigationItem[] = [
  { href: "/dashboard", label: "Обзор", group: "work", icon: LayoutDashboard, mobile: "primary" },
  { href: "/dashboard/bookings", label: "Записи", group: "work", icon: Calendar, mobile: "primary" },
  { href: "/dashboard/payments/review", label: "Проверка чеков", group: "work", icon: Receipt, mobile: "more", adminOnly: true },
  { href: "/dashboard/settings/branches", label: "Филиалы", group: "settings", icon: Building2, mobile: "more" },
  { href: "/dashboard/settings/services", label: "Услуги", group: "settings", icon: Package, mobile: "more" },
  { href: "/dashboard/settings/staff", label: "Команда", group: "settings", icon: Users, mobile: "more" },
  { href: "/dashboard/settings/resources", label: "Ресурсы", group: "settings", icon: Package, mobile: "more" },
  { href: "/dashboard/settings/schedule", label: "Расписание", group: "settings", icon: Calendar, mobile: "more" },
  { href: "/dashboard/settings/integrations", label: "Интеграции", group: "settings", icon: Plug, mobile: "more" },
  { href: "/dashboard/settings/whatsapp", label: "WhatsApp", group: "settings", icon: MessageCircle, mobile: "more" },
  { href: "/dashboard/settings/branding", label: "Брендинг", group: "settings", icon: Palette, mobile: "more" },
];

export function dashboardNavigationForRole(role: DashboardRole): NavigationItem[] {
  return role === "STAFF" ? allItems.filter((item) => item.group === "work" && !item.adminOnly) : allItems;
}

export function isDashboardRouteActive(href: string, pathname: string): boolean {
  return href === "/dashboard" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

function NavLinks({ items, pathname, onNavigate }: { items: NavigationItem[]; pathname: string; onNavigate?: () => void }) {
  return (
    <nav className="flex flex-col gap-1">
      {items.map((item) => {
        const active = isDashboardRouteActive(item.href, pathname);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary hover:text-foreground",
            )}
          >
            <Icon className="size-4" aria-hidden />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function BusinessSwitcher({
  businessName,
  availableBusinesses,
  switchBusinessAction,
}: {
  businessName: string;
  availableBusinesses: Array<{ businessId: string; businessName: string }>;
  switchBusinessAction: (formData: FormData) => Promise<void>;
}) {
  if (availableBusinesses.length === 0) {
    return (
      <div className="flex flex-col">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">ManClient</span>
        <strong className="truncate text-base text-foreground">{businessName}</strong>
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex w-full flex-col items-start rounded-md px-1 py-1 text-left hover:bg-secondary">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">ManClient</span>
        <strong className="truncate text-base text-foreground">{businessName}</strong>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        {availableBusinesses.map((item) => (
          <form key={item.businessId} action={switchBusinessAction}>
            <input type="hidden" name="businessId" value={item.businessId} />
            <DropdownMenuItem asChild>
              <button type="submit" className="w-full text-left">
                {item.businessName}
              </button>
            </DropdownMenuItem>
          </form>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function DashboardNav({
  role,
  businessName,
  displayName,
  roleLabel,
  availableBusinesses,
  signOutAction,
  switchBusinessAction,
}: {
  role: DashboardRole;
  businessName: string;
  displayName: string;
  roleLabel: string;
  availableBusinesses: Array<{ businessId: string; businessName: string }>;
  signOutAction: () => Promise<void>;
  switchBusinessAction: (formData: FormData) => Promise<void>;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const items = dashboardNavigationForRole(role);
  const primary = items.filter((item) => item.mobile === "primary");
  const work = items.filter((item) => item.group === "work");
  const settings = items.filter((item) => item.group === "settings");

  return (
    <>
      <aside className="hidden w-64 shrink-0 flex-col gap-6 border-r border-border bg-card p-5 md:flex">
        <BusinessSwitcher businessName={businessName} availableBusinesses={availableBusinesses} switchBusinessAction={switchBusinessAction} />
        <div className="flex flex-1 flex-col gap-6 overflow-y-auto">
          <NavLinks items={work} pathname={pathname} />
          {settings.length ? (
            <div className="flex flex-col gap-1">
              <p className="px-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">Настройки</p>
              <NavLinks items={settings} pathname={pathname} />
            </div>
          ) : null}
        </div>
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
        <div className="flex flex-col">
          <strong className="text-foreground">{businessName}</strong>
          <small className="text-xs text-muted-foreground">
            {displayName} · {roleLabel}
          </small>
        </div>
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

      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-3 border-t border-border bg-card md:hidden" aria-label="Основные разделы">
        {primary.map((item) => {
          const active = isDashboardRouteActive(item.href, pathname);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn("flex flex-col items-center gap-1 py-2 text-xs font-medium", active ? "text-primary" : "text-muted-foreground")}
            >
              <Icon className="size-5" aria-hidden />
              {item.label}
            </Link>
          );
        })}
        <button type="button" onClick={() => setOpen(true)} className="flex flex-col items-center gap-1 py-2 text-xs font-medium text-muted-foreground">
          <Settings className="size-5" aria-hidden />
          Ещё
        </button>
      </nav>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="flex max-w-72 flex-col gap-6">
          <BusinessSwitcher businessName={businessName} availableBusinesses={availableBusinesses} switchBusinessAction={switchBusinessAction} />
          <div className="flex flex-1 flex-col gap-6 overflow-y-auto">
            <NavLinks items={work} pathname={pathname} onNavigate={() => setOpen(false)} />
            {settings.length ? (
              <div className="flex flex-col gap-1">
                <p className="px-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">Настройки</p>
                <NavLinks items={settings} pathname={pathname} onNavigate={() => setOpen(false)} />
              </div>
            ) : null}
          </div>
          <form action={signOutAction} className="border-t border-border pt-4">
            <button type="submit" className="text-sm font-medium text-muted-foreground hover:text-foreground">
              Выйти из кабинета
            </button>
          </form>
        </SheetContent>
      </Sheet>
    </>
  );
}
