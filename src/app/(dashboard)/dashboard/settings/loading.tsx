export default function SettingsLoading() {
  return <section className="dashboard-content route-loading" role="status" aria-label="Загружаем настройки">
    <span className="sr-only">Загружаем настройки</span>
    <div className="skeleton skeleton-kicker" />
    <div className="skeleton skeleton-title" />
    <div className="skeleton skeleton-action" />
    <div className="skeleton-list"><div className="skeleton skeleton-row" /><div className="skeleton skeleton-row" /><div className="skeleton skeleton-row" /></div>
  </section>;
}
