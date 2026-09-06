import Link from "next/link";
import { redirect } from "next/navigation";
import { adminBulkArchive, adminBulkRestore } from "@/app/actions/admin";
import { PageHeader, formatNumber } from "@/components/page-ui";
import { requireUser } from "@/lib/auth";

type Bucket = { active: number; archived?: number; inactive?: number };
type AdminSnapshot = {
  production: Bucket;
  attendance: Bucket;
  inventory: Bucket;
  errors: Bucket;
  orders: Bucket;
  employees: Bucket;
  kpis: Bucket;
  users: Bucket;
  audit_logs: number;
};

const dataModules = [
  { key: "production", label: "Produksi", phrase: "HAPUS PRODUKSI", href: "/production", description: "Transaksi produksi dan poin historis." },
  { key: "attendance", label: "Kehadiran", phrase: "HAPUS KEHADIRAN", href: "/attendance", description: "Absensi, jam datang, dan zona kedatangan." },
  { key: "inventory", label: "Inventory", phrase: "HAPUS INVENTORY", href: "/inventory", description: "Checklist pekerjaan inventory." },
  { key: "errors", label: "Kesalahan", phrase: "HAPUS KESALAHAN", href: "/errors", description: "Komplain, kronologi, pelaksana, dan evaluasi." },
  { key: "orders", label: "Pesanan", phrase: "HAPUS PESANAN", href: "/orders", description: "Pesanan customer dan alokasi PJ." },
] as const;

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const params = await searchParams;
  const { supabase, profile } = await requireUser();
  const role = String(profile?.role || "");
  if (!['admin', 'superadmin'].includes(role)) redirect("/settings?error=Akses admin diperlukan");

  const { data, error } = await supabase.rpc("admin_control_snapshot");
  const snapshot = (data || null) as AdminSnapshot | null;

  return <>
    <div className="admin-page-heading">
      <PageHeader title="Admin Control Center" description="Pusat kontrol sistem, master data, pengguna, audit, dan penghapusan data dengan proteksi pemulihan." />
      <div className="admin-security-pill">◆ {role === "superadmin" ? "Superadmin" : "Admin"}</div>
    </div>

    {params.saved ? <div className="flash flash-success">{params.saved}</div> : null}
    {params.error || error ? <div className="flash flash-error">{params.error || "Admin Control belum dapat dimuat."}</div> : null}

    <section className="admin-overview-grid">
      <Link href="/users" className="admin-tool-card"><span>◎</span><strong>Pengguna & RBAC</strong><p>Aktivasi akun, role, dan hak akses.</p><b>{formatNumber(snapshot?.users?.active || 0)} aktif</b></Link>
      <Link href="/employees" className="admin-tool-card"><span>♙</span><strong>Karyawan</strong><p>Kelola identitas, tim, dan status karyawan.</p><b>{formatNumber(snapshot?.employees?.active || 0)} aktif</b></Link>
      <Link href="/kpi" className="admin-tool-card"><span>★</span><strong>Master KPI</strong><p>Nilai poin, satuan, versi, dan masa berlaku.</p><b>{formatNumber(snapshot?.kpis?.active || 0)} KPI</b></Link>
      <Link href="/settings" className="admin-tool-card"><span>⚙</span><strong>Konfigurasi Sistem</strong><p>Policy kehadiran, inventory, dan pengaturan umum.</p><b>Pengaturan</b></Link>
      <Link href="/audit" className="admin-tool-card"><span>▤</span><strong>Audit Log</strong><p>Jejak perubahan dan aktivitas administrator.</p><b>{formatNumber(snapshot?.audit_logs || 0)} log</b></Link>
    </section>

    <section className="card admin-control-panel">
      <div className="admin-control-head">
        <div><h2>Kontrol Data Operasional</h2><p>Penghapusan di sini menggunakan <strong>soft delete</strong>: data langsung hilang dari operasional tetapi tetap tersimpan dan dapat dipulihkan.</p></div>
        <div className="safe-delete-badge">↶ Bisa dipulihkan</div>
      </div>

      <div className="admin-data-grid">
        {dataModules.map((module) => {
          const bucket = snapshot?.[module.key] || { active: 0, archived: 0 };
          return <article className="admin-data-card" key={module.key}>
            <div className="admin-data-card-top"><div><h3>{module.label}</h3><p>{module.description}</p></div><Link href={module.href} prefetch={false}>Buka →</Link></div>
            <div className="admin-data-counts"><div><span>Aktif</span><strong>{formatNumber(bucket.active || 0)}</strong></div><div><span>Arsip</span><strong>{formatNumber(bucket.archived || 0)}</strong></div></div>

            <form action={adminBulkArchive} className="admin-danger-form">
              <input type="hidden" name="module" value={module.key} />
              <label><span>Untuk menghapus semua data aktif, ketik:</span><b>{module.phrase}</b></label>
              <div className="admin-danger-row"><input name="confirmation" placeholder={module.phrase} autoComplete="off" /><button className="btn btn-danger" type="submit">Hapus / Arsipkan</button></div>
            </form>

            <form action={adminBulkRestore} className="admin-restore-form">
              <input type="hidden" name="module" value={module.key} />
              <button className="btn btn-restore" type="submit" disabled={!Number(bucket.archived || 0)}>↶ Pulihkan semua arsip</button>
            </form>
          </article>;
        })}
      </div>
    </section>

    <section className="card admin-note-panel">
      <div><strong>Proteksi penghapusan aktif</strong><p>Data tidak dihapus permanen dari database. Semua aksi bulk dicatat ke Audit Log beserta jumlah record yang terdampak.</p></div>
      <Link href="/audit" className="btn btn-soft">Lihat Audit Log →</Link>
    </section>
  </>;
}
