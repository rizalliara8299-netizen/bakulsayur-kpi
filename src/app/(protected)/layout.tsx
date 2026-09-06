import { logout } from "@/app/actions/auth";
import { requireUser } from "@/lib/auth";
import { AppNav } from "@/components/app-nav";

export default async function ProtectedLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const { profile } = await requireUser();
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark">BS</div><div><strong>Bakul Sayur</strong><div style={{ color: "#8d8d8d", fontSize: 11 }}>KPI Employee System</div></div></div>
        <AppNav />
      </aside>
      <main className="main">
        <header className="hero compact-hero">
          <div style={{ display: "flex", justifyContent: "space-between", gap: 20, alignItems: "flex-start" }}>
            <div><h1>KPI Bakul Sayur</h1><p>{profile?.display_name || "Pengguna"} · {profile?.role || "viewer"}</p></div>
            <form action={logout}><button type="submit" className="ghost-button">Keluar</button></form>
          </div>
        </header>
        <div className="content">{children}</div>
      </main>
    </div>
  );
}
