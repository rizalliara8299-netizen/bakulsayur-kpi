"use client";

import { FormEvent, useMemo, useState } from "react";
import { logout } from "@/app/actions/auth";
import { getBrowserSupabase } from "@/lib/supabase/browser";

type Panel = "dashboard" | "input" | "orders" | "attendance" | "errors" | "ranking" | "reports" | "employees" | "settings" | "admin";
type InputTab = "production" | "inventory";

type Bundle = any;

const panelCopy: Record<Panel, { title: string; description: string }> = {
  dashboard: { title: "Welcome back, Admin!", description: "Mari pantau produktivitas dan kedisiplinan tim Bakul Sayur hari ini." },
  input: { title: "Input kerja jadi lebih cepat.", description: "Catat aktivitas harian tanpa reload seluruh halaman." },
  orders: { title: "Pesanan lebih rapi, PJ lebih jelas.", description: "Kelola pesanan dan pembagian packaging dalam satu alur." },
  attendance: { title: "Kedisiplinan terlihat setiap hari.", description: "Pantau kehadiran dan zona waktu tim secara konsisten." },
  errors: { title: "Evaluasi tanpa kehilangan konteks.", description: "Catat kesalahan, customer, pelaksana, dan tindak lanjut." },
  ranking: { title: "Lihat siapa yang paling konsisten.", description: "Bandingkan produktivitas, kehadiran, dan profil kinerja." },
  reports: { title: "Semua laporan dalam satu tempat.", description: "Filter periode dan telusuri aktivitas tim secara instan." },
  employees: { title: "Kelola tim dengan lebih mudah.", description: "Karyawan produksi dan inventory tetap sinkron ke seluruh modul." },
  settings: { title: "Pengaturan yang tetap sederhana.", description: "Atur KPI, akses pengguna, audit, dan konfigurasi aplikasi." },
  admin: { title: "Admin Control Center.", description: "Kontrol seluruh data, akses, arsip, pemulihan, dan audit dari satu tempat." },
};

const menu: Array<{ id: Panel; label: string; icon: string }> = [
  { id: "dashboard", label: "Dashboard", icon: "▦" },
  { id: "input", label: "Input Harian", icon: "+" },
  { id: "orders", label: "Pesanan & PJ", icon: "□" },
  { id: "attendance", label: "Kehadiran", icon: "◷" },
  { id: "errors", label: "Kesalahan", icon: "!" },
  { id: "ranking", label: "Peringkat & Profil", icon: "★" },
  { id: "reports", label: "Laporan", icon: "▤" },
  { id: "employees", label: "Karyawan", icon: "♙" },
  { id: "settings", label: "Pengaturan", icon: "⚙" },
];

function num(v: unknown) { return new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(Number(v || 0)); }
function value(fd: FormData, key: string) { return String(fd.get(key) || "").trim(); }
function nvalue(fd: FormData, key: string) { return Number(fd.get(key) || 0); }

