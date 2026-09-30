import type { Metadata, Viewport } from "next";
import { PwaManager } from "@/components/pwa-manager";
import { MasterCrudEnhancer } from "@/components/master-crud-enhancer";
import "./globals.css";
import "./legacy-dashboard.css";
import "./daily-workspace.css";
import "./admin-control.css";
import "./admin-records.css";
import "./unified-app.css";
import "./inventory-revision.css";
import "./management-analytics.css";
import "./brand-polish.css";
import "./master-crud.css";
import "./professional-dashboard.css";
import "./pwa-kpi-premium.css";

export const metadata: Metadata = {
  title: "KPI Bakul Sayur",
  description: "Manajemen KPI Produksi, checklist Inventory, monitoring bulanan, analisis, kehadiran, dan evaluasi Bakul Sayur",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: "/kpi-app-icon.svg", type: "image/svg+xml", sizes: "any" }],
    apple: [{ url: "/kpi-app-icon.svg", type: "image/svg+xml" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#0b3b2d",
  colorScheme: "light",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id">
      <body>
        {children}
        <PwaManager />
        <MasterCrudEnhancer />
      </body>
    </html>
  );
}
