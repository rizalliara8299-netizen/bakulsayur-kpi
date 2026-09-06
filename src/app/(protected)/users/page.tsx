import { updateUserAccess } from "@/app/actions/users";
import { Badge, EmptyRow, Flash, PageHeader } from "@/components/page-ui";
import { requireUser } from "@/lib/auth";

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const params = await searchParams;
  const { supabase, profile } = await requireUser();
  const { data: profiles } = await supabase.from("profiles").select("id,email,display_name,role,is_active,created_at").order("created_at",{ascending:true});
  return <>
    <PageHeader title="Pengguna & RBAC" description="Akun baru setelah setup pertama otomatis nonaktif sampai disetujui Superadmin." />
    <Flash saved={params.saved} error={params.error} />
    <section className="card panel panel-first"><div className="table-wrap"><table><thead><tr><th>Nama</th><th>Email</th><th>Role</th><th>Status</th><th>Aksi</th></tr></thead><tbody>{(profiles||[]).length ? (profiles||[]).map(p=><tr key={p.id}><td><strong>{p.display_name||"-"}</strong></td><td>{p.email||"-"}</td><td><Badge tone="cyan">{p.role}</Badge></td><td><Badge tone={p.is_active?"green":"red"}>{p.is_active?"Aktif":"Menunggu aktivasi"}</Badge></td><td>{profile?.role==="superadmin" ? <form action={updateUserAccess} className="inline-form"><input type="hidden" name="profileId" value={p.id}/><select name="role" defaultValue={p.role}><option value="superadmin">Superadmin</option><option value="admin">Admin</option><option value="supervisor">Supervisor</option><option value="operator">Operator</option><option value="viewer">Viewer</option><option value="employee">Employee</option></select><select name="isActive" defaultValue={String(p.is_active)}><option value="true">Aktif</option><option value="false">Nonaktif</option></select><button className="btn btn-small btn-dark">Simpan</button></form> : <span className="muted">Read only</span>}</td></tr>) : <EmptyRow colSpan={5} text="Belum ada akun Auth." />}</tbody></table></div></section>
  </>;
}
