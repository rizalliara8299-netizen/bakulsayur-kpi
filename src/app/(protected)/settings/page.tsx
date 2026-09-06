import { Badge, PageHeader } from "@/components/page-ui";
import { requireUser } from "@/lib/auth";

export default async function SettingsPage() {
  const { supabase } = await requireUser();
  const [{ data: policies }, { data: targets }, { data: settings }] = await Promise.all([
    supabase.from("attendance_policies").select("id,version_no,effective_from,effective_until,is_active,teams(name),attendance_zone_ranges(zone_name,start_time,end_time,sort_order)").order("effective_from",{ascending:false}),
    supabase.from("inventory_targets").select("id,period_type,target_count,effective_from,effective_until,inventory_tasks(name)").order("effective_from",{ascending:false}),
    supabase.from("app_settings").select("setting_key,setting_value"),
  ]);
  return <>
    <PageHeader title="Pengaturan Sistem" description="Konfigurasi operasional disimpan terstruktur dan versioned, bukan lagi satu JSON Apps Script." />
    <div className="two-col">
      <section className="card panel panel-first"><h2>Policy Kehadiran</h2>{(policies||[]).map(p=>{const team=Array.isArray(p.teams)?p.teams[0]:p.teams;const ranges=(p.attendance_zone_ranges||[]).slice().sort((a,b)=>a.sort_order-b.sort_order);return <div className="setting-block" key={p.id}><div className="setting-title"><strong>{team?.name||"Tim"} · v{p.version_no}</strong><Badge tone={p.is_active?"green":"gray"}>{p.is_active?"Aktif":"Arsip"}</Badge></div><div className="muted small">Berlaku {p.effective_from}{p.effective_until?` s.d. ${p.effective_until}`:" hingga sekarang"}</div><div className="zone-list">{ranges.map(z=><span key={z.zone_name} className={`zone zone-${z.zone_name.toLowerCase()}`}>{z.zone_name} {String(z.start_time).slice(0,5)}–{String(z.end_time).slice(0,5)}</span>)}</div></div>})}</section>
      <section className="card panel panel-first"><h2>Target Inventory</h2>{(targets||[]).map(t=>{const task=Array.isArray(t.inventory_tasks)?t.inventory_tasks[0]:t.inventory_tasks;return <div className="setting-block" key={t.id}><strong>{task?.name||"Task"}</strong><div className="muted">Target {t.target_count} · {t.period_type} · mulai {t.effective_from}</div></div>})}<h2 style={{marginTop:26}}>General</h2><pre className="json-box">{JSON.stringify(settings||[],null,2)}</pre></section>
    </div>
  </>;
}
