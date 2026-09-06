import { bootstrapSuperadmin } from "@/app/actions/auth";
import { Flash, PageHeader, formatNumber } from "@/components/page-ui";
import { requireUser } from "@/lib/auth";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ setup?: string; setupError?: string }> }) {
  const params = await searchParams;
  const { supabase, profile } = await requireUser();
  const [employeesRes, ordersRes, productionRes, errorsRes, attendanceRes, rankingRes] = await Promise.all([
    supabase.from("employees").select("id", { count: "exact", head: true }).eq("status", "active"),
    supabase.from("orders").select("id", { count: "exact", head: true }),
    supabase.from("production_entries").select("total_points,quantity,kpis(name)"),
    supabase.from("error_cases").select("id", { count: "exact", head: true }).eq("evaluation_status", "Menunggu evaluasi"),
    supabase.from("attendance_entries").select("id", { count: "exact", head: true }).eq("work_date", new Date().toISOString().slice(0,10)),
    supabase.from("v_production_ranking").select("employee_id,name,total_points,total_products").order("total_points", { ascending: false }).limit(5),
  ]);
  const production = productionRes.data || [];
  const totalPoints = production.reduce((sum, row) => sum + Number(row.total_points || 0), 0);
  const totalProducts = production.reduce((sum, row) => {
    const kpi = Array.isArray(row.kpis) ? row.kpis[0] : row.kpis;
    return String(kpi?.name || "").toLowerCase() === "packaging" ? sum + Number(row.quantity || 0) : sum;
  }, 0);

  return <>
    <PageHeader title={`Welcome back, ${profile?.display_name || "Admin"}!`} description="Pantau produktivitas, kedisiplinan, pesanan, dan evaluasi tim Bakul Sayur." />
    <Flash saved={params.setup} error={params.setupError} />
    {profile?.role === "viewer" ? <section className="card panel panel-first"><h2>Aktivasi administrator pertama</h2><p className="muted">Akun pertama dapat menjadi Superadmin. Setelah satu Superadmin tersedia, bootstrap otomatis terkunci.</p><form action={bootstrapSuperadmin}><button className="btn btn-primary">Aktifkan Superadmin Pertama</button></form></section> : null}
    <section className="stats">
      <div className="card stat"><div className="stat-label">KARYAWAN AKTIF</div><div className="stat-value">{formatNumber(employeesRes.count)}</div><div className="muted">Seluruh tim</div></div>
      <div className="card stat"><div className="stat-label">HADIR HARI INI</div><div className="stat-value">{formatNumber(attendanceRes.count)}</div><div className="muted">Input kehadiran</div></div>
      <div className="card stat"><div className="stat-label">TOTAL PRODUK</div><div className="stat-value">{formatNumber(totalProducts)}</div><div className="muted">Packaging</div></div>
      <div className="card stat"><div className="stat-label">TOTAL POIN</div><div className="stat-value">{formatNumber(totalPoints)}</div><div className="muted">Produksi</div></div>
      <div className="card stat"><div className="stat-label">PESANAN</div><div className="stat-value">{formatNumber(ordersRes.count)}</div><div className="muted">Semua status</div></div>
      <div className="card stat"><div className="stat-label">PERLU EVALUASI</div><div className="stat-value">{formatNumber(errorsRes.count)}</div><div className="muted">Kesalahan pending</div></div>
    </section>
    <section className="card panel"><h2>Leaderboard Produksi</h2><div className="table-wrap"><table><thead><tr><th>#</th><th>Nama</th><th>Total Poin</th><th>Produk</th></tr></thead><tbody>{(rankingRes.data || []).length ? (rankingRes.data || []).map((row,i)=><tr key={row.employee_id}><td>{i+1}</td><td><strong>{row.name}</strong></td><td>{formatNumber(row.total_points)}</td><td>{formatNumber(row.total_products)}</td></tr>) : <tr><td colSpan={4} className="muted">Belum ada transaksi produksi.</td></tr>}</tbody></table></div></section>
  </>;
}
