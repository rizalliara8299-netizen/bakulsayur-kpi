"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
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

export function AppNav({ role }: { role: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isAdmin = role === "admin" || role === "superadmin";

  useEffect(() => {
    setPending(false);
  }, [pathname]);

  function schedulePrefetch(href: string) {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => router.prefetch(href), 180);
  }

  function cancelPrefetch() {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
  }

  function navLink(item: (typeof links)[number]) {
    const isActive = item.active.some((path) => pathname === path || pathname.startsWith(`${path}/`));
    return (
      <Link
        key={item.href}
        href={item.href}
        prefetch={false}
        onMouseEnter={() => schedulePrefetch(item.href)}
        onMouseLeave={cancelPrefetch}
        onFocus={() => schedulePrefetch(item.href)}
        onBlur={cancelPrefetch}
        onClick={() => { if (!isActive) setPending(true); }}
        className={`nav-item ${isActive ? "active" : ""}`}
      >
        <span className="nav-icon" aria-hidden="true">{item.icon}</span>
        <span>{item.label}</span>
      </Link>
    );
  }

  const adminItem = { href: "/admin", label: "Admin Control", icon: "◆", active: ["/admin"] };

  return (
    <>
      <div className={`global-route-progress ${pending ? "active" : ""}`} aria-hidden="true" />
      <nav className="primary-nav" aria-label="Menu utama">
        <div className="nav-caption">MENU UTAMA</div>
        {links.map(navLink)}
        {isAdmin ? <>
          <div className="nav-caption nav-caption-admin">ADMIN</div>
          {navLink(adminItem)}
        </> : null}
      </nav>
    </>
  );
}
