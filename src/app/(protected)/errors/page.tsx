import { createErrorCase } from "@/app/actions/core";
import { Badge, EmptyRow, Flash, PageHeader, statusTone } from "@/components/page-ui";
import { canWrite, requireUser } from "@/lib/auth";

export default async function ErrorsPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const params = await searchParams;
  const { supabase, profile } = await requireUser();
  const today = new Date().toISOString().slice(0,10);
  const [{ data: employees }, { data: orders }, { data: rows }] = await Promise.all([
    supabase.from("employees").select("id,name").eq("status","active").order("name"),
    supabase.from("orders").select("id,order_number,customer_name_snapshot").order("order_date",{ascending:false}).limit(100),
    supabase.from("error_cases").select("id,error_date,error_type,chronology,evaluation_status,customer_name_snapshot,severity,notes,performer:employees!error_cases_performer_employee_id_fkey(name),responsible:employees!error_cases_responsible_employee_id_fkey(name),orders(order_number)").order("error_date",{ascending:false}).order("created_at",{ascending:false}).limit(100),
  ]);
  return <>
    <PageHeader title="Komplain & Kesalahan" description="Produktivitas tetap terpisah dari evaluasi kesalahan agar penilaian transparan." />
    <Flash saved={params.saved} error={params.error} />
    {canWrite(profile?.role) ? <section className="card panel panel-first"><h2>Catat Kesalahan</h2><form action={createErrorCase} className="form-grid">
      <label className="field"><span>Tanggal</span><input name="errorDate" type="date" defaultValue={today} required /></label>
      <label className="field"><span>Jenis</span><select name="errorType" required><option>Packaging</option><option>Pengantaran</option><option>Belanja</option></select></label>
      <label className="field"><span>Pesanan (opsional)</span><select name="orderId"><option value="">Tanpa pesanan</option>{(orders||[]).map(o=><option key={o.id} value={o.id}>{o.order_number} · {o.customer_name_snapshot}</option>)}</select></label>
      <label className="field"><span>Customer</span><input name="customerName" /></label>
      <label className="field"><span>Pelaksana</span><select name="performerEmployeeId"><option value="">Belum diketahui</option>{(employees||[]).map(e=><option key={e.id} value={e.id}>{e.name}</option>)}</select></label>
      <label className="field"><span>PJ / Penanggung Jawab</span><select name="responsibleEmployeeId"><option value="">Belum ditentukan</option>{(employees||[]).map(e=><option key={e.id} value={e.id}>{e.name}</option>)}</select></label>
      <label className="field"><span>Status Evaluasi</span><select name="evaluationStatus" required><option>Menunggu evaluasi</option><option>Pelaksana diketahui</option><option>Dibebankan ke PJ</option><option>Bukan kesalahan tim</option><option>Selesai</option></select></label>
      <label className="field"><span>Severity</span><select name="severity"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option></select></label>
      <label className="field full"><span>Kronologi</span><textarea name="chronology" required /></label>
      <label className="field full"><span>Hasil / Keterangan</span><textarea name="notes" /></label>
      <div className="form-actions full"><button className="btn btn-primary">Simpan Kesalahan</button></div>
    </form></section> : null}
    <section className="card panel"><h2>Riwayat Kesalahan</h2><div className="table-wrap"><table><thead><tr><th>Tanggal</th><th>Jenis</th><th>Customer</th><th>Pelaksana</th><th>PJ</th><th>Status</th><th>Severity</th><th>Kronologi</th></tr></thead><tbody>{(rows||[]).length ? (rows||[]).map(r=>{const performer=Array.isArray(r.performer)?r.performer[0]:r.performer;const responsible=Array.isArray(r.responsible)?r.responsible[0]:r.responsible;return <tr key={r.id}><td>{r.error_date}</td><td>{r.error_type}</td><td>{r.customer_name_snapshot||"-"}</td><td>{performer?.name||"-"}</td><td>{responsible?.name||"-"}</td><td><Badge tone={statusTone(r.evaluation_status)}>{r.evaluation_status}</Badge></td><td><Badge tone={r.severity==="critical"?"red":r.severity==="high"?"orange":"gray"}>{r.severity}</Badge></td><td className="wrap-cell">{r.chronology}</td></tr>}) : <EmptyRow colSpan={8} />}</tbody></table></div></section>
  </>;
}