export function UnifiedDashboardApp({
  initialBundle,
  displayName,
  role,
  organizationId,
  userId,
}: {
  initialBundle: Bundle;
  displayName: string;
  role: string;
  organizationId: string;
  userId: string;
}) {
  const supabase = useMemo(() => getBrowserSupabase(), []);
  const [bundle, setBundle] = useState<Bundle>(initialBundle || {});
  const [panel, setPanel] = useState<Panel>("dashboard");
  const [inputTab, setInputTab] = useState<InputTab>("production");
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [reportStart, setReportStart] = useState(() => String(bundle.today || new Date().toISOString().slice(0,10)).slice(0,7) + "-01");
  const [reportEnd, setReportEnd] = useState(() => String(bundle.today || new Date().toISOString().slice(0,10)));
  const [reportEmployee, setReportEmployee] = useState("");
  const isAdmin = role === "admin" || role === "superadmin";
  const canWrite = ["superadmin", "admin", "supervisor", "operator"].includes(role);
  const initials = (displayName || "Admin").split(/\s+/).filter(Boolean).slice(0,2).map((x) => x[0]?.toUpperCase()).join("") || "AD";
  const copy = panelCopy[panel];

  async function refreshBundle(silent = true) {
    const { data, error } = await supabase.rpc("get_unified_app_bundle");
    if (error) {
      if (!silent) setToast({ type: "err", text: error.message });
      return false;
    }
    setBundle(data || {});
    return true;
  }

  async function task(key: string, fn: () => Promise<{ error?: any }>, success: string) {
    setBusy(key); setToast(null);
    try {
      const result = await fn();
      if (result?.error) throw result.error;
      await refreshBundle(true);
      setToast({ type: "ok", text: success });
    } catch (error: any) {
      setToast({ type: "err", text: error?.message || "Operasi gagal" });
    } finally { setBusy(null); }
  }

  function switchPanel(next: Panel) {
    setPanel(next);
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }

  const employees = bundle.employees || [];
  const productionEmployees = employees.filter((e: any) => e.status === "active" && e.team === "Produksi");
  const inventoryEmployees = employees.filter((e: any) => e.status === "active" && e.team === "Inventory");
  const kpis = (bundle.kpis || []).filter((k: any) => k.active);
  const tasks = (bundle.tasks || []).filter((t: any) => t.active);
  const production = bundle.production || [];
  const inventory = bundle.inventory || [];
  const attendance = bundle.attendance || [];
  const errors = bundle.errors || [];
  const orders = bundle.orders || [];
  const dashboard = bundle.dashboard || {};
  const summary = dashboard.summary || {};

  const ranking = useMemo(() => {
    const map = new Map<string, any>();
    for (const e of employees.filter((x: any) => x.status === "active")) map.set(e.id, { id:e.id, code:e.code, name:e.name, points:0, products:0, entries:0, hadir:0, green:0, red:0, pack:0, delivery:0 });
    for (const row of production) { const x = map.get(row.employee_id); if (!x) continue; x.points += Number(row.total_points||0); x.entries++; if (String(row.kpi_name).toLowerCase()==="packaging") x.products += Number(row.quantity||0); }
    for (const row of attendance) { const x=map.get(row.employee_id); if(!x) continue; if(row.attendance_status==="Hadir") x.hadir++; if(row.zone_result==="Hijau") x.green++; if(row.zone_result==="Merah") x.red++; }
    for (const row of errors) { const id=row.evaluation_status==="Dibebankan ke PJ"?row.responsible_employee_id:(row.performer_employee_id||row.responsible_employee_id); const x=map.get(id); if(!x) continue; if(row.error_type==="Packaging") x.pack++; if(row.error_type==="Pengantaran") x.delivery++; }
    return [...map.values()].sort((a,b)=>b.points-a.points || b.products-a.products || a.name.localeCompare(b.name));
  }, [employees, production, attendance, errors]);

  const reportProduction = useMemo(() => production.filter((r:any)=>r.work_date>=reportStart && r.work_date<=reportEnd && (!reportEmployee || r.employee_id===reportEmployee)), [production,reportStart,reportEnd,reportEmployee]);
  const reportAttendance = useMemo(() => attendance.filter((r:any)=>r.work_date>=reportStart && r.work_date<=reportEnd && (!reportEmployee || r.employee_id===reportEmployee)), [attendance,reportStart,reportEnd,reportEmployee]);
  const reportErrors = useMemo(() => errors.filter((r:any)=>r.error_date>=reportStart && r.error_date<=reportEnd && (!reportEmployee || (r.performer_employee_id===reportEmployee || r.responsible_employee_id===reportEmployee))), [errors,reportStart,reportEnd,reportEmployee]);
  const reportOrders = useMemo(() => orders.filter((r:any)=>r.order_date>=reportStart && r.order_date<=reportEnd), [orders,reportStart,reportEnd]);

  async function submitProduction(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const fd=new FormData(e.currentTarget); const form=e.currentTarget;
    await task("production-save", async()=>supabase.rpc("create_production_entry", { p_work_date:value(fd,"workDate"),p_employee_id:value(fd,"employeeId"),p_kpi_id:value(fd,"kpiId"),p_quantity:nvalue(fd,"quantity"),p_order_id:null,p_notes:value(fd,"notes")||null }), "Pekerjaan produksi tersimpan.");
    if (!busy) form.reset();
  }
  async function submitInventory(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const fd=new FormData(e.currentTarget);
    await task("inventory-save", async()=>supabase.rpc("upsert_inventory_entry", { p_work_date:value(fd,"workDate"),p_employee_id:value(fd,"employeeId"),p_task_id:value(fd,"taskId"),p_work_status:value(fd,"workStatus"),p_notes:value(fd,"notes")||null }), "Checklist inventory tersimpan.");
  }
  async function submitAttendance(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const fd=new FormData(e.currentTarget);
    await task("attendance-save", async()=>supabase.rpc("upsert_attendance", { p_work_date:value(fd,"workDate"),p_employee_id:value(fd,"employeeId"),p_status:value(fd,"status"),p_arrival_time:value(fd,"arrivalTime")||null,p_notes:value(fd,"notes")||null }), "Kehadiran tersimpan.");
  }
  async function submitOrder(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const fd=new FormData(e.currentTarget); const alloc=[1,2,3].map(i=>({employeeId:value(fd,`employee${i}`),quantity:nvalue(fd,`quantity${i}`)})).filter(x=>x.employeeId&&x.quantity>0);
    await task("order-save", async()=>supabase.rpc("create_order_with_allocations", { p_order_date:value(fd,"orderDate"),p_customer_name:value(fd,"customerName"),p_total_products:Math.floor(nvalue(fd,"totalProducts")),p_responsible_employee_id:value(fd,"responsibleEmployeeId"),p_status:value(fd,"status"),p_notes:value(fd,"notes")||null,p_allocations:alloc }), "Pesanan dan alokasi tersimpan.");
  }
  async function submitError(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const fd=new FormData(e.currentTarget);
    await task("error-save", async()=>supabase.from("error_cases").insert({ organization_id:organizationId,error_date:value(fd,"errorDate"),order_id:value(fd,"orderId")||null,error_type:value(fd,"errorType"),chronology:value(fd,"chronology"),performer_employee_id:value(fd,"performerEmployeeId")||null,responsible_employee_id:value(fd,"responsibleEmployeeId")||null,evaluation_status:value(fd,"evaluationStatus"),customer_name_snapshot:value(fd,"customerName")||null,severity:value(fd,"severity")||"medium",notes:value(fd,"notes")||null,created_by:userId,updated_by:userId }), "Kesalahan tersimpan.");
  }
  async function submitEmployee(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const fd=new FormData(e.currentTarget);
    await task("employee-save", async()=>supabase.from("employees").insert({ organization_id:organizationId,employee_code:value(fd,"employeeCode").toUpperCase(),name:value(fd,"name"),team_id:value(fd,"teamId"),status:value(fd,"status")||"active",created_by:userId,updated_by:userId }), "Karyawan tersimpan.");
  }
  async function submitKpi(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const fd=new FormData(e.currentTarget);
    await task("kpi-save", async()=>supabase.rpc("create_kpi_with_version", { p_code:value(fd,"code"),p_name:value(fd,"name"),p_unit:value(fd,"unit"),p_points:nvalue(fd,"points"),p_effective_from:value(fd,"effectiveFrom") }), "KPI baru tersimpan.");
  }

  async function adminRecord(module:string,id:string,restore=false) {
    if (!window.confirm(restore ? "Pulihkan record ini?" : "Hapus/arsipkan record ini? Data masih dapat dipulihkan.")) return;
    await task(`admin-${module}-${id}`, async()=>supabase.rpc(restore?"admin_restore_record":"admin_soft_delete_record", { p_module:module,p_id:id }), restore?"Record dipulihkan.":"Record diarsipkan.");
  }
  async function adminBulk(module:string,label:string,restore=false) {
    if (!window.confirm(restore?`Pulihkan SEMUA arsip ${label}?`:`Arsipkan SEMUA data aktif ${label}?`)) return;
    await task(`bulk-${module}`, async()=>supabase.rpc(restore?"admin_bulk_restore":"admin_bulk_soft_delete", { p_module:module }), restore?`Semua arsip ${label} dipulihkan.`:`Semua data aktif ${label} diarsipkan.`);
  }

  const today = String(bundle.today || new Date().toISOString().slice(0,10));

  return <div className="shell unified-shell">
    <aside className="sidebar unified-sidebar">
      <div className="brand legacy-brand"><div className="brand-logo-fallback"><span>▱</span><b>Bakul Sayur</b></div></div>
      <div className="nav-caption">MENU UTAMA</div>
      <nav className="primary-nav">
        {menu.map(item=><button key={item.id} type="button" onClick={()=>switchPanel(item.id)} className={`nav-item unified-nav-button ${panel===item.id?"active":""}`}><span className="nav-icon">{item.icon}</span><span>{item.label}</span></button>)}
        {isAdmin?<><div className="nav-caption nav-caption-admin">ADMIN</div><button type="button" onClick={()=>switchPanel("admin")} className={`nav-item unified-nav-button ${panel==="admin"?"active":""}`}><span className="nav-icon">◆</span><span>Admin Control</span></button></>:null}
      </nav>
      <div className="sidebar-foot"><strong>Bakul Sayur</strong><span>Manajemen KPI Karyawan</span></div>
    </aside>

    <main className="main unified-main">
      <header className="hero legacy-hero">
        <div className="hero-copy"><h1>{panel==="dashboard"?`Welcome back, ${displayName||"Admin"}!`:copy.title}</h1><p>{copy.description}</p></div>
        <div className="hero-tools"><button className="hero-search" type="button">⌕</button><div className="admin-pill"><div className="admin-copy"><strong>Admin Panel</strong><span>{role==="superadmin"?"Bakul Sayur":role}</span></div><div className="admin-avatar">{initials}</div></div><form action={logout}><button className="hero-logout" type="submit">↗</button></form></div>
      </header>
      {toast?<div className={`unified-toast ${toast.type}`}>{toast.text}<button onClick={()=>setToast(null)}>×</button></div>:null}
      <div className="content unified-content">
        {panel==="dashboard"?<DashboardPanel summary={summary} dashboard={dashboard} switchPanel={switchPanel}/>:null}
        {panel==="input"?<InputPanel tab={inputTab} setTab={setInputTab} canWrite={canWrite} today={today} productionEmployees={productionEmployees} inventoryEmployees={inventoryEmployees} kpis={kpis} tasks={tasks} production={production} inventory={inventory} busy={busy} submitProduction={submitProduction} submitInventory={submitInventory}/>:null}
        {panel==="orders"?<OrdersPanel canWrite={canWrite} today={today} employees={productionEmployees} orders={orders} busy={busy} submit={submitOrder}/>:null}
        {panel==="attendance"?<AttendancePanel canWrite={canWrite} today={today} employees={employees.filter((e:any)=>e.status==="active")} rows={attendance} busy={busy} submit={submitAttendance}/>:null}
        {panel==="errors"?<ErrorsPanel canWrite={canWrite} today={today} employees={employees.filter((e:any)=>e.status==="active")} orders={orders} rows={errors} busy={busy} submit={submitError}/>:null}
        {panel==="ranking"?<RankingPanel rows={ranking}/>:null}
        {panel==="reports"?<ReportsPanel employees={employees} start={reportStart} end={reportEnd} employee={reportEmployee} setStart={setReportStart} setEnd={setReportEnd} setEmployee={setReportEmployee} production={reportProduction} attendance={reportAttendance} errors={reportErrors} orders={reportOrders}/>:null}
        {panel==="employees"?<EmployeesPanel canManage={isAdmin} teams={bundle.teams||[]} employees={employees} busy={busy} submit={submitEmployee}/>:null}
        {panel==="settings"?<SettingsPanel isAdmin={isAdmin} bundle={bundle} busy={busy} submitKpi={submitKpi} supabase={supabase} refreshBundle={refreshBundle} setToast={setToast}/>:null}
        {panel==="admin"&&isAdmin?<AdminPanel bundle={bundle} busy={busy} recordAction={adminRecord} bulkAction={adminBulk} switchPanel={switchPanel}/>:null}
      </div>
    </main>
  </div>;
}

