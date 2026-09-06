import Link from "next/link";
import { createProduction } from "@/app/actions/core";
import { EmptyRow, Flash, PageHeader, formatNumber } from "@/components/page-ui";
import { canWrite, requireUser } from "@/lib/auth";

function todayMakassar() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Makassar", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

export default async function ProductionPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const params = await searchParams;
  const { supabase, profile } = await requireUser();
  const today = todayMakassar();
  const [{ data: employees }, { data: kpis }, { data: rows }] = await Promise.all([
    supabase.from("employees").select("id,name,teams!inner(name)").eq("status","active").eq("teams.name","Produksi").order("name"),
    supabase.from("kpis").select("id,kpi_code,name").eq("is_active",true).order("kpi_code"),
    supabase.from("production_entries").select("id,work_date,quantity,total_points,unit_snapshot,employees(name),kpis(name)").order("work_date",{ascending:false}).order("created_at",{ascending:false}).limit(40),
  ]);

  return <>
    <div className="daily-title-row">
      <PageHeader title="Input Pekerjaan Harian" description="Catat pekerjaan produksi berbasis poin dan tugas inventory berbasis checklist." />
      <div className="daily-tabs"><Link href="/production" className="daily-tab active">Tim Produksi</Link><Link href="/inventory" className="daily-tab">Inventory</Link></div>
    </div>
    <Flash saved={params.saved} error={params.error} />
    <div className="two-col daily-workspace">
      {canWrite(profile?.role) ? <section className="card daily-panel"><div className="daily-panel-head"><h2>Tambah Pekerjaan Produksi</h2><p>Poin dihitung otomatis dari jumlah × nilai KPI.</p></div><div className="daily-panel-body">
        <div className="info-note">Semua KPI produksi—termasuk cuci alat packing, mengepel, menyapu, dan pekerjaan kebersihan lainnya—dicatat melalui form ini dan langsung mendapat poin. Packaging yang sudah dicatat melalui menu Pesanan & PJ tidak perlu diinput ulang agar poin tidak ganda.</div>
        <form action={createProduction} className="form-grid">
          <label className="field"><span>Tanggal</span><input name="workDate" type="date" defaultValue={today} required /></label>
          <label className="field"><span>Petugas</span><select name="employeeId" required><option value="">Pilih petugas</option>{(employees||[]).map(e=><option key={e.id} value={e.id}>{e.name}</option>)}</select></label>
          <label className="field"><span>Jenis Pekerjaan</span><select name="kpiId" required><option value="">Pilih pekerjaan</option>{(kpis||[]).map(k=><option key={k.id} value={k.id}>{k.name}</option>)}</select></label>
          <label className="field"><span>Jumlah</span><input name="quantity" type="number" min="0.01" step="0.01" required /></label>
          <label className="field full"><span>Keterangan</span><textarea name="notes" placeholder="Catatan tambahan bila diperlukan" /></label>
          <div className="form-actions full"><button className="btn btn-primary">+ Simpan Pekerjaan</button></div>
        </form>
      </div></section> : null}
      <section className="card daily-panel"><div className="daily-panel-head"><h2>Riwayat Produksi</h2><p>40 aktivitas terbaru dimuat lebih dulu agar aplikasi tetap ringan.</p></div><div className="table-wrap"><table><thead><tr><th>Tanggal</th><th>Nama</th><th>Pekerjaan</th><th>Jumlah</th><th>Poin</th></tr></thead><tbody>{(rows||[]).length ? (rows||[]).map(r=>{const e=Array.isArray(r.employees)?r.employees[0]:r.employees;const k=Array.isArray(r.kpis)?r.kpis[0]:r.kpis;return <tr key={r.id}><td>{r.work_date}</td><td><strong>{e?.name||"-"}</strong></td><td>{k?.name||"-"}</td><td>{formatNumber(r.quantity)} <span className="muted small">{r.unit_snapshot}</span></td><td><strong>{formatNumber(r.total_points)}</strong></td></tr>}) : <EmptyRow colSpan={5} />}</tbody></table></div><div className="table-foot-note">Buka Laporan untuk riwayat lengkap dan filter periode.</div></section>
    </div>
  </>;
}
