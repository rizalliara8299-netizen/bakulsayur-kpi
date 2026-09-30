import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "KPI Bakul Sayur",
    short_name: "Bakul KPI",
    description: "Dashboard KPI, produksi, inventory, kehadiran, evaluasi, dan monitoring Bakul Sayur.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#f7f9f6",
    theme_color: "#0b3b2d",
    icons: [
      {
        src: "/kpi-icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/kpi-icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/kpi-icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
