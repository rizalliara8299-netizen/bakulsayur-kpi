"use client";

import { usePathname } from "next/navigation";
import { logout } from "@/app/actions/auth";

const copy: Record<string, { title: string; description: string }> = {
  "/production": { title: "Input kerja jadi lebih cepat.", description: "Catat aktivitas harian tanpa reload seluruh halaman." },
  "/inventory": { title: "Input kerja jadi lebih cepat.", description: "Checklist inventory tetap ringan, cepat, dan terhubung." },
  "/orders": { title: "Pesanan lebih rapi, PJ lebih jelas.", description: "Kelola pesanan dan pembagian packaging dalam satu alur." },
  "/attendance": { title: "Kedisiplinan terlihat setiap hari.", description: "Pantau kehadiran dan zona waktu tim secara konsisten." },
  "/errors": { title: "Evaluasi tanpa kehilangan konteks.", description: "Catat kesalahan, customer, pelaksana, dan tindak lanjut." },
  "/ranking": { title: "Lihat siapa yang paling konsisten.", description: "Bandingkan produktivitas, kehadiran, dan profil kinerja." },
  "/reports": { title: "Semua laporan dalam satu tempat.", description: "Filter periode dan telusuri aktivitas tim dengan cepat." },
  "/employees": { title: "Kelola tim dengan lebih mudah.", description: "Karyawan produksi dan inventory tetap sinkron ke seluruh modul." },
  "/settings": { title: "Pengaturan yang tetap sederhana.", description: "Atur KPI, akses pengguna, audit, dan konfigurasi aplikasi." },
  "/kpi": { title: "Atur KPI tanpa merusak histori.", description: "Versi poin baru berlaku ke depan, transaksi lama tetap utuh." },
  "/users": { title: "Akses pengguna tetap terkendali.", description: "Kelola role dan status akun dengan RBAC yang aman." },
  "/audit": { title: "Semua perubahan dapat ditelusuri.", description: "Audit aplikasi dan arsip legacy tersimpan terpisah." },
};

export function AppShellTopbar({ displayName, role }: { displayName: string; role: string }) {
  const pathname = usePathname();
  const page = pathname === "/dashboard"
    ? { title: `Welcome back, ${displayName || "Admin"}!`, description: "Mari pantau produktivitas dan kedisiplinan tim Bakul Sayur hari ini." }
    : copy[pathname] || { title: "KPI Bakul Sayur", description: "Manajemen KPI karyawan yang cepat dan terhubung." };
  const initials = (displayName || "Admin").split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]?.toUpperCase()).join("") || "AD";

  return (
    <header className="hero legacy-hero">
      <div className="hero-copy">
        <h1>{page.title}</h1>
        <p>{page.description}</p>
      </div>
      <div className="hero-tools">
        <button className="hero-search" type="button" aria-label="Pencarian">⌕</button>
        <div className="admin-pill">
          <div className="admin-copy"><strong>Admin Panel</strong><span>{role === "superadmin" ? "Bakul Sayur" : role}</span></div>
          <div className="admin-avatar">{initials}</div>
        </div>
        <form action={logout}><button className="hero-logout" type="submit" title="Keluar">↗</button></form>
      </div>
    </header>
  );
}
