import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/kpi-bakul-sayur",
    name: "KPI Bakul Sayur",
    short_name: "Bakul KPI",
    description: "Dashboard KPI, produksi, inventory, kehadiran, evaluasi, dan monitoring Bakul Sayur.",
    start_url: "/pwa-start",
    scope: "/",
    display: "standalone",
    display_override: ["window-controls-overlay", "standalone"],
    background_color: "#f5f8f6",
    theme_color: "#0b3b2d",
    orientation: "any",
    lang: "id",
    dir: "ltr",
    prefer_related_applications: false,
    categories: ["business", "productivity"],
    icons: [
      { src: "/kpi-icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/kpi-icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/kpi-icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Dashboard KPI", short_name: "Dashboard", url: "/dashboard" },
      { name: "Input Harian", short_name: "Input", url: "/dashboard?panel=input" },
      { name: "Monitoring", short_name: "Laporan", url: "/dashboard?panel=reports" },
    ],
  };
}
