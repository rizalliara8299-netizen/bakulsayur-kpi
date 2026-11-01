"use client";
import { useMemo,useState,type FormEvent } from "react";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import { adminCorrectAttendance } from "@/app/actions/attendance-corrections";
const zones=["Hijau","Kuning","Oranye","Merah"];
const base=[["07:45","08:14"],["08:15","08:29"],["08:30","08:44"],["08:45","23:59"]];
const short=(v:any)=>String(v||"").slice(0,5);
const policyHours=(bundle:any,name:string):string[][]=>{
 const p=[...(bundle.attendancePolicies||[])].filter((x:any)=>x.team===name)
   .sort((a:any,b:any)=>String(b.effectiveFrom).localeCompare(String(a.effectiveFrom)))[0];
 return zones.map((z,i)=>{const r=(p?.ranges||[]).find((x:any)=>x.name===z);
   return r?[short(r.start),short(r.end)]:[...base[i]];});
};
const tomorrow=()=>{const p=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Makassar",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date(Date.now()+86400000));const x=Object.fromEntries(p.map(z=>[z.type,z.value]));return [x.year,x.month,x.day].join("-");};
export function AttendanceAdminTools({rows,employees,refreshBundle,setToast}:any){
 const db=useMemo(()=>getBrowserSupabase(),[]);
 const [edit,setEdit]=useState<any>(null),[busy,setBusy]=useState(false);
 async function run(action:()=>Promise<any>,message:string){
  if(!navigator.onLine){setToast({type:"err",text:"Tidak dapat mengubah data saat offline."});return;}
  setBusy(true);
  try{const {data,error}=await action();if(error)throw error;if(data===false)throw new Error("Data tidak berubah.");
    if(!(await refreshBundle(false)))throw new Error("Perubahan diproses, tetapi sinkronisasi tampilan gagal. Muat ulang saat online.");
    setEdit(null);setToast({type:"ok",text:message});
  }catch(e:any){setToast({type:"err",text:e.message||"Gagal menyimpan."});}finally{setBusy(false);}
 }
 async function save(e:FormEvent<HTMLFormElement>){
  e.preventDefault();if(!edit)return;
  const d=new FormData(e.currentTarget);
  await run(async()=>{
    const res=await adminCorrectAttendance({
      id: edit.id,
      workDate: String(d.get("date")||""),
      employeeId: String(d.get("employee")||""),
      status: String(d.get("status")||""),
      arrivalTime: String(d.get("arrival")||"")||null,
      notes: String(d.get("notes")||"")||null,
    });
    return res.ok ? {data:true,error:null} : {data:false,error:{message:res.error}};
  },"Kehadiran diperbaiki.");
 }
 return <section className="card panel"><h2>Riwayat Kehadiran</h2>
  {edit&&<form key={edit.id} onSubmit={save} className="form-grid">
    <label className="field"><span>Tanggal</span><input name="date" type="date" defaultValue={edit.work_date} required/></label>
    <label className="field"><span>Karyawan</span><select name="employee" defaultValue={edit.employee_id}>{employees.map((x:any)=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
    <label className="field"><span>Status</span><select name="status" defaultValue={edit.attendance_status}>{["Hadir","Izin","Sakit","Alpa","Libur"].map(x=><option key={x}>{x}</option>)}</select></label>
    <label className="field"><span>Jam datang</span><input name="arrival" type="time" defaultValue={short(edit.arrival_time)}/></label>
    <label className="field full"><span>Keterangan</span><textarea name="notes" defaultValue={edit.notes||""}/></label>
    <div className="form-actions full"><button type="submit" className="btn btn-primary" disabled={busy}>Simpan Perbaikan</button><button type="button" className="btn btn-soft" onClick={()=>setEdit(null)}>Batal</button></div>
  </form>}
  <div className="table-wrap"><table><thead><tr><th>Tanggal</th><th>Nama</th><th>Status</th><th>Jam</th><th>Zona</th><th>Keterangan</th><th>Aksi</th></tr></thead>
  <tbody>{rows.map((r:any)=><tr key={r.id}><td>{r.work_date}</td><td>{r.employee_name}</td><td>{r.attendance_status}</td><td>{r.arrival_time||"-"}</td><td>{r.zone_result||"-"}</td><td>{r.notes||"-"}</td><td><button type="button" className="btn btn-soft" disabled={busy} onClick={()=>setEdit(r)}>Edit</button> <button type="button" className="btn btn-danger" disabled={busy} onClick={()=>{if(window.confirm("Arsipkan catatan ini?"))void run(()=>db.rpc("admin_soft_delete_record",{p_module:"attendance",p_id:r.id}),"Kehadiran diarsipkan.");}}>Hapus</button></td></tr>)}</tbody></table></div>
  {!rows.length&&<p className="muted">Belum ada data kehadiran.</p>}
 </section>;
}
export function AttendancePolicyOverview({bundle}:any){
 const entries=[...(bundle.attendancePolicies||[])];
 const divisionNames=["Produksi","Inventory"];
 return <section className="card panel">
  <div className="panel-title-row"><div><h2>Policy Kehadiran Karyawan</h2><p className="muted">Dua divisi, masing-masing memiliki empat zona: Hijau, Kuning, Oranye, dan Merah. Versi lama tetap tersedia untuk evaluasi bulanan.</p></div></div>
  <div className="two-col">
    {divisionNames.map((team:string)=>{
      const policies=entries.filter((p:any)=>p.team===team)
        .sort((a:any,b:any)=>String(b.effectiveFrom).localeCompare(String(a.effectiveFrom)));
      const latest=policies[0];
      const ranges=latest?zones.map((name:string,i:number)=>{
        const found=(latest.ranges||[]).find((r:any)=>r.name===name);
        return {name,start:short(found?.start)||base[i][0],end:short(found?.end)||base[i][1]};
      }):zones.map((name:string,i:number)=>({name,start:base[i][0],end:base[i][1]}));
      return <div className="setting-block" key={team}>
        <strong>{team}{latest?" · v"+latest.version:""}</strong>
        <div className="muted small">{latest?"Berlaku "+latest.effectiveFrom+(latest.effectiveUntil?" s.d. "+latest.effectiveUntil:" hingga sekarang"):"Kebijakan belum tersedia"}</div>
        <div className="zone-list">{ranges.map((r:any)=><span className={"zone zone-"+r.name.toLowerCase()} key={r.name}>{r.name} {r.start}–{r.end}</span>)}</div>
        {policies.length>1&&<div className="muted small">{policies.length} versi tersimpan untuk histori</div>}
      </div>;
    })}
  </div>
 </section>;
}
export function AttendanceZoneEditor({bundle,refreshBundle,setToast}:any){
 const db=useMemo(()=>getBrowserSupabase(),[]);
 const teams=(bundle.teams||[]).filter((t:any)=>["Produksi","Inventory"].includes(t.name))
   .sort((a:any,b:any)=>(a.name==="Produksi"?0:1)-(b.name==="Produksi"?0:1));
 const [selected,setSelected]=useState(""),[date,setDate]=useState(tomorrow),[hours,setHours]=useState<string[][]>(()=>policyHours(bundle,"Produksi")),[busy,setBusy]=useState(false);
 const teamId=selected||teams[0]?.id||"";
 const load=(name:string)=>setHours(policyHours(bundle,name));
 async function submit(e:FormEvent<HTMLFormElement>){
  e.preventDefault();if(!teamId||!navigator.onLine){setToast({type:"err",text:"Pilih divisi dan gunakan koneksi internet."});return;}
  if(!window.confirm("Buat versi kebijakan baru? Riwayat lama tetap tersimpan."))return;
  setBusy(true);
  try{const {data,error}=await db.rpc("admin_create_attendance_policy",{p_team_id:teamId,p_effective_from:date,p_ranges:zones.map((name,i)=>({name,start:hours[i][0],end:hours[i][1]}))});
   if(error)throw error;if(!(await refreshBundle(false)))throw new Error("Kebijakan tersimpan tetapi refresh tampilan gagal.");
   setToast({type:"ok",text:"Zona versi "+data+" berhasil disimpan."});
  }catch(e:any){setToast({type:"err",text:e.message||"Gagal menyimpan zona."});}finally{setBusy(false);}
 }
 return <section className="card panel"><h2>Edit Empat Zona Kehadiran</h2><p className="muted">Hijau, Kuning, Oranye, dan Merah tersedia pada Produksi maupun Inventory. Untuk menyamakan Inventory dengan Produksi, pilih Inventory lalu klik Salin Jam Produksi. Perubahan berlaku sebagai versi baru tanpa menimpa histori.</p>
  <form className="form-grid" onSubmit={submit}>
   <label className="field"><span>Divisi</span><select value={teamId} onChange={e=>{setSelected(e.target.value);load(teams.find((t:any)=>t.id===e.target.value)?.name||"");}}>{teams.map((t:any)=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
   <label className="field"><span>Berlaku mulai</span><input type="date" min={tomorrow()} value={date} onChange={e=>setDate(e.target.value)} required/></label>
   <div className="full"><button type="button" className="btn btn-soft" onClick={()=>load("Produksi")}>Salin Jam Produksi</button> <button type="button" className="btn btn-soft" onClick={()=>load(teams.find((t:any)=>t.id===teamId)?.name||"")}>Salin Jam Divisi</button></div>
   {zones.map((zone,i)=><label key={zone} className="field"><span>{zone}</span><div style={{display:"flex",alignItems:"center",gap:6}}><input aria-label={zone+" mulai"} type="time" required value={hours[i][0]} onChange={e=>setHours(old=>old.map((v,j)=>j===i?[e.target.value,v[1]]:v))}/><span>–</span><input aria-label={zone+" akhir"} type="time" required value={hours[i][1]} onChange={e=>setHours(old=>old.map((v,j)=>j===i?[v[0],e.target.value]:v))}/></div></label>)}
   <div className="form-actions full"><button disabled={busy||!teamId} className="btn btn-primary">Simpan Zona Baru</button></div>
  </form>

 </section>;
}
