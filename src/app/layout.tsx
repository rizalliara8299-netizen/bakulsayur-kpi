import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "KPI Bakul Sayur",
  description: "Manajemen KPI, kehadiran, pesanan, inventory, dan evaluasi Bakul Sayur",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
