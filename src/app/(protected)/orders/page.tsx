import { createOrder } from "@/app/actions/core";
import { Badge, EmptyRow, Flash, PageHeader, statusTone } from "@/components/page-ui";
import { canWrite, requireUser } from "@/lib/auth";

function todayMakassar() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Makassar", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const params = await searchParams;
  const { supabase, profile } = await requireUser();
  const today = todayMakassar();
  const [{ data: employees }, { data: rows }] = await Promise.all([
    supabase.from("employees").select("id,name,teams!inner(name)").eq("status","active").is("deleted_at", null).eq("teams.name","Produksi").order("name"),
    supabase.from("orders").select("id,order_date,order_number,customer_name_snapshot,total_products,status,notes,employees!orders_responsible_employee_id_fkey(name),order_allocations(quantity,employees(name))").is("deleted_at", null).order("order_date",{ascending:false}).order("created_at",{ascending:false}).limit(100),
  ]);
  return <>
    <PageHeader title="Pesanan & Penanggung Jawab" description="Satu pesanan disimpan atomik bersama pembagian packaging dan poin petugas." />
    <Flash saved={params.saved} error={params.error} />
    {canWrite(profile?.role) ? <section className="card panel panel-first"><h2>Tambah Pesanan</h2><form action={createOrder} className="form-grid">
      <label className="field"><span>Tanggal</span><input name="orderDate" type="date" defaultValue={today} required /></label>
      <label className="field"><span>Customer</span><input name="customerName" required /></label>
      <label className="field"><span>Total Produk</span><input name="totalProducts" type="number" min="1" step="1" required /></label>
      <label className="field"><span>PJ Pesanan</span><select name="responsibleEmployeeId" required><option value="">Pilih PJ</option>{(employees||[]).map(e=><option key={e.id} value={e.id}>{e.name}</option>)}</select></label>
      <label className="field"><span>Status</span><select name="status" required><option>Diproses</option><option>Siap diserahkan</option><option>Selesai</option></select></label>
      <label className="field"><span>Catatan</span><input name="notes" /></label>
      <div className="full allocation-box"><strong>Pembagian Packaging (1–3 petugas)</strong><p className="muted">Total jumlah petugas wajib sama dengan Total Produk.</p>{[1,2,3].map(slot=><div className="allocation-grid" key={slot}><select name={`employee${slot}`} required={slot===1}><option value="">Petugas {slot}{slot===1?" (wajib)":""}</option>{(employees||[]).map(e=><option key={e.id} value={e.id}>{e.name}</option>)}</select><input name={`quantity${slot}`} type="number" min={slot===1?1:0} step="1" defaultValue={slot===1?1:0} /></div>)}</div>
      <div className="form-actions full"><button className="btn btn-primary">Simpan Pesanan + Alokasi</button></div>
    </form></section> : null}
    <section className="card panel"><h2>Daftar Pesanan</h2><div className="table-wrap"><table><thead><tr><th>Tanggal</th><th>No. Pesanan</th><th>Customer</th><th>Produk</th><th>PJ</th><th>Alokasi</th><th>Status</th></tr></thead><tbody>{(rows||[]).length ? (rows||[]).map(r=>{const pj=Array.isArray(r.employees)?r.employees[0]:r.employees;const alloc=(r.order_allocations||[]).map(a=>{const e=Array.isArray(a.employees)?a.employees[0]:a.employees;return `${e?.name||"-"}: ${a.quantity}`}).join(" · ");return <tr key={r.id}><td>{r.order_date}</td><td><strong>{r.order_number}</strong></td><td>{r.customer_name_snapshot}</td><td>{r.total_products}</td><td>{pj?.name||"-"}</td><td>{alloc||"-"}</td><td><Badge tone={statusTone(r.status)}>{r.status}</Badge></td></tr>}) : <EmptyRow colSpan={7} />}</tbody></table></div></section>
  </>;
}
