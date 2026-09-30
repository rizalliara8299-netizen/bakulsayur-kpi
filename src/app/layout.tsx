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
  applicationName: "KPI Bakul Sayur",
  title: "KPI Bakul Sayur",
  description: "Manajemen KPI Produksi, checklist Inventory, monitoring bulanan, analisis, kehadiran, dan evaluasi Bakul Sayur",
  appleWebApp: {
    capable: true,
    title: "KPI Bakul Sayur",
    statusBarStyle: "default",
  },
  icons: {
    icon: [
      { url: "/kpi-icon-192.png", type: "image/png", sizes: "192x192" },
      { url: "/kpi-icon-512.png", type: "image/png", sizes: "512x512" },
      { url: "/kpi-app-icon.svg", type: "image/svg+xml", sizes: "any" }
    ],
    apple: [{ url: "/kpi-icon-192.png", type: "image/png", sizes: "192x192" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#0b3b2d",
  colorScheme: "light",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              window.__kpiInstallPrompt = window.__kpiInstallPrompt || null;
              window.addEventListener('beforeinstallprompt', function(event) {
                event.preventDefault();
                window.__kpiInstallPrompt = event;
                window.dispatchEvent(new Event('kpi-install-ready'));
              });
              if ('serviceWorker' in navigator) {
                navigator.serviceWorker.register('/sw.js', { scope: '/' }).then(function(registration) {
                  if (registration.waiting) {
                    registration.waiting.postMessage({ type: 'SKIP_WAITING' });
                  }
                  var reloadKey = 'kpi-sw-controlled-v5';
                  var reloadOnce = function() {
                    if (!navigator.serviceWorker.controller && !sessionStorage.getItem(reloadKey)) {
                      sessionStorage.setItem(reloadKey, '1');
                      window.location.reload();
                    }
                  };
                  navigator.serviceWorker.ready.then(function() {
                    setTimeout(reloadOnce, 150);
                  }).catch(function(){});
                  navigator.serviceWorker.addEventListener('controllerchange', function() {
                    window.dispatchEvent(new Event('kpi-sw-ready'));
                  }, { once: true });
                }).catch(function(){});
              }
            `,
          }}
        />
      </head>
      <body>
        {children}
        <PwaManager />
        <MasterCrudEnhancer />
      </body>
    </html>
  );
}
