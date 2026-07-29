import Link from "next/link";

type Option = { id: string; name: string };

export function BookingFilters({ date, view, search, status, branchId, staffId, branches, staff }: { date: string; view: string; search: string; status?: string; branchId?: string; staffId?: string; branches: Option[]; staff: Array<{ id: string; displayName: string }> }) {
  return <div className="booking-toolbar">
    <div className="booking-view-switch"><Link className={view === "day" ? "is-active" : ""} href={`/dashboard/bookings?view=day&date=${date}`}>День</Link><Link className={view === "list" ? "is-active" : ""} href="/dashboard/bookings?view=list">Список</Link></div>
    <form className="booking-filters" method="get">
      <input type="hidden" name="view" value={view} />
      {view === "day" ? <label className="ui-field"><span className="ui-field-label">Дата</span><input className="ui-input" type="date" name="date" defaultValue={date} /></label> : null}
      <label className="ui-field booking-search"><span className="ui-field-label">Поиск</span><input className="ui-input" name="search" defaultValue={search} placeholder="Имя, телефон или услуга" /></label>
      <label className="ui-field"><span className="ui-field-label">Статус</span><select className="ui-input" name="status" defaultValue={status ?? ""}><option value="">Все</option><option value="CONFIRMED">Подтверждённые</option><option value="PENDING_PAYMENT">Ждут оплаты</option><option value="CANCELLED">Отменённые</option><option value="EXPIRED">Истёкшие</option></select></label>
      <label className="ui-field"><span className="ui-field-label">Филиал</span><select className="ui-input" name="branchId" defaultValue={branchId ?? ""}><option value="">Все</option>{branches.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label className="ui-field"><span className="ui-field-label">Специалист</span><select className="ui-input" name="staffId" defaultValue={staffId ?? ""}><option value="">Все</option>{staff.map((item) => <option key={item.id} value={item.id}>{item.displayName}</option>)}</select></label>
      <button className="ui-button ui-button-secondary" type="submit">Показать</button>
      <Link className="ui-button ui-button-quiet" href="/dashboard/bookings">Сбросить</Link>
    </form>
  </div>;
}
