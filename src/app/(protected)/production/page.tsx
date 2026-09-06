import { createProduction } from "@/app/actions/core";
import { EmptyRow, Flash, PageHeader, formatNumber } from "@/components/page-ui";
import { canWrite, requireUser } from "@/lib/auth";

export default async function ProductionPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const params = await searchParams;
  const { supabase, profile } = await requireUser();
  const today = new Date().toISOString().slice(0,10);
  const [{ data: employees }, { data: kpis }, { data: orders }, { data: rows }] = await Promise.all([
    supabase.from("employees").select("id,name,teams!inner(name)").eq("status","active").eq("teams.name","Produksi").order("name"),
    supabase.from("kpis").select("id,kpi_code,name").eq("is_active",true).order("kpi_code"),
    supabase.from("orders").select("id,order_number,customer_name_snapshot").neq("status","Dibatalkan").order("order_date",{ascending:false}).limit(50),
    supabase.from("production_entries").select("id,work_date,quantity,total_points,unit_snapshot,employees(name),kpis(name),orders(order_number)").order("work_date",{ascending:false}).order("created_at",{ascending:false}).limit(100),
  ]);
  return <>
    <PageHeader title="Input Produksi" description="Setiap transaksi menyimpan snapshot satuan dan poin sesuai versi KPI pada tanggal kerja." />
    <Flash saved={params.saved} error={params.error} />
    {canWrite(profile?.role) ? <section className="card panel panel-first"><h2>Catat Pekerjaan Produksi</h2><form action={createProduction} className="form-grid">
      <label className="field"><span>Tanggal</span><input name="workDate" type="date" defaultValue={today} required /></label>
      <label className="field"><span>Karyawan</span><select name="employeeId" required><option value="">Pilih petugas</option>{(employees||[]).map(e=><option key={e.id} value={e.id}>{e.name}</option>)}</select></label>
      <label className="field"><span>Jenis KPI</span><select name="kpiId" required><option value="">Pilih pekerjaan</option>{(kpis||[]).map(k=><option key={k.id} value={k.id}>{k.kpi_code} · {k.name}</option>)}</select></label>
      <label className="field"><span>Jumlah</span><input name="quantity" type="number" min="0.01" step="0.01" required /></label>
      <label className="field"><span>Pesanan (opsional)</span><select name="orderId"><option value="">Tanpa pesanan</option>{(orders||[]).map(o=><option key={o.id} value={o.id}>{o.order_number} · {o.customer_name_snapshot}</option>)}</select></label>
      <label className="field"><span>Catatan</span><input name="notes" /></label>
      <div className="form-actions full"><button className="btn btn-primary">Simpan Produksi</button></div>
    </form></section> : null}
    <section className="card panel"><h2>Riwayat Produksi</h2><div className="table-wrap"><table><thead><tr><th>Tanggal</th><th>Nama</th><th>Pekerjaan</th><th>Jumlah</th><th>Satuan</th><th>Poin</th><th>Pesanan</th></tr></thead><tbody>{(rows||[]).length ? (rows||[]).map(r=>{const e=Array.isArray(r.employees)?r.employees[0]:r.employees;const k=Array.isArray(r.kpis)?r.kpis[0]:r.kpis;const o=Array.isArray(r.orders)?r.orders[0]:r.orders;return <tr key={r.id}><td>{r.work_date}</td><td><strong>{e?.name||"-"}</strong></td><td>{k?.name||"-"}</td><td>{formatNumber(r.quantity)}</td><td>{r.unit_snapshot}</td><td><strong>{formatNumber(r.total_points)}</strong></td><td>{o?.order_number||"-"}</td></tr>}) : <EmptyRow colSpan={7} />}</tbody></table></div></section>
  </>;
}
