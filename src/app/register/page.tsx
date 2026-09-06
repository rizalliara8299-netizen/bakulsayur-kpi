import Link from "next/link";
import { signUp } from "@/app/actions/auth";

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams;
  return (
    <main className="login-page">
      <section className="card login-card">
        <div className="brand" style={{ marginBottom: 18 }}>
          <div className="brand-mark">BS</div>
          <div><strong>Bakul Sayur</strong><div className="muted">KPI Employee System</div></div>
        </div>
        <h1 style={{ margin: 0 }}>Buat Akun</h1>
        <p className="muted">Akun baru masuk sebagai Viewer. Akun pertama dapat mengaktifkan Superadmin setelah login.</p>
        <form action={signUp}>
          <div className="field"><label>Nama</label><input name="name" type="text" required autoComplete="name" /></div>
          <div className="field"><label>Email</label><input name="email" type="email" required autoComplete="email" /></div>
          <div className="field"><label>Password</label><input name="password" type="password" minLength={8} required autoComplete="new-password" /></div>
          {params.error ? <div className="error">{params.error}</div> : null}
          <button className="primary" type="submit">Daftar</button>
        </form>
        <p className="muted" style={{ textAlign: "center", marginBottom: 0 }}>Sudah punya akun? <Link href="/login" style={{ color: "#0696da", fontWeight: 800 }}>Masuk</Link></p>
      </section>
    </main>
  );
}
