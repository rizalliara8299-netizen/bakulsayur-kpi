import Link from "next/link";
import { bootstrapSuperadmin } from "@/app/actions/auth";
import { Flash, PageHeader, formatNumber } from "@/components/page-ui";
import { requireUser } from "@/lib/auth";

type DashboardSnapshot = {
  summary: {
    activeEmployees: number;
    attendanceToday: number;
    orders: number;
    pendingErrors: number;
    packagingErrors: number;
    deliveryErrors: number;
    shoppingErrors: number;
    totalPoints: number;
    totalProducts: number;
  };
  kpis: Array<{ id: string; code: string; name: string; totalPoints: number; totalQuantity: number; leaderName?: string | null; leaderPoints: number }>;
  ranking: Array<{ employeeId: string; name: string; totalPoints: number; totalProducts: number }>;
};

function makassarPeriod() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Makassar", year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(new Date())
    .reduce<Record<string, string>>((acc, part) => { acc[part.type] = part.value; return acc; }, {});
  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);
  const endDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const mm = String(month).padStart(2, "0");
  return {
    today: `${year}-${mm}-${String(day).padStart(2, "0")}`,
    start: `${year}-${mm}-01`,
    end: `${year}-${mm}-${String(endDay).padStart(2, "0")}`,
  };
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ setup?: string; setupError?: string }> }) {
  const params = await searchParams;
  const { supabase, profile } = await requireUser();
  const period = makassarPeriod();
  const { data, error } = await supabase.rpc("get_dashboard_snapshot", {
    p_start: period.start,
    p_end: period.end,
    p_today: period.today,
  });

  const snapshot = (data || null) as DashboardSnapshot | null;
  const summary = snapshot?.summary || {
    activeEmployees: 0, attendanceToday: 0, orders: 0, pendingErrors: 0,
    packagingErrors: 0, deliveryErrors: 0, shoppingErrors: 0, totalPoints: 0, totalProducts: 0,
  };
  const kpis = snapshot?.kpis || [];
  const ranking = snapshot?.ranking || [];

  return <>
    <div className="dashboard-section-head">
      <PageHeader title="Dashboard Operasional Bulan Ini" description="Klik setiap kartu untuk melihat rincian nama dan aktivitasnya." />
      <div className="dashboard-actions">
        <Link href="/dashboard" prefetch={false} className="btn btn-soft">↻ Refresh</Link>
        <Link href="/production" className="btn btn-primary">+ Input Hari Ini</Link>
      </div>
    </div>
    <Flash saved={params.setup} error={params.setupError || (error ? "Dashboard belum dapat dimuat." : undefined)} />
    {profile?.role === "viewer" ? <section className="card panel panel-first"><h2>Aktivasi administrator pertama</h2><p className="muted">Akun pertama dapat menjadi Superadmin. Setelah satu Superadmin tersedia, bootstrap otomatis terkunci.</p><form action={bootstrapSuperadmin}><button className="btn btn-primary">Aktifkan Superadmin Pertama</button></form></section> : null}

    <section className="legacy-summary-grid">
      <Link href="/ranking" className="metric-card featured"><div className="metric-icon">▦</div><span>Produk Dipacking</span><strong>{formatNumber(summary.totalProducts)}</strong><small>Klik untuk ranking packaging</small></Link>
      <Link href="/errors" className="metric-card"><div className="metric-icon">□</div><span>Kesalahan Packaging</span><strong>{formatNumber(summary.packagingErrors)}</strong><small>Lihat customer & pelaksana</small></Link>
      <Link href="/errors" className="metric-card"><div className="metric-icon">□</div><span>Kesalahan Belanja</span><strong>{formatNumber(summary.shoppingErrors)}</strong><small>Lihat rincian kesalahan</small></Link>
      <Link href="/errors" className="metric-card"><div className="metric-icon">→</div><span>Kesalahan Pengantaran</span><strong>{formatNumber(summary.deliveryErrors)}</strong><small>Lihat customer & PJ</small></Link>
      <Link href="/orders" className="metric-card"><div className="metric-icon">◎</div><span>Total Pesanan</span><strong>{formatNumber(summary.orders)}</strong><small>Klik untuk daftar customer</small></Link>
    </section>

    <section className="card kpi-board">
      <div className="kpi-board-head"><div><h2>Capaian & Peringkat Per KPI</h2><p>Seluruh pekerjaan produksi ditampilkan terpisah. Klik KPI untuk melihat siapa yang paling unggul.</p></div><Link href="/reports" className="btn btn-soft">Buka Laporan KPI →</Link></div>
      <div className="kpi-card-grid">
        {kpis.map((kpi) => <Link href="/reports" key={kpi.id} className="kpi-card">
          <div className="metric-icon">★</div>
          <span>{kpi.name}</span>
          <strong>{formatNumber(kpi.totalPoints)} <em>poin</em></strong>
          <small>Unggul: {kpi.leaderName || "Belum ada capaian"}{kpi.leaderName ? ` · ${formatNumber(kpi.leaderPoints)} poin` : ""}</small>
          <p>Total {formatNumber(kpi.totalQuantity)}</p>
        </Link>)}
      </div>
    </section>

    <section className="card panel leaderboard-panel"><div className="panel-title-row"><div><h2>Leaderboard Produksi Bulan Ini</h2><p className="muted">Ranking dihitung langsung di database, bukan di browser.</p></div><div className="mini-stat"><span>Total poin</span><b>{formatNumber(summary.totalPoints)}</b></div></div><div className="table-wrap"><table><thead><tr><th>#</th><th>Nama</th><th>Total Poin</th><th>Produk</th></tr></thead><tbody>{ranking.length ? ranking.map((row, i) => <tr key={row.employeeId}><td><span className={`rank-badge ${i === 0 ? "first" : ""}`}>{i + 1}</span></td><td><strong>{row.name}</strong></td><td>{formatNumber(row.totalPoints)}</td><td>{formatNumber(row.totalProducts)}</td></tr>) : <tr><td colSpan={4} className="muted">Belum ada transaksi produksi bulan ini.</td></tr>}</tbody></table></div></section>
  </>;
}
