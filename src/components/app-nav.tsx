"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const links = [
  { href: "/dashboard", label: "Dashboard", icon: "▦", active: ["/dashboard"] },
  { href: "/production", label: "Input Harian", icon: "+", active: ["/production", "/inventory"] },
  { href: "/orders", label: "Pesanan & PJ", icon: "□", active: ["/orders"] },
  { href: "/attendance", label: "Kehadiran", icon: "◷", active: ["/attendance"] },
  { href: "/errors", label: "Kesalahan", icon: "!", active: ["/errors"] },
  { href: "/ranking", label: "Peringkat & Profil", icon: "★", active: ["/ranking"] },
  { href: "/reports", label: "Laporan", icon: "▤", active: ["/reports"] },
  { href: "/employees", label: "Karyawan", icon: "♙", active: ["/employees"] },
  { href: "/settings", label: "Pengaturan", icon: "⚙", active: ["/settings", "/kpi", "/users", "/audit"] },
];

export function AppNav() {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <nav className="primary-nav" aria-label="Menu utama">
      <div className="nav-caption">MENU UTAMA</div>
      {links.map((item) => {
        const isActive = item.active.some((path) => pathname === path || pathname.startsWith(`${path}/`));
        return (
          <Link
            key={item.href}
            href={item.href}
            prefetch={false}
            onMouseEnter={() => router.prefetch(item.href)}
            onFocus={() => router.prefetch(item.href)}
            className={`nav-item ${isActive ? "active" : ""}`}
          >
            <span className="nav-icon" aria-hidden="true">{item.icon}</span>
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
