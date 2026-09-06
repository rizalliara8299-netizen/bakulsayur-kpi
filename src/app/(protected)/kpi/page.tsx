import { addKpiVersion, createKpi } from "@/app/actions/core";
import { Badge, EmptyRow, Flash, PageHeader, formatNumber } from "@/components/page-ui";
import { canManageMaster, requireUser } from "@/lib/auth";

export default async function KpiPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const params = await searchParams;
  const { supabase, profile } = await requireUser();
  const { data: kpis } = await supabase.from("kpis").select("id,kpi_code,name,is_active,kpi_versions(id,version_no,unit,points_per_unit,effective_from,effective_until)").order("kpi_code");
  const manageable = canManageMaster(profile?.role);
  const today = new Date().toISOString().slice(0,10);
  return <>
    <PageHeader title="Master KPI Produksi" description="Poin menggunakan versioning agar histori transaksi tidak berubah saat master diperbarui." />
    <Flash saved={params.saved} error={params.error} />
    {manageable ? <div className="two-col">
      <section className="card panel panel-first"><h2>Tambah KPI</h2><form action={createKpi} className="form-grid one-col">
        <label className="field"><span>Kode</span><input name="code" placeholder="KPI-011" required /></label>
        <label className="field"><span>Nama Pekerjaan</span><input name="name" required /></label>
        <label className="field"><span>Satuan</span><input name="unit" placeholder="kegiatan" required /></label>
        <label className="field"><span>Poin / Satuan</span><input name="points" type="number" min="0" step="0.01" required /></label>
        <label className="field"><span>Mulai Berlaku</span><input name="effectiveFrom" type="date" defaultValue={today} required /></label>
        <button className="btn btn-primary">Simpan KPI</button>
      </form></section>
      <section className="card panel panel-first"><h2>Versi Poin Baru</h2><form action={addKpiVersion} className="form-grid one-col">
        <label className="field"><span>KPI</span><select name="kpiId" required><option value="">Pilih KPI</option>{(kpis||[]).map(k=><option key={k.id} value={k.id}>{k.kpi_code} · {k.name}</option>)}</select></label>
        <label className="field"><span>Satuan</span><input name="unit" required /></label>
        <label className="field"><span>Poin Baru</span><input name="points" type="number" min="0" step="0.01" required /></label>
        <label className="field"><span>Mulai Berlaku</span><input name="effectiveFrom" type="date" required /></label>
        <button className="btn btn-dark">Buat Versi Baru</button>
      </form></section>
    </div> : null}
    <section className="card panel"><h2>Daftar KPI & Versi Aktif</h2><div className="table-wrap"><table><thead><tr><th>Kode</th><th>Pekerjaan</th><th>Versi</th><th>Satuan</th><th>Poin</th><th>Berlaku</th><th>Status</th></tr></thead><tbody>{(kpis||[]).length ? (kpis||[]).map(k=>{const versions=(k.kpi_versions||[]).slice().sort((a,b)=>b.version_no-a.version_no);const v=versions.find(x=>!x.effective_until)||versions[0];return <tr key={k.id}><td>{k.kpi_code}</td><td><strong>{k.name}</strong></td><td>v{v?.version_no||"-"}</td><td>{v?.unit||"-"}</td><td><strong>{formatNumber(v?.points_per_unit)}</strong></td><td>{v?.effective_from||"-"}</td><td><Badge tone={k.is_active?"green":"red"}>{k.is_active?"Aktif":"Nonaktif"}</Badge></td></tr>}) : <EmptyRow colSpan={7} />}</tbody></table></div></section>
  </>;
}
