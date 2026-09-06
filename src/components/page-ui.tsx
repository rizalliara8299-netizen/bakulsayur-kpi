export function PageHeader({ title, description }: { title: string; description: string }) {
  return <div className="section-head"><div><h1>{title}</h1><p>{description}</p></div></div>;
}

export function Flash({ saved, error }: { saved?: string; error?: string }) {
  if (error) return <div className="flash flash-error">{error}</div>;
  if (saved) return <div className="flash flash-success">Data berhasil disimpan.</div>;
  return null;
}

export function EmptyRow({ colSpan, text = "Belum ada data." }: { colSpan: number; text?: string }) {
  return <tr><td colSpan={colSpan} className="muted" style={{ textAlign: "center", padding: 30 }}>{text}</td></tr>;
}

export function Badge({ children, tone = "gray" }: { children: React.ReactNode; tone?: "gray" | "green" | "yellow" | "orange" | "red" | "cyan" }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function statusTone(value: string): "gray" | "green" | "yellow" | "orange" | "red" | "cyan" {
  const v = value.toLowerCase();
  if (["active","aktif","selesai","hadir","hijau","pelaksana diketahui"].includes(v)) return "green";
  if (["kuning","izin","menunggu evaluasi","belum selesai"].includes(v)) return "yellow";
  if (["oranye","sakit","ada kendala","dibebankan ke pj"].includes(v)) return "orange";
  if (["merah","alpa","inactive","nonaktif"].includes(v)) return "red";
  if (["diproses","siap diserahkan"].includes(v)) return "cyan";
  return "gray";
}

export function formatNumber(value: unknown) {
  return new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(Number(value || 0));
}
