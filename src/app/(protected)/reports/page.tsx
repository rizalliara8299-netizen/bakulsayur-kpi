import { Badge, EmptyRow, PageHeader, formatNumber, statusTone } from "@/components/page-ui";
import { requireUser } from "@/lib/auth";

function monthRangeMakassar() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Makassar", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  const year = Number(map.year);
  const month = Number(map.month);
  const endDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const mm = String(month).padStart(2, "0");
  return { start: `${year}-${mm}-01`, end: `${year}-${mm}-${String(endDay).padStart(2, "0")}` };
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ start?: string; end?: string; employee?: string }> }) {
  const params = await searchParams;
  const defaults = monthRangeMakassar();
  const start = params.start || defaults.start;
  const end = params.end || defaults.end;
  const { supabase } = await requireUser();
  const { data: employees } = await supabase.from("employees").select("id,name").eq("status","active").is("deleted_at", null).order("name");

  let productionQuery = supabase.from("production_entries").select("id,work_date,quantity,total_points,unit_snapshot,employees(name),kpis(name)").is("deleted_at", null).gte("work_date",start).lte("work_date",end).order("work_date",{ascending:false});
  let attendanceQuery = supabase.from("attendance_entries").select("id,work_date,attendance_status,zone_result,employee_id").is("deleted_at", null).gte("work_date",start).lte("work_date",end);
  let errorsQuery = supabase.from("error_cases").select("id,error_date,error_type,evaluation_status,performer_employee_id,responsible_employee_id").is("deleted_at", null).gte("error_date",start).lte("error_date",end);
  if (params.employee) {
    productionQuery = productionQuery.eq("employee_id",params.employee);
    attendanceQuery = attendanceQuery.eq("employee_id",params.employee);
  }
  const [{ data: production }, { data: attendance }, { data: errors }, { data: orders }] = await Promise.all([
    productionQuery,
    attendanceQuery,
    errorsQuery,
    supabase.from("orders").select("id,total_products,status").is("deleted_at", null).gte("order_date",start).lte("order_date",end),
  ]);
  const relevantErrors = params.employee ? (errors||[]).filter(e => (e.evaluation_status==="Dibebankan ke PJ" ? e.responsible_employee_id : (e.performer_employee_id||e.responsible_employee_id)) === params.employee) : (errors||[]);
  const totalPoints = (production||[]).reduce((s,r)=>s+Number(r.total_points||0),0);
  const totalQty = (production||[]).reduce((s,r)=>s+Number(r.quantity||0),0);
  const hadir = (attendance||[]).filter(r=>r.attendance_status==="Hadir").length;
  return <>
    <PageHeader title="Laporan KPI" description="Filter periode dan karyawan untuk melihat rekap produksi, kehadiran, pesanan, dan kesalahan." />
    <section className="card panel panel-first"><form method="get" className="filter-grid">
      <label className="field"><span>Tanggal Awal</span><input type="date" name="start" defaultValue={start} /></label>
      <label className="field"><span>Tanggal Akhir</span><input type="date" name="end" defaultValue={end} /></label>
      <label className="field"><span>Karyawan</span><select name="employee" defaultValue={params.employee||""}><option value="">Semua karyawan</option>{(employees||[]).map(e=><option key={e.id} value={e.id}>{e.name}</option>)}</select></label>
      <div className="form-actions"><button className="btn btn-primary">Terapkan Filter</button></div>
    </form></section>
    <section className="stats report-stats">
      <div className="card stat"><div className="stat-label">TOTAL POIN</div><div className="stat-value">{formatNumber(totalPoints)}</div></div>
      <div className="card stat"><div className="stat-label">TOTAL JUMLAH KPI</div><div className="stat-value">{formatNumber(totalQty)}</div></div>
      <div className="card stat"><div className="stat-label">HADIR</div><div className="stat-value">{hadir}</div></div>
      <div className="card stat"><div className="stat-label">KESALAHAN</div><div className="stat-value">{relevantErrors.length}</div></div>
      <div className="card stat"><div className="stat-label">PESANAN</div><div className="stat-value">{(orders||[]).length}</div></div>
    </section>
    <section className="card panel"><h2>Rincian Produksi</h2><div className="table-wrap"><table><thead><tr><th>Tanggal</th><th>Nama</th><th>KPI</th><th>Jumlah</th><th>Satuan</th><th>Poin</th></tr></thead><tbody>{(production||[]).length ? (production||[]).map(r=>{const e=Array.isArray(r.employees)?r.employees[0]:r.employees;const k=Array.isArray(r.kpis)?r.kpis[0]:r.kpis;return <tr key={r.id}><td>{r.work_date}</td><td>{e?.name||"-"}</td><td>{k?.name||"-"}</td><td>{formatNumber(r.quantity)}</td><td>{r.unit_snapshot}</td><td><strong>{formatNumber(r.total_points)}</strong></td></tr>}) : <EmptyRow colSpan={6} />}</tbody></table></div></section>
    <section className="card panel"><h2>Ringkasan Kehadiran</h2><div className="pill-row"><Badge tone="green">Hadir {hadir}</Badge><Badge tone="green">Hijau {(attendance||[]).filter(r=>r.zone_result==="Hijau").length}</Badge><Badge tone="yellow">Kuning {(attendance||[]).filter(r=>r.zone_result==="Kuning").length}</Badge><Badge tone="orange">Oranye {(attendance||[]).filter(r=>r.zone_result==="Oranye").length}</Badge><Badge tone="red">Merah {(attendance||[]).filter(r=>r.zone_result==="Merah").length}</Badge></div></section>
  </>;
}
