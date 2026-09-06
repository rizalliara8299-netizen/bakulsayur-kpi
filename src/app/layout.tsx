import type { Metadata } from "next";
import "./globals.css";
import "./legacy-dashboard.css";
import "./daily-workspace.css";
import "./admin-control.css";
import "./admin-records.css";
import "./unified-app.css";
import "./inventory-revision.css";
import "./management-analytics.css";
import "./brand-polish.css";

export const metadata: Metadata = {
  title: "KPI Bakul Sayur",
  description: "Manajemen KPI Produksi, checklist Inventory, monitoring bulanan, analisis, kehadiran, dan evaluasi Bakul Sayur",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