function SectionHead({title,desc,action}:{title:string;desc:string;action?:any}) { return <div className="dashboard-section-head"><div className="section-head"><h1>{title}</h1><p>{desc}</p></div>{action}</div>; }

function DashboardPanel({summary,dashboard,switchPanel}:any) {
  const kpis=dashboard.kpis||[]; const ranking=dashboard.ranking||[];
  return <><SectionHead title="Dashboard Operasional Bulan Ini" desc="Semua data sudah ada di browser. Klik kartu untuk pindah fitur tanpa reload." action={<button className="btn btn-primary" onClick={()=>switchPanel("input")}>+ Input Hari Ini</button>}/>
    <section className="legacy-summary-grid">
      <button className="metric-card featured" onClick={()=>switchPanel("ranking")}><div className="metric-icon">▦</div><span>Produk Dipacking</span><strong>{num(summary.totalProducts)}</strong><small>Klik untuk ranking packaging</small></button>
      <button className="metric-card" onClick={()=>switchPanel("errors")}><div className="metric-icon">□</div><span>Kesalahan Packaging</span><strong>{num(summary.packagingErrors)}</strong><small>Lihat customer & pelaksana</small></button>
      <button className="metric-card" onClick={()=>switchPanel("errors")}><div className="metric-icon">□</div><span>Kesalahan Belanja</span><strong>{num(summary.shoppingErrors)}</strong><small>Lihat rincian kesalahan</small></button>
      <button className="metric-card" onClick={()=>switchPanel("errors")}><div className="metric-icon">→</div><span>Kesalahan Pengantaran</span><strong>{num(summary.deliveryErrors)}</strong><small>Lihat customer & PJ</small></button>
      <button className="metric-card" onClick={()=>switchPanel("orders")}><div className="metric-icon">◎</div><span>Total Pesanan</span><strong>{num(summary.orders)}</strong><small>Klik untuk daftar customer</small></button>
    </section>
    <section className="card kpi-board"><div className="kpi-board-head"><div><h2>Capaian & Peringkat Per KPI</h2><p>Seluruh KPI dihitung dari database Supabase.</p></div><button className="btn btn-soft" onClick={()=>switchPanel("reports")}>Buka Laporan KPI →</button></div><div className="kpi-card-grid">{kpis.map((k:any)=><button key={k.id} className="kpi-card" onClick={()=>switchPanel("reports")}><div className="metric-icon">★</div><span>{k.name}</span><strong>{num(k.totalPoints)} <em>poin</em></strong><small>Unggul: {k.leaderName||"Belum ada capaian"}{k.leaderName?` · ${num(k.leaderPoints)} poin`:""}</small><p>Total {num(k.totalQuantity)}</p></button>)}</div></section>
    <section className="card panel leaderboard-panel"><div className="panel-title-row"><div><h2>Leaderboard Produksi Bulan Ini</h2><p className="muted">Tidak ada request tambahan saat membuka ranking.</p></div><div className="mini-stat"><span>Total poin</span><b>{num(summary.totalPoints)}</b></div></div><div className="table-wrap"><table><thead><tr><th>#</th><th>Nama</th><th>Total Poin</th><th>Produk</th></tr></thead><tbody>{ranking.map((r:any,i:number)=><tr key={r.employeeId}><td><span className={`rank-badge ${i===0?"first":""}`}>{i+1}</span></td><td><strong>{r.name}</strong></td><td>{num(r.totalPoints)}</td><td>{num(r.totalProducts)}</td></tr>)}</tbody></table></div></section>
  </>;
}

