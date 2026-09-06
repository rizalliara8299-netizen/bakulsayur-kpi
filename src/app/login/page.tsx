import Link from "next/link";
import { login } from "@/app/actions/auth";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; message?: string }> }) {
  const params = await searchParams;
  return (
    <main className="login-page">
      <section className="card login-card">
        <div className="brand" style={{ marginBottom: 18 }}>
          <div className="brand-mark">BS</div>
          <div><strong>Bakul Sayur</strong><div className="muted">KPI Employee System</div></div>
        </div>
        <h1 style={{ margin: 0 }}>Masuk ke Dashboard</h1>
        <p className="muted">Gunakan akun yang telah terdaftar pada sistem KPI Bakul Sayur.</p>
        <form action={login}>
          <div className="field"><label>Email</label><input name="email" type="email" required autoComplete="email" /></div>
          <div className="field"><label>Password</label><input name="password" type="password" required autoComplete="current-password" /></div>
          {params.error ? <div className="error">{params.error}</div> : null}
          {params.message ? <div style={{ marginTop: 14, padding: "10px 12px", borderRadius: 10, color: "#117642", background: "#e8f8ef", fontSize: 13 }}>{params.message}</div> : null}
          <button className="primary" type="submit">Masuk</button>
        </form>
        <p className="muted" style={{ textAlign: "center", marginBottom: 0 }}>Belum punya akun? <Link href="/register" style={{ color: "#0696da", fontWeight: 800 }}>Daftar</Link></p>
      </section>
    </main>
  );
}
