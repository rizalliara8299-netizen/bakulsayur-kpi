import Link from "next/link";
import { saveInventory } from "@/app/actions/core";
import { Badge, EmptyRow, Flash, PageHeader, statusTone } from "@/components/page-ui";
import { canWrite, requireUser } from "@/lib/auth";

function todayMakassar() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Makassar", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

export default async function InventoryPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const params = await searchParams;
  const { supabase, profile } = await requireUser();
  const today = todayMakassar();
  const [{ data: employees }, { data: tasks }, { data: rows }] = await Promise.all([
    supabase.from("employees").select("id,name,teams!inner(name)").eq("status","active").is("deleted_at", null).eq("teams.name","Inventory").order("name"),
    supabase.from("inventory_tasks").select("id,name").eq("is_active",true).order("sort_order"),
    supabase.from("inventory_entries").select("id,work_date,work_status,notes,employees(name),inventory_tasks(name)").is("deleted_at", null).order("work_date",{ascending:false}).order("created_at",{ascending:false}).limit(100),
  ]);
  return <>
    <div className="daily-title-row">
      <PageHeader title="Input Pekerjaan Harian" description="Catat pekerjaan produksi berbasis poin dan tugas inventory berbasis checklist." />
      <div className="daily-tabs"><Link href="/production" prefetch={false} className="daily-tab">Tim Produksi</Link><Link href="/inventory" prefetch={false} className="daily-tab active">Inventory</Link></div>
    </div>
    <Flash saved={params.saved} error={params.error} />
    <div className="two-col daily-workspace">
      {canWrite(profile?.role) ? <section className="card daily-panel"><div className="daily-panel-head"><h2>Input Inventory</h2><p>Checklist pekerjaan inventory harian.</p></div><div className="daily-panel-body"><form action={saveInventory} className="form-grid">
        <label className="field"><span>Tanggal</span><input name="workDate" type="date" defaultValue={today} required /></label>
        <label className="field"><span>Petugas</span><select name="employeeId" required><option value="">Pilih petugas</option>{(employees||[]).map(e=><option key={e.id} value={e.id}>{e.name}</option>)}</select></label>
        <label className="field"><span>Pekerjaan</span><select name="taskId" required><option value="">Pilih pekerjaan</option>{(tasks||[]).map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
        <label className="field"><span>Status</span><select name="workStatus" required><option>Selesai</option><option>Belum selesai</option><option>Tidak ada kebutuhan</option><option>Ada kendala</option></select></label>
        <label className="field full"><span>Keterangan</span><textarea name="notes" placeholder="Wajib ketika ada kendala" /></label>
        <div className="form-actions full"><button className="btn btn-primary">Simpan Checklist</button></div>
      </form></div></section> : null}
      <section className="card daily-panel"><div className="daily-panel-head"><h2>Riwayat Inventory</h2><p>Aktivitas terbaru yang masih aktif.</p></div><div className="table-wrap"><table><thead><tr><th>Tanggal</th><th>Petugas</th><th>Pekerjaan</th><th>Status</th><th>Keterangan</th></tr></thead><tbody>{(rows||[]).length ? (rows||[]).map(r=>{const e=Array.isArray(r.employees)?r.employees[0]:r.employees;const t=Array.isArray(r.inventory_tasks)?r.inventory_tasks[0]:r.inventory_tasks;return <tr key={r.id}><td>{r.work_date}</td><td><strong>{e?.name||"-"}</strong></td><td>{t?.name||"-"}</td><td><Badge tone={statusTone(r.work_status)}>{r.work_status}</Badge></td><td>{r.notes||"-"}</td></tr>}) : <EmptyRow colSpan={5} />}</tbody></table></div></section>
    </div>
  </>;
}
