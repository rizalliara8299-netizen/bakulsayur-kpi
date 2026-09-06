import { Badge, EmptyRow, PageHeader } from "@/components/page-ui";
import { requireUser } from "@/lib/auth";

export default async function AuditPage() {
  const { supabase } = await requireUser();
  const { data: logs } = await supabase.from("audit_logs").select("id,created_at,action,entity_type,entity_id,source,profiles(display_name,email)").order("created_at",{ascending:false}).limit(200);
  return <>
    <PageHeader title="Audit Log" description="Jejak perubahan master dan transaksi penting, termasuk aktor, entitas, dan waktu kejadian." />
    <section className="card panel panel-first"><div className="table-wrap"><table><thead><tr><th>Waktu</th><th>Aktor</th><th>Aksi</th><th>Entitas</th><th>ID</th><th>Sumber</th></tr></thead><tbody>{(logs||[]).length ? (logs||[]).map(l=>{const p=Array.isArray(l.profiles)?l.profiles[0]:l.profiles;return <tr key={l.id}><td>{new Date(l.created_at).toLocaleString("id-ID",{timeZone:"Asia/Makassar"})}</td><td>{p?.display_name||p?.email||"System"}</td><td><Badge tone={l.action==="DELETE"?"red":l.action==="UPDATE"?"yellow":"green"}>{l.action}</Badge></td><td>{l.entity_type}</td><td>{l.entity_id||"-"}</td><td>{l.source}</td></tr>}) : <EmptyRow colSpan={6} text="Belum ada audit log atau role Anda tidak memiliki akses." />}</tbody></table></div></section>
  </>;
}
