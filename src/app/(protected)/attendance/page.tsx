import { saveAttendance } from "@/app/actions/core";
import { Badge, EmptyRow, Flash, PageHeader, statusTone } from "@/components/page-ui";
import { canWrite, requireUser } from "@/lib/auth";

export default async function AttendancePage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const params = await searchParams;
  const { supabase, profile } = await requireUser();
  const today = new Date().toISOString().slice(0,10);
  const [{ data: employees }, { data: rows }] = await Promise.all([
    supabase.from("employees").select("id,name,employee_code").eq("status","active").order("name"),
    supabase.from("attendance_entries").select("id,work_date,attendance_status,arrival_time,zone_result,notes,employees(name)").order("work_date",{ascending:false}).order("created_at",{ascending:false}).limit(120),
  ]);
  return <>
    <PageHeader title="Kehadiran & Jam Kedatangan" description="Zona dihitung otomatis berdasarkan tim dan policy yang berlaku pada tanggal kehadiran." />
    <Flash saved={params.saved} error={params.error} />
    {canWrite(profile?.role) ? <section className="card panel panel-first"><h2>Input Kehadiran</h2><form action={saveAttendance} className="form-grid">
      <label className="field"><span>Tanggal</span><input name="workDate" type="date" defaultValue={today} required /></label>
      <label className="field"><span>Karyawan</span><select name="employeeId" required><option value="">Pilih karyawan</option>{(employees||[]).map(e=><option key={e.id} value={e.id}>{e.employee_code} · {e.name}</option>)}</select></label>
      <label className="field"><span>Status</span><select name="status" required><option>Hadir</option><option>Izin</option><option>Sakit</option><option>Alpa</option><option>Libur</option></select></label>
      <label className="field"><span>Jam Datang</span><input name="arrivalTime" type="time" /></label>
      <label className="field full"><span>Keterangan</span><textarea name="notes" placeholder="Wajib untuk Izin atau Sakit" /></label>
      <div className="form-actions full"><button className="btn btn-primary">Simpan Kehadiran</button></div>
    </form></section> : null}
    <section className="card panel"><h2>Riwayat Kehadiran</h2><div className="table-wrap"><table><thead><tr><th>Tanggal</th><th>Nama</th><th>Status</th><th>Jam</th><th>Zona</th><th>Keterangan</th></tr></thead><tbody>{(rows||[]).length ? (rows||[]).map(r=>{const e=Array.isArray(r.employees)?r.employees[0]:r.employees;return <tr key={r.id}><td>{r.work_date}</td><td><strong>{e?.name||"-"}</strong></td><td><Badge tone={statusTone(r.attendance_status)}>{r.attendance_status}</Badge></td><td>{r.arrival_time||"-"}</td><td><Badge tone={statusTone(r.zone_result||"-")}>{r.zone_result||"-"}</Badge></td><td>{r.notes||"-"}</td></tr>}) : <EmptyRow colSpan={6} />}</tbody></table></div></section>
  </>;
}
