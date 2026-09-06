import { requireUser } from "@/lib/auth";
import { AppNav } from "@/components/app-nav";
import { AppShellTopbar } from "@/components/app-shell-topbar";

export default async function ProtectedLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const { profile } = await requireUser();
  const displayName = profile?.display_name || "Admin";
  const role = String(profile?.role || "viewer");

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand legacy-brand" aria-label="Bakul Sayur">
          <div className="brand-logo-fallback"><span>▱</span><b>Bakul Sayur</b></div>
        </div>
        <AppNav />
        <div className="sidebar-foot">
          <strong>Bakul Sayur</strong>
          <span>Manajemen KPI Karyawan</span>
        </div>
      </aside>
      <main className="main">
        <AppShellTopbar displayName={displayName} role={role} />
        <div className="content">{children}</div>
      </main>
    </div>
  );
}