function InputPanel({tab,setTab,canWrite,today,productionEmployees,inventoryEmployees,kpis,tasks,production,inventory,busy,submitProduction,submitInventory}:any) {
  return <><div className="daily-title-row"><div className="section-head"><h1>Input Pekerjaan Harian</h1><p>Catat produksi dan inventory tanpa berpindah URL.</p></div><div className="daily-tabs"><button className={`daily-tab ${tab==="production"?"active":""}`} onClick={()=>setTab("production")}>Tim Produksi</button><button className={`daily-tab ${tab==="inventory"?"active":""}`} onClick={()=>setTab("inventory")}>Inventory</button></div></div>
    {tab==="production"?<div className="two-col daily-workspace">{canWrite?<section className="card daily-panel"><div className="daily-panel-head"><h2>Tambah Pekerjaan Produksi</h2><p>Poin otomatis dari versi KPI yang berlaku.</p></div><div className="daily-panel-body"><div className="info-note">Packaging dari Pesanan & PJ tidak perlu diinput ulang. Semua histori poin disimpan sebagai snapshot.</div><form onSubmit={submitProduction} className="form-grid"><label className="field"><span>Tanggal</span><input name="workDate" type="date" defaultValue={today} required/></label><label className="field"><span>Petugas</span><select name="employeeId" required><option value="">Pilih petugas</option>{productionEmployees.map((e:any)=><option key={e.id} value={e.id}>{e.name}</option>)}</select></label><label className="field"><span>Jenis Pekerjaan</span><select name="kpiId" required><option value="">Pilih pekerjaan</option>{kpis.map((k:any)=><option key={k.id} value={k.id}>{k.name}</option>)}</select></label><label className="field"><span>Jumlah</span><input name="quantity" type="number" min="0.01" step="0.01" required/></label><label className="field full"><span>Keterangan</span><textarea name="notes"/></label><div className="form-actions full"><button disabled={busy==="production-save"} className="btn btn-primary">{busy==="production-save"?"Menyimpan…":"+ Simpan Pekerjaan"}</button></div></form></div></section>:null}<HistoryTable rows={production.slice(0,40)} type="production"/></div>:
    <div className="two-col daily-workspace">{canWrite?<section className="card daily-panel"><div className="daily-panel-head"><h2>Input Inventory</h2><p>Checklist harian inventory.</p></div><div className="daily-panel-body"><form onSubmit={submitInventory} className="form-grid"><label className="field"><span>Tanggal</span><input name="workDate" type="date" defaultValue={today} required/></label><label className="field"><span>Petugas</span><select name="employeeId" required><option value="">Pilih petugas</option>{inventoryEmployees.map((e:any)=><option key={e.id} value={e.id}>{e.name}</option>)}</select></label><label className="field"><span>Pekerjaan</span><select name="taskId" required><option value="">Pilih pekerjaan</option>{tasks.map((t:any)=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label><label className="field"><span>Status</span><select name="workStatus"><option>Selesai</option><option>Belum selesai</option><option>Tidak ada kebutuhan</option><option>Ada kendala</option></select></label><label className="field full"><span>Keterangan</span><textarea name="notes"/></label><div className="form-actions full"><button disabled={busy==="inventory-save"} className="btn btn-primary">{busy==="inventory-save"?"Menyimpan…":"Simpan Checklist"}</button></div></form></div></section>:null}<HistoryTable rows={inventory.slice(0,40)} type="inventory"/></div>}
  </>;
}

function HistoryTable({rows,type}:any) { return <section className="card daily-panel"><div className="daily-panel-head"><h2>{type==="production"?"Riwayat Produksi":"Riwayat Inventory"}</h2><p>Data sudah dimuat sejak dashboard dibuka.</p></div><div className="table-wrap"><table><thead><tr><th>Tanggal</th><th>Nama</th><th>Pekerjaan</th><th>{type==="production"?"Jumlah":"Status"}</th><th>Keterangan</th></tr></thead><tbody>{rows.map((r:any)=><tr key={r.id}><td>{r.work_date}</td><td><strong>{r.employee_name}</strong></td><td>{type==="production"?r.kpi_name:r.task_name}</td><td>{type==="production"?`${num(r.quantity)} ${r.unit_snapshot}`:r.work_status}</td><td>{type==="production"?<strong>{num(r.total_points)} poin</strong>:(r.notes||"-")}</td></tr>)}</tbody></table></div></section>; }

function OrdersPanel({canWrite,today,employees,orders,busy,submit}:any){return <><SectionHead title="Pesanan & Penanggung Jawab" desc="Pesanan, PJ, dan alokasi packaging dalam satu panel."/>{canWrite?<section className="card panel panel-first"><h2>Tambah Pesanan</h2><form onSubmit={submit} className="form-grid"><label className="field"><span>Tanggal</span><input name="orderDate" type="date" defaultValue={today} required/></label><label className="field"><span>Customer</span><input name="customerName" required/></label><label className="field"><span>Total Produk</span><input name="totalProducts" type="number" min="1" required/></label><label className="field"><span>PJ Pesanan</span><select name="responsibleEmployeeId" required><option value="">Pilih PJ</option>{employees.map((e:any)=><option key={e.id} value={e.id}>{e.name}</option>)}</select></label><label className="field"><span>Status</span><select name="status"><option>Diproses</option><option>Siap diserahkan</option><option>Selesai</option></select></label><label className="field"><span>Catatan</span><input name="notes"/></label><div className="full allocation-box"><strong>Pembagian Packaging (1–3 petugas)</strong>{[1,2,3].map(i=><div className="allocation-grid" key={i}><select name={`employee${i}`} required={i===1}><option value="">Petugas {i}</option>{employees.map((e:any)=><option key={e.id} value={e.id}>{e.name}</option>)}</select><input name={`quantity${i}`} type="number" min={i===1?1:0} defaultValue={i===1?1:0}/></div>)}</div><div className="form-actions full"><button className="btn btn-primary" disabled={busy==="order-save"}>{busy==="order-save"?"Menyimpan…":"Simpan Pesanan + Alokasi"}</button></div></form></section>:null}<section className="card panel"><h2>Daftar Pesanan</h2><div className="table-wrap"><table><thead><tr><th>Tanggal</th><th>No.</th><th>Customer</th><th>Produk</th><th>PJ</th><th>Status</th></tr></thead><tbody>{orders.length?orders.map((r:any)=><tr key={r.id}><td>{r.order_date}</td><td><strong>{r.order_number}</strong></td><td>{r.customer_name_snapshot}</td><td>{r.total_products}</td><td>{r.responsible_name}</td><td>{r.status}</td></tr>):<tr><td colSpan={6} className="muted">Belum ada pesanan.</td></tr>}</tbody></table></div></section></>}

function AttendancePanel({canWrite,today,employees,rows,busy,submit}:any){return <><SectionHead title="Kehadiran & Jam Kedatangan" desc="Zona dihitung otomatis berdasarkan policy tim."/>{canWrite?<section className="card panel panel-first"><h2>Input Kehadiran</h2><form onSubmit={submit} className="form-grid"><label className="field"><span>Tanggal</span><input name="workDate" type="date" defaultValue={today} required/></label><label className="field"><span>Karyawan</span><select name="employeeId" required><option value="">Pilih karyawan</option>{employees.map((e:any)=><option key={e.id} value={e.id}>{e.code} · {e.name}</option>)}</select></label><label className="field"><span>Status</span><select name="status"><option>Hadir</option><option>Izin</option><option>Sakit</option><option>Alpa</option><option>Libur</option></select></label><label className="field"><span>Jam Datang</span><input name="arrivalTime" type="time"/></label><label className="field full"><span>Keterangan</span><textarea name="notes"/></label><div className="form-actions full"><button className="btn btn-primary" disabled={busy==="attendance-save"}>{busy==="attendance-save"?"Menyimpan…":"Simpan Kehadiran"}</button></div></form></section>:null}<section className="card panel"><h2>Riwayat Kehadiran</h2><div className="table-wrap"><table><thead><tr><th>Tanggal</th><th>Nama</th><th>Status</th><th>Jam</th><th>Zona</th><th>Keterangan</th></tr></thead><tbody>{rows.map((r:any)=><tr key={r.id}><td>{r.work_date}</td><td><strong>{r.employee_name}</strong></td><td>{r.attendance_status}</td><td>{r.arrival_time||"-"}</td><td>{r.zone_result||"-"}</td><td>{r.notes||"-"}</td></tr>)}</tbody></table></div></section></>}

function ErrorsPanel({canWrite,today,employees,orders,rows,busy,submit}:any){return <><SectionHead title="Komplain & Kesalahan" desc="Evaluasi terpisah dari poin produktivitas."/>{canWrite?<section className="card panel panel-first"><h2>Catat Kesalahan</h2><form onSubmit={submit} className="form-grid"><label className="field"><span>Tanggal</span><input name="errorDate" type="date" defaultValue={today} required/></label><label className="field"><span>Jenis</span><select name="errorType"><option>Packaging</option><option>Pengantaran</option><option>Belanja</option></select></label><label className="field"><span>Pesanan</span><select name="orderId"><option value="">Tanpa pesanan</option>{orders.map((o:any)=><option key={o.id} value={o.id}>{o.order_number} · {o.customer_name_snapshot}</option>)}</select></label><label className="field"><span>Customer</span><input name="customerName"/></label><label className="field"><span>Pelaksana</span><select name="performerEmployeeId"><option value="">Belum diketahui</option>{employees.map((e:any)=><option key={e.id} value={e.id}>{e.name}</option>)}</select></label><label className="field"><span>PJ</span><select name="responsibleEmployeeId"><option value="">Belum ditentukan</option>{employees.map((e:any)=><option key={e.id} value={e.id}>{e.name}</option>)}</select></label><label className="field"><span>Status Evaluasi</span><select name="evaluationStatus"><option>Menunggu evaluasi</option><option>Pelaksana diketahui</option><option>Dibebankan ke PJ</option><option>Bukan kesalahan tim</option><option>Selesai</option></select></label><label className="field"><span>Severity</span><select name="severity"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option></select></label><label className="field full"><span>Kronologi</span><textarea name="chronology" required/></label><label className="field full"><span>Keterangan</span><textarea name="notes"/></label><div className="form-actions full"><button className="btn btn-primary" disabled={busy==="error-save"}>{busy==="error-save"?"Menyimpan…":"Simpan Kesalahan"}</button></div></form></section>:null}<section className="card panel"><h2>Riwayat Kesalahan</h2><div className="table-wrap"><table><thead><tr><th>Tanggal</th><th>Jenis</th><th>Customer</th><th>Pelaksana</th><th>PJ</th><th>Status</th><th>Kronologi</th></tr></thead><tbody>{rows.map((r:any)=><tr key={r.id}><td>{r.error_date}</td><td>{r.error_type}</td><td>{r.customer_name_snapshot||"-"}</td><td>{r.performer_name||"-"}</td><td>{r.responsible_name||"-"}</td><td>{r.evaluation_status}</td><td>{r.chronology}</td></tr>)}</tbody></table></div></section></>}

function RankingPanel({rows}:any){return <><SectionHead title="Peringkat & Profil Kinerja" desc="Semua metrik dihitung dari payload yang sama, tanpa fetch baru."/><section className="card panel panel-first"><div className="table-wrap"><table><thead><tr><th>Rank</th><th>Karyawan</th><th>Total Poin</th><th>Produk</th><th>Input KPI</th><th>Hadir</th><th>Hijau</th><th>Merah</th><th>Error Pack</th><th>Error Antar</th></tr></thead><tbody>{rows.map((r:any,i:number)=><tr key={r.id}><td><span className={`rank-badge ${i===0?"first":""}`}>{i+1}</span></td><td><strong>{r.name}</strong><div className="muted small">{r.code}</div></td><td><strong>{num(r.points)}</strong></td><td>{num(r.products)}</td><td>{r.entries}</td><td>{r.hadir}</td><td>{r.green}</td><td>{r.red}</td><td>{r.pack}</td><td>{r.delivery}</td></tr>)}</tbody></table></div></section></>}

function ReportsPanel({employees,start,end,employee,setStart,setEnd,setEmployee,production,attendance,errors,orders}:any){const points=production.reduce((s:number,r:any)=>s+Number(r.total_points||0),0);const qty=production.reduce((s:number,r:any)=>s+Number(r.quantity||0),0);const hadir=attendance.filter((r:any)=>r.attendance_status==="Hadir").length;return <><SectionHead title="Laporan KPI" desc="Filter berjalan langsung di browser, tanpa request server."/><section className="card panel panel-first"><div className="filter-grid"><label className="field"><span>Tanggal Awal</span><input type="date" value={start} onChange={e=>setStart(e.target.value)}/></label><label className="field"><span>Tanggal Akhir</span><input type="date" value={end} onChange={e=>setEnd(e.target.value)}/></label><label className="field"><span>Karyawan</span><select value={employee} onChange={e=>setEmployee(e.target.value)}><option value="">Semua karyawan</option>{employees.map((e:any)=><option key={e.id} value={e.id}>{e.name}</option>)}</select></label></div></section><section className="stats report-stats"><div className="card stat"><div className="stat-label">TOTAL POIN</div><div className="stat-value">{num(points)}</div></div><div className="card stat"><div className="stat-label">TOTAL JUMLAH KPI</div><div className="stat-value">{num(qty)}</div></div><div className="card stat"><div className="stat-label">HADIR</div><div className="stat-value">{hadir}</div></div><div className="card stat"><div className="stat-label">KESALAHAN</div><div className="stat-value">{errors.length}</div></div><div className="card stat"><div className="stat-label">PESANAN</div><div className="stat-value">{orders.length}</div></div></section><HistoryTable rows={production} type="production"/></>}

function EmployeesPanel({canManage,teams,employees,busy,submit}:any){return <><SectionHead title="Manajemen Karyawan" desc="Master tim produksi dan inventory."/>{canManage?<section className="card panel panel-first"><h2>Tambah Karyawan</h2><form onSubmit={submit} className="form-grid"><label className="field"><span>Kode</span><input name="employeeCode" placeholder="KRY-005" required/></label><label className="field"><span>Nama</span><input name="name" required/></label><label className="field"><span>Tim</span><select name="teamId" required>{teams.map((t:any)=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label><label className="field"><span>Status</span><select name="status"><option value="active">Aktif</option><option value="inactive">Nonaktif</option></select></label><div className="form-actions full"><button className="btn btn-primary" disabled={busy==="employee-save"}>{busy==="employee-save"?"Menyimpan…":"Tambah Karyawan"}</button></div></form></section>:null}<section className="card panel"><h2>Daftar Karyawan</h2><div className="table-wrap"><table><thead><tr><th>Kode</th><th>Nama</th><th>Tim</th><th>Status</th></tr></thead><tbody>{employees.map((e:any)=><tr key={e.id}><td>{e.code}</td><td><strong>{e.name}</strong></td><td>{e.team}</td><td>{e.status}</td></tr>)}</tbody></table></div></section></>}

function SettingsPanel({isAdmin,bundle,busy,submitKpi,supabase,refreshBundle,setToast}:any){const [tab,setTab]=useState("system");async function updateUser(id:string,patch:any){const {error}=await supabase.from("profiles").update(patch).eq("id",id);if(error)setToast({type:"err",text:error.message});else{await refreshBundle();setToast({type:"ok",text:"Pengguna diperbarui."});}}return <><div className="daily-title-row"><SectionHead title="Pengaturan Sistem" desc="Semua konfigurasi admin tetap berada di URL yang sama."/><div className="daily-tabs settings-tabs"><button className={`daily-tab ${tab==="system"?"active":""}`} onClick={()=>setTab("system")}>Sistem</button><button className={`daily-tab ${tab==="kpi"?"active":""}`} onClick={()=>setTab("kpi")}>KPI</button>{isAdmin?<><button className={`daily-tab ${tab==="users"?"active":""}`} onClick={()=>setTab("users")}>User</button><button className={`daily-tab ${tab==="audit"?"active":""}`} onClick={()=>setTab("audit")}>Audit</button></>:null}</div></div>{tab==="system"?<div className="two-col"><section className="card panel"><h2>Policy Kehadiran</h2>{(bundle.attendancePolicies||[]).map((p:any)=><div className="setting-block" key={p.id}><strong>{p.team} · v{p.version}</strong><div className="muted small">Berlaku {p.effectiveFrom}{p.effectiveUntil?` s.d. ${p.effectiveUntil}`:" hingga sekarang"}</div><div className="zone-list">{(p.ranges||[]).map((r:any)=><span className={`zone zone-${String(r.name).toLowerCase()}`} key={r.name}>{r.name} {String(r.start).slice(0,5)}–{String(r.end).slice(0,5)}</span>)}</div></div>)}</section><section className="card panel"><h2>Target Inventory</h2>{(bundle.inventoryTargets||[]).map((t:any)=><div className="setting-block" key={t.id}><strong>{t.task}</strong><div className="muted">Target {t.target} · {t.period} · mulai {t.effectiveFrom}</div></div>)}</section></div>:null}{tab==="kpi"?<><section className="card panel panel-first"><h2>Tambah KPI + Versi Pertama</h2><form onSubmit={submitKpi} className="form-grid"><label className="field"><span>Kode</span><input name="code" required/></label><label className="field"><span>Nama KPI</span><input name="name" required/></label><label className="field"><span>Satuan</span><input name="unit" required/></label><label className="field"><span>Poin/Satuan</span><input name="points" type="number" step="0.01" required/></label><label className="field"><span>Berlaku Mulai</span><input name="effectiveFrom" type="date" defaultValue={bundle.today} required/></label><div className="form-actions"><button className="btn btn-primary" disabled={busy==="kpi-save"}>Tambah KPI</button></div></form></section><section className="card panel"><h2>Master KPI</h2><div className="table-wrap"><table><thead><tr><th>Kode</th><th>KPI</th><th>Satuan</th><th>Poin</th><th>Versi</th><th>Status</th></tr></thead><tbody>{(bundle.kpis||[]).map((k:any)=><tr key={k.id}><td>{k.code}</td><td><strong>{k.name}</strong></td><td>{k.unit}</td><td>{num(k.points)}</td><td>v{k.version}</td><td>{k.active?"Aktif":"Nonaktif"}</td></tr>)}</tbody></table></div></section></>:null}{tab==="users"?<section className="card panel panel-first"><h2>Manajemen Pengguna & RBAC</h2><div className="table-wrap"><table><thead><tr><th>Nama</th><th>Email</th><th>Role</th><th>Status</th><th>Aksi</th></tr></thead><tbody>{(bundle.users||[]).map((u:any)=><tr key={u.id}><td><strong>{u.name||"-"}</strong></td><td>{u.email}</td><td><select value={u.role} onChange={e=>updateUser(u.id,{role:e.target.value})}><option>superadmin</option><option>admin</option><option>supervisor</option><option>operator</option><option>viewer</option></select></td><td>{u.active?"Aktif":"Nonaktif"}</td><td><button className="btn btn-soft" onClick={()=>updateUser(u.id,{is_active:!u.active})}>{u.active?"Nonaktifkan":"Aktifkan"}</button></td></tr>)}</tbody></table></div></section>:null}{tab==="audit"?<section className="card panel panel-first"><h2>Audit Log</h2><div className="table-wrap"><table><thead><tr><th>Waktu</th><th>Actor</th><th>Aksi</th><th>Entitas</th><th>Source</th></tr></thead><tbody>{(bundle.audit||[]).map((a:any)=><tr key={a.id}><td>{new Date(a.created_at).toLocaleString("id-ID")}</td><td>{a.actor_name||"System"}</td><td>{a.action}</td><td>{a.entity_type}{a.entity_id?` · ${a.entity_id}`:""}</td><td>{a.source}</td></tr>)}</tbody></table></div></section>:null}</>}

function AdminPanel({bundle,busy,recordAction,bulkAction,switchPanel}:any){const modules=[{key:"production",label:"Produksi",panel:"input"},{key:"attendance",label:"Kehadiran",panel:"attendance"},{key:"inventory",label:"Inventory",panel:"input"},{key:"errors",label:"Kesalahan",panel:"errors"},{key:"orders",label:"Pesanan",panel:"orders"}];const admin=bundle.admin||{};return <><SectionHead title="Admin Control Center" desc="Kelola semua modul, pengguna, audit, penghapusan, dan pemulihan dari satu halaman."/><section className="admin-overview-grid"><button className="admin-tool-card" onClick={()=>switchPanel("settings")}><span>◎</span><strong>Pengguna & RBAC</strong><p>Aktivasi akun, role, dan hak akses.</p><b>{num(admin.users?.active)} aktif</b></button><button className="admin-tool-card" onClick={()=>switchPanel("employees")}><span>♙</span><strong>Karyawan</strong><p>Kelola identitas dan tim.</p><b>{num(admin.employees?.active)} aktif</b></button><button className="admin-tool-card" onClick={()=>switchPanel("settings")}><span>★</span><strong>Master KPI</strong><p>Nilai poin dan versi.</p><b>{num(admin.kpis?.active)} KPI</b></button><button className="admin-tool-card" onClick={()=>switchPanel("settings")}><span>⚙</span><strong>Konfigurasi</strong><p>Policy dan pengaturan umum.</p><b>Sistem</b></button><button className="admin-tool-card" onClick={()=>switchPanel("settings")}><span>▤</span><strong>Audit Log</strong><p>Jejak seluruh perubahan.</p><b>{num(admin.audit_logs)} log</b></button></section><section className="card admin-control-panel"><div className="admin-control-head"><div><h2>Kontrol Data Operasional</h2><p>Semua penghapusan adalah soft delete dan bisa dipulihkan.</p></div><div className="safe-delete-badge">↶ Bisa dipulihkan</div></div><div className="admin-data-grid">{modules.map((m:any)=>{const bucket=admin[m.key]||{};const rec=admin.records?.[m.key]||{active:[],archived:[]};return <article className="admin-data-card" key={m.key}><div className="admin-data-card-top"><div><h3>{m.label}</h3><p>Kelola record aktif dan arsip.</p></div><button onClick={()=>switchPanel(m.panel)}>Buka →</button></div><div className="admin-data-counts"><div><span>Aktif</span><strong>{num(bucket.active)}</strong></div><div><span>Arsip</span><strong>{num(bucket.archived)}</strong></div></div><div className="admin-record-manager"><div className="admin-subtitle">Record terbaru</div>{(rec.active||[]).map((r:any)=><div className="admin-record-row" key={r.id}><div><strong>{r.title}</strong><span>{r.date} · {r.meta}</span></div><button className="record-delete-btn" disabled={busy===`admin-${m.key}-${r.id}`} onClick={()=>recordAction(m.key,r.id,false)}>Hapus</button></div>)}{(rec.archived||[]).length?<><div className="admin-subtitle">Arsip terbaru</div>{rec.archived.map((r:any)=><div className="admin-record-row archived" key={r.id}><div><strong>{r.title}</strong><span>{r.date} · {r.meta}</span></div><button className="record-restore-btn" onClick={()=>recordAction(m.key,r.id,true)}>Pulihkan</button></div>)}</>:null}</div><div className="admin-bulk-row"><button className="btn btn-danger" onClick={()=>bulkAction(m.key,m.label,false)}>Arsipkan Semua</button><button className="btn btn-restore" onClick={()=>bulkAction(m.key,m.label,true)}>Pulihkan Semua</button></div></article>})}</div></section></>}
