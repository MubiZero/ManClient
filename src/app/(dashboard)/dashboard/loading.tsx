export default function DashboardLoading() {
  return <section className="dashboard-content route-loading" role="status" aria-label="Загружаем кабинет">
    <span className="sr-only">Загружаем кабинет</span>
    <div className="skeleton skeleton-kicker" />
    <div className="skeleton skeleton-title" />
    <div className="skeleton-grid"><div className="skeleton skeleton-card" /><div className="skeleton skeleton-card" /></div>
  </section>;
}
