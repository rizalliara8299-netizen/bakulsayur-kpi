import Link from "next/link";
import { redirect } from "next/navigation";
import { bootstrapSuperadmin, logout } from "@/app/actions/auth";
import { createClient } from "@/lib/supabase/server";

function fmt(value: number | null | undefined) {
  return new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(Number(value || 0));
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ setup?: string; setupError?: string }> }) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("display_name,role,organization_id").eq("id", authData.user.id).single();
  const [employeesRes, ordersRes, productionRes, errorsRes, rankingRes] = await Promise.all([
    supabase.from("employees").select("id", { count: "exact", head: true }),
    supabase.from("orders").select("id", { count: "exact", head: true }),
    supabase.from("production_entries").select("total_points,quantity,kpis(name)"),
    supabase.from("error_cases").select("id", { count: "exact", head: true }).eq("evaluation_status", "Menunggu evaluasi"),
    supabase.from("v_production_ranking").select("employee_id,name,total_points,total_products").order("total_points", { ascending: false }).limit(5),
  ]);

  const production = productionRes.data || [];
  const totalPoints = production.reduce((sum, row) => sum + Number(row.total_points || 0), 0);
  const totalProducts = production.reduce((sum, row) => {
    const kpi = Array.isArray(row.kpis) ? row.kpis[0] : row.kpis;
    return String(kpi?.name || "").toLowerCase() === "packaging" ? sum + Number(row.quantity || 0) : sum;
  }, 0);

  const nav = ["Dashboard","Input Harian","Pesanan & PJ","Kehadiran","Kesalahan","Peringkat & Profil","Laporan","Karyawan","Pengaturan"];

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark">BS</div><div><strong>Bakul Sayur</strong><div style={{ color: "#8d8d8d", fontSize: 11 }}>KPI Employee System</div></div></div>
        <nav>{nav.map((item, index) => <Link key={item} href={index === 0 ? "/dashboard" : "#"} className={`nav-item ${index === 0 ? "active" : ""}`}>{item}</Link>)}</nav>
      </aside>
      <main className="main">
        <header className="hero">
          <div style={{ display: "flex", justifyContent: "space-between", gap: 20, alignItems: "flex-start" }}>
            <div><h1>Welcome back, {profile?.display_name || "Admin"}!</h1><p>Pantau produktivitas, kedisiplinan, pesanan, dan evaluasi tim dalam satu tempat.</p></div>
            <form action={logout}><button type="submit" style={{ border: "1px solid rgba(255,255,255,.35)", borderRadius: 999, padding: "10px 16px", background: "rgba(255,255,255,.12)", color: "white", cursor: "pointer" }}>Keluar</button></form>
          </div>
        </header>
        <div className="content">
          {profile?.role === "viewer" ? (
            <section className="card panel" style={{ marginTop: 0 }}>
              <h2>Aktivasi administrator pertama</h2>
              <p className="muted">Jika ini akun pertama aplikasi, aktifkan sebagai Superadmin. Fungsi ini otomatis terkunci setelah satu Superadmin tersedia.</p>
              {params.setupError ? <div className="error">{params.setupError}</div> : null}
              <form action={bootstrapSuperadmin}><button className="primary" style={{ width: "auto", padding: "0 18px" }}>Aktifkan Superadmin Pertama</button></form>
            </section>
          ) : null}

          <section className="stats">
            <div className="card stat"><div className="stat-label">KARYAWAN AKTIF</div><div className="stat-value">{fmt(employeesRes.count)}</div><div className="muted">Seluruh tim</div></div>
            <div className="card stat"><div className="stat-label">TOTAL PRODUK</div><div className="stat-value">{fmt(totalProducts)}</div><div className="muted">Packaging tercatat</div></div>
            <div className="card stat"><div className="stat-label">TOTAL POIN</div><div className="stat-value">{fmt(totalPoints)}</div><div className="muted">Akumulasi produksi</div></div>
            <div className="card stat"><div className="stat-label">PESANAN</div><div className="stat-value">{fmt(ordersRes.count)}</div><div className="muted">Semua status</div></div>
          </section>

          <section className="card panel">
            <h2>Leaderboard Produksi</h2>
            <div className="table-wrap"><table><thead><tr><th>Peringkat</th><th>Nama</th><th>Total Poin</th><th>Produk</th></tr></thead><tbody>
              {(rankingRes.data || []).length ? (rankingRes.data || []).map((row, i) => <tr key={row.employee_id}><td>#{i + 1}</td><td><strong>{row.name}</strong></td><td>{fmt(row.total_points)}</td><td>{fmt(row.total_products)}</td></tr>) : <tr><td colSpan={4} className="muted">Belum ada transaksi produksi.</td></tr>}
            </tbody></table></div>
          </section>

          <section className="card panel">
            <h2>Status Sistem</h2>
            <p className="muted">Role aktif: <strong>{profile?.role || "viewer"}</strong> · Komplain menunggu evaluasi: <strong>{fmt(errorsRes.count)}</strong></p>
            <p className="muted">Fondasi database, RLS, versioning KPI, attendance policy, order allocation atomik, dan audit trail sudah aktif.</p>
          </section>
        </div>
      </main>
    </div>
  );
}
