import Link from "next/link";
import { resendConfirmation, signUp } from "@/app/actions/auth";

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const params = await searchParams;

  return (
    <main className="login-page">
      <section className="card login-card">
        <div className="brand" style={{ marginBottom: 18 }}>
          <div className="brand-mark">BS</div>
          <div>
            <strong>Bakul Sayur</strong>
            <div className="muted">KPI Employee System</div>
          </div>
        </div>

        <h1 style={{ margin: 0 }}>Buat Akun</h1>
        <p className="muted">Akun baru masuk sebagai Viewer. Akun pertama dapat mengaktifkan Superadmin setelah login.</p>

        {params.message ? <div className="flash flash-success">{params.message}</div> : null}
        {params.error ? <div className="error" style={{ marginBottom: 14 }}>{params.error}</div> : null}

        <form action={signUp}>
          <div className="field"><label>Nama</label><input name="name" type="text" required autoComplete="name" /></div>
          <div className="field"><label>Email</label><input name="email" type="email" required autoComplete="email" /></div>
          <div className="field"><label>Password</label><input name="password" type="password" minLength={8} required autoComplete="new-password" /></div>
          <button className="primary" type="submit">Daftar</button>
        </form>

        <div style={{ margin: "22px 0", borderTop: "1px solid #e6ecf3" }} />
        <p className="muted" style={{ marginBottom: 8 }}>
          Sudah mendaftar tetapi belum terverifikasi? Kirim ulang email verifikasi setelah cooldown berakhir.
        </p>
        <form action={resendConfirmation}>
          <div className="field"><label>Email terdaftar</label><input name="email" type="email" required autoComplete="email" /></div>
          <button className="primary" type="submit" style={{ marginTop: 12 }}>Kirim Ulang Verifikasi</button>
        </form>

        <p className="muted" style={{ textAlign: "center", marginBottom: 0, marginTop: 18 }}>
          Sudah punya akun? <Link href="/login" style={{ color: "#0696da", fontWeight: 800 }}>Masuk</Link>
        </p>
      </section>
    </main>
  );
}
