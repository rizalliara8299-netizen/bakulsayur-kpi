import { Badge, EmptyRow, PageHeader, formatNumber } from "@/components/page-ui";
import { requireUser } from "@/lib/auth";

export default async function RankingPage() {
  const { supabase } = await requireUser();
  const [{ data: ranking }, { data: attendance }, { data: errors }] = await Promise.all([
    supabase.from("v_production_ranking").select("employee_id,employee_code,name,total_points,total_products,entry_count").order("total_points",{ascending:false}),
    supabase.from("attendance_entries").select("employee_id,attendance_status,zone_result").is("deleted_at", null),
    supabase.from("error_cases").select("performer_employee_id,responsible_employee_id,evaluation_status,error_type").is("deleted_at", null),
  ]);
  const attendMap = new Map<string,{hadir:number;green:number;red:number}>();
  for (const row of attendance||[]) { const item=attendMap.get(row.employee_id)||{hadir:0,green:0,red:0}; if(row.attendance_status==="Hadir") item.hadir++; if(row.zone_result==="Hijau") item.green++; if(row.zone_result==="Merah") item.red++; attendMap.set(row.employee_id,item); }
  const errorMap = new Map<string,{pack:number;delivery:number}>();
  for (const row of errors||[]) { const id=row.evaluation_status==="Dibebankan ke PJ"?row.responsible_employee_id:(row.performer_employee_id||row.responsible_employee_id); if(!id) continue; const item=errorMap.get(id)||{pack:0,delivery:0}; if(row.error_type==="Packaging") item.pack++; if(row.error_type==="Pengantaran") item.delivery++; errorMap.set(id,item); }
  return <>
    <PageHeader title="Peringkat & Profil Kinerja" description="Produktivitas, kehadiran, dan kesalahan ditampilkan berdampingan tanpa mencampur nilainya." />
    <section className="card panel panel-first"><div className="table-wrap"><table><thead><tr><th>Rank</th><th>Karyawan</th><th>Total Poin</th><th>Produk</th><th>Input KPI</th><th>Hadir</th><th>Zona Hijau</th><th>Zona Merah</th><th>Error Packing</th><th>Error Antar</th></tr></thead><tbody>{(ranking||[]).length ? (ranking||[]).map((r,i)=>{const a=attendMap.get(r.employee_id)||{hadir:0,green:0,red:0};const e=errorMap.get(r.employee_id)||{pack:0,delivery:0};return <tr key={r.employee_id}><td><span className={`rank-badge ${i===0?"first":""}`}>{i+1}</span></td><td><strong>{r.name}</strong><div className="muted small">{r.employee_code}</div></td><td><strong>{formatNumber(r.total_points)}</strong></td><td>{formatNumber(r.total_products)}</td><td>{formatNumber(r.entry_count)}</td><td>{a.hadir}</td><td><Badge tone="green">{a.green}</Badge></td><td><Badge tone="red">{a.red}</Badge></td><td><Badge tone="red">{e.pack}</Badge></td><td><Badge tone="orange">{e.delivery}</Badge></td></tr>}) : <EmptyRow colSpan={10} />}</tbody></table></div></section>
  </>;
}
