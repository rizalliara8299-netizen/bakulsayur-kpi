"use client";
import { useMemo,useState,type FormEvent } from "react";
import { getBrowserSupabase } from "@/lib/supabase/browser";
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
  await run(()=>db.rpc("admin_update_attendance_entry",{p_id:edit.id,p_work_date:String(d.get("date")),p_employee_id:String(d.get("employee")),p_status:String(d.get("status")),p_arrival_time:String(d.get("arrival")||"")||null,p_notes:String(d.get("notes")||"")||null}),"Kehadiran diperbaiki.");
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
  <tbody>{rows.map((r:any)=><tr key={r.id}><td>{r.work_date}</td><td>{r.employee_name}</td><td>{r.attendance_status}</td><td>{r.arrival_time||"-"}</td><td>{r.zone_result||"-"}</td><td>{r.notes||"-"}</td><td><button type="button" className="btn btn-soft" disabled={busy} onClick={()=>setEdit(r)}>Edit</button> <button type="button" className="btn btn-danger" disabled={busy} onClick={()=>{if(window.confirm("Arsipkan catatan ini?"))void run(()=>db.rpc("admin_archive_attendance_entry",{p_id:r.id}),"Kehadiran diarsipkan.");}}>Hapus</button></td></tr>)}</tbody></table></div>
  {!rows.length&&<p className="muted">Belum ada data kehadiran.</p>}
 </section>;
}
export function AttendancePolicyOverview({bundle}:any){
 const entries=[...(bundle.attendancePolicies||[])];
 const teamNames=(bundle.teams||[]).map((t:any)=>String(t.name)).filter((n:string)=>n!=="Admin");
 const known=["Produksi","Inventory",...teamNames.filter((n:string)=>!["Produksi","Inventory"].includes(n))].slice(0,4);
 const slots=[...known,...Array.from({length:Math.max(0,4-known.length)},(_,i)=>"Jenis "+(known.length+i+1)+" — belum diberi nama")];
 const prod=policyHours(bundle,"Produksi");
 return <section className="card panel">
  <div className="panel-title-row"><div><h2>Policy Kehadiran Karyawan</h2><p className="muted">Empat jenis policy, masing-masing memiliki empat zona. Kebijakan yang belum dibuat ditandai sebagai rancangan.</p></div></div>
  <div className="two-col">
   {slots.map((name:string,index:number)=>{
     const historical=entries.filter((p:any)=>p.team===name).sort((a:any,b:any)=>String(b.effectiveFrom).localeCompare(String(a.effectiveFrom)));
     const policy=historical[0];
     const isPending=!policy;
     const ranges=policy?zones.map((zone,i)=>{const r=(policy.ranges||[]).find((x:any)=>x.name===zone);return {name:zone,start:r?short(r.start):prod[i][0],end:r?short(r.end):prod[i][1]};}):zones.map((zone,i)=>({name:zone,start:prod[i][0],end:prod[i][1]}));
     return <div className="setting-block" key={name}>
      <strong>{index+1}. {name}{policy?" · v"+policy.version:""}</strong>
      <div className="muted small">{policy?"Berlaku "+policy.effectiveFrom+(policy.effectiveUntil?" s.d. "+policy.effectiveUntil:" hingga sekarang"):"Belum aktif · contoh zona mengikuti Produksi"}</div>
      <div className="zone-list">{ranges.map((r:any)=><span className={"zone zone-"+r.name.toLowerCase()} key={r.name}>{r.name} {r.start}–{r.end}</span>)}</div>
     </div>;
   })}
  </div>
 </section>;
}
export function AttendanceZoneEditor({bundle,refreshBundle,setToast}:any){
 const db=useMemo(()=>getBrowserSupabase(),[]);
 const teams=(bundle.teams||[]).filter((t:any)=>t.name!=="Admin").sort((a:any,b:any)=>{
  const rank=(n:string)=>n==="Produksi"?0:n==="Inventory"?1:2;
  return rank(a.name)-rank(b.name)||String(a.name).localeCompare(String(b.name));
 });
 const [selected,setSelected]=useState(""),[date,setDate]=useState(tomorrow),[hours,setHours]=useState<string[][]>(()=>policyHours(bundle,"Produksi")),[busy,setBusy]=useState(false);
 const [nameThree,setNameThree]=useState(""),[nameFour,setNameFour]=useState("");
 const teamId=selected||teams[0]?.id||"";
 const load=(name:string)=>setHours(policyHours(bundle,name));
 async function createRemaining(e:FormEvent<HTMLFormElement>){
   e.preventDefault();
   if(teams.length!==2){setToast({type:"err",text:"Jenis policy sudah berubah. Segarkan dashboard sebelum melanjutkan."});return;}
   if(!navigator.onLine){setToast({type:"err",text:"Koneksi internet diperlukan."});return;}
   const first=nameThree.trim(), second=nameFour.trim();
   if(!first||!second||first.toLowerCase()===second.toLowerCase()){
      setToast({type:"err",text:"Masukkan dua nama jenis policy yang berbeda."});return;
   }
   if(!window.confirm("Buat dua jenis policy baru memakai jam Produksi, serta samakan jam Inventory untuk tanggal efektif baru? Data lama tidak diubah."))return;
   setBusy(true);
   try{
     const {error}=await db.rpc("admin_create_remaining_attendance_types",
      {p_name_three:first,p_name_four:second,p_effective_from:date});
     if(error)throw error;
     if(!(await refreshBundle(false)))throw new Error("Tersimpan, tetapi data terbaru belum dapat dimuat. Silakan refresh.");
     setNameThree("");setNameFour("");
     setToast({type:"ok",text:"Empat jenis policy telah dibuat. Jam dua jenis baru dan Inventory mengikuti Produksi."});
   }catch(err:any){setToast({type:"err",text:err.message||"Gagal menambah policy."});}
   finally{setBusy(false);}
 }

 async function submit(e:FormEvent<HTMLFormElement>){
  e.preventDefault();if(!teamId||!navigator.onLine){setToast({type:"err",text:"Pilih divisi dan gunakan koneksi internet."});return;}
  if(!window.confirm("Buat versi kebijakan baru? Riwayat lama tetap tersimpan."))return;
  setBusy(true);
  try{const {data,error}=await db.rpc("admin_create_attendance_policy",{p_team_id:teamId,p_effective_from:date,p_ranges:zones.map((name,i)=>({name,start:hours[i][0],end:hours[i][1]}))});
   if(error)throw error;if(!(await refreshBundle(false)))throw new Error("Kebijakan tersimpan tetapi refresh tampilan gagal.");
   setToast({type:"ok",text:"Zona versi "+data+" berhasil disimpan."});
  }catch(e:any){setToast({type:"err",text:e.message||"Gagal menyimpan zona."});}finally{setBusy(false);}
 }
 return <section className="card panel"><h2>Edit Zona Waktu Kehadiran</h2><p className="muted">Perubahan berlaku mulai tanggal baru, tanpa mengubah hasil historis.</p>
  <form className="form-grid" onSubmit={submit}>
   <label className="field"><span>Divisi</span><select value={teamId} onChange={e=>{setSelected(e.target.value);load(teams.find((t:any)=>t.id===e.target.value)?.name||"");}}>{teams.map((t:any)=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
   <label className="field"><span>Berlaku mulai</span><input type="date" min={tomorrow()} value={date} onChange={e=>setDate(e.target.value)} required/></label>
   <div className="full"><button type="button" className="btn btn-soft" onClick={()=>load("Produksi")}>Salin Jam Produksi</button> <button type="button" className="btn btn-soft" onClick={()=>load(teams.find((t:any)=>t.id===teamId)?.name||"")}>Salin Jam Divisi</button></div>
   {zones.map((zone,i)=><label key={zone} className="field"><span>{zone}</span><div style={{display:"flex",alignItems:"center",gap:6}}><input aria-label={zone+" mulai"} type="time" required value={hours[i][0]} onChange={e=>setHours(old=>old.map((v,j)=>j===i?[e.target.value,v[1]]:v))}/><span>–</span><input aria-label={zone+" akhir"} type="time" required value={hours[i][1]} onChange={e=>setHours(old=>old.map((v,j)=>j===i?[v[0],e.target.value]:v))}/></div></label>)}
   <div className="form-actions full"><button disabled={busy||!teamId} className="btn btn-primary">Simpan Zona Baru</button></div>
  </form>
  {teams.length===2 && <form className="form-grid" onSubmit={createRemaining} style={{marginTop:20}}>
   <div className="full"><h3>Lengkapi Empat Jenis Policy</h3><p className="muted">Beri nama dua jenis tambahan. Keduanya otomatis menggunakan empat zona jam Produksi. Inventory juga mendapatkan versi baru dengan jam yang sama, tanpa mengubah penilaian lama.</p></div>
   <label className="field"><span>Nama jenis ke-3</span><input required maxLength={60} value={nameThree} placeholder="Masukkan nama divisi / jenis" onChange={e=>setNameThree(e.target.value)}/></label>
   <label className="field"><span>Nama jenis ke-4</span><input required maxLength={60} value={nameFour} placeholder="Masukkan nama divisi / jenis" onChange={e=>setNameFour(e.target.value)}/></label>
   <div className="form-actions full"><button className="btn btn-primary" disabled={busy}>Buat Dua Jenis dengan Jam Produksi</button></div>
  </form>}
 </section>;
}
