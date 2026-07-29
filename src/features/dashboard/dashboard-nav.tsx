"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

type DashboardRole = "OWNER" | "ADMIN" | "STAFF";
type NavigationItem = { href: string; label: string; group: "work" | "settings"; mobile: "primary" | "more"; adminOnly?: boolean };

const allItems: NavigationItem[] = [
  { href: "/dashboard", label: "Обзор", group: "work", mobile: "primary" },
  { href: "/dashboard/bookings", label: "Записи", group: "work", mobile: "primary" },
  { href: "/dashboard/payments/review", label: "Проверка чеков", group: "work", mobile: "more", adminOnly: true },
  { href: "/dashboard/settings/branches", label: "Филиалы", group: "settings", mobile: "more" },
  { href: "/dashboard/settings/services", label: "Услуги", group: "settings", mobile: "more" },
  { href: "/dashboard/settings/staff", label: "Команда", group: "settings", mobile: "more" },
  { href: "/dashboard/settings/resources", label: "Ресурсы", group: "settings", mobile: "more" },
  { href: "/dashboard/settings/schedule", label: "Расписание", group: "settings", mobile: "more" },
  { href: "/dashboard/settings/integrations", label: "Интеграции", group: "settings", mobile: "more" },
];

export function dashboardNavigationForRole(role: DashboardRole): NavigationItem[] {
  return role === "STAFF" ? allItems.filter(item => item.group === "work" && !item.adminOnly) : allItems;
}

export function isDashboardRouteActive(href: string, pathname: string): boolean {
  return href === "/dashboard" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

export function DashboardNav({
  role,
  businessName,
  displayName,
  roleLabel,
  signOutAction,
}: {
  role: DashboardRole;
  businessName: string;
  displayName: string;
  roleLabel: string;
  signOutAction: () => Promise<void>;
}) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const items = dashboardNavigationForRole(role);
  const primary = items.filter(item => item.mobile === "primary");
  const secondary = items.filter(item => item.mobile === "more");
  const settings = items.filter(item => item.group === "settings");

  return (
    <>
      <aside className="dashboard-sidebar">
        <Brand businessName={businessName} />
        <nav aria-label="Кабинет">
          <NavigationLinks items={items.filter(item => item.group === "work")} pathname={pathname} />
          {settings.length ? <><p>Настройки</p><NavigationLinks items={settings} pathname={pathname} /></> : null}
        </nav>
        <form action={signOutAction}><button className="signout-button" type="submit">Выйти</button></form>
      </aside>

      <header className="dashboard-mobile-header">
        <Brand businessName={businessName} compact />
        <div><strong>{displayName}</strong><small>{roleLabel}</small></div>
      </header>

      <nav className="dashboard-mobile-nav" aria-label="Основные разделы">
        {primary.map(item => <NavigationLink key={item.href} item={item} pathname={pathname} />)}
        <button type="button" aria-expanded={menuOpen} aria-controls="dashboard-mobile-menu" onClick={() => setMenuOpen(value => !value)}>
          <span aria-hidden>•••</span><span>Ещё</span>
        </button>
      </nav>

      {menuOpen ? (
        <div className="dashboard-mobile-overlay" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setMenuOpen(false); }}>
          <section className="dashboard-mobile-menu" id="dashboard-mobile-menu" aria-label="Все разделы">
            <div className="dashboard-mobile-menu-heading"><div><strong>{businessName}</strong><small>Управление бизнесом</small></div><button type="button" aria-label="Закрыть меню" onClick={() => setMenuOpen(false)}>×</button></div>
            <nav><NavigationLinks items={secondary} pathname={pathname} onNavigate={() => setMenuOpen(false)} /></nav>
            <form action={signOutAction}><button className="mobile-signout-button" type="submit">Выйти из кабинета</button></form>
          </section>
        </div>
      ) : null}
    </>
  );
}

function NavigationLinks({ items, pathname, onNavigate }: { items: NavigationItem[]; pathname: string; onNavigate?: () => void }) {
  return <>{items.map(item => <NavigationLink key={item.href} item={item} pathname={pathname} onNavigate={onNavigate} />)}</>;
}

function NavigationLink({ item, pathname, onNavigate }: { item: NavigationItem; pathname: string; onNavigate?: () => void }) {
  const active = isDashboardRouteActive(item.href, pathname);
  return <Link href={item.href} aria-current={active ? "page" : undefined} onClick={onNavigate}><span className="dashboard-nav-mark" aria-hidden>{item.label.slice(0, 1)}</span><span>{item.label}</span></Link>;
}

function Brand({ businessName, compact = false }: { businessName: string; compact?: boolean }) {
  return <div className={`dashboard-brand${compact ? " dashboard-brand-compact" : ""}`}><span>MC</span><div><strong>ManClient</strong><small>{businessName}</small></div></div>;
}
