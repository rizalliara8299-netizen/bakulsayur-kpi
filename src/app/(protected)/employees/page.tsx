import { createEmployee } from "@/app/actions/core";
import { Badge, EmptyRow, Flash, PageHeader, statusTone } from "@/components/page-ui";
import { canManageMaster, requireUser } from "@/lib/auth";

export default async function EmployeesPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const params = await searchParams;
  const { supabase, profile } = await requireUser();
  const [{ data: employees }, { data: teams }] = await Promise.all([
    supabase.from("employees").select("id,employee_code,name,status,teams(name)").order("employee_code"),
    supabase.from("teams").select("id,name").eq("is_active", true).order("name"),
  ]);
  const manageable = canManageMaster(profile?.role);

  return <>
    <PageHeader title="Manajemen Karyawan" description="Kelola anggota tim tanpa menghapus histori transaksi lama." />
    <Flash saved={params.saved} error={params.error} />
    {manageable ? <section className="card panel panel-first"><h2>Tambah Karyawan</h2><form action={createEmployee} className="form-grid">
      <label className="field"><span>Kode Karyawan</span><input name="employeeCode" placeholder="KRY-005" required /></label>
      <label className="field"><span>Nama</span><input name="name" required /></label>
      <label className="field"><span>Tim</span><select name="teamId" required><option value="">Pilih tim</option>{(teams||[]).map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
      <label className="field"><span>Status</span><select name="status"><option value="active">Aktif</option><option value="inactive">Nonaktif</option></select></label>
      <div className="form-actions full"><button className="btn btn-primary">Simpan Karyawan</button></div>
    </form></section> : null}
    <section className="card panel"><h2>Daftar Karyawan</h2><div className="table-wrap"><table><thead><tr><th>Kode</th><th>Nama</th><th>Tim</th><th>Status</th></tr></thead><tbody>{(employees||[]).length ? (employees||[]).map(row=>{const team=Array.isArray(row.teams)?row.teams[0]:row.teams;return <tr key={row.id}><td>{row.employee_code}</td><td><strong>{row.name}</strong></td><td>{team?.name||"-"}</td><td><Badge tone={statusTone(row.status)}>{row.status === "active" ? "Aktif" : "Nonaktif"}</Badge></td></tr>}) : <EmptyRow colSpan={4} />}</tbody></table></div></section>
  </>;
}
