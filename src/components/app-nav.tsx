"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  ["/dashboard", "Dashboard"],
  ["/production", "Input Produksi"],
  ["/inventory", "Inventory"],
  ["/orders", "Pesanan & PJ"],
  ["/attendance", "Kehadiran"],
  ["/errors", "Kesalahan"],
  ["/ranking", "Peringkat & Profil"],
  ["/reports", "Laporan"],
  ["/employees", "Karyawan"],
  ["/kpi", "Master KPI"],
  ["/users", "Pengguna & RBAC"],
  ["/audit", "Audit Log"],
  ["/settings", "Pengaturan"],
];

export function AppNav() {
  const pathname = usePathname();
  return <nav>{links.map(([href,label])=><Link key={href} href={href} className={`nav-item ${pathname===href?"active":""}`}>{label}</Link>)}</nav>;
}
