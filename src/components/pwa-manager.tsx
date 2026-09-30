"use client";

import { useEffect, useMemo, useState } from "react";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

declare global {
  interface Window {
    __kpiInstallPrompt?: InstallPromptEvent | null;
  }
}

function standalone() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(display-mode: standalone)").matches ||
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
}

function iosDevice() {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function braveDevice() {
  if (typeof navigator === "undefined") return false;
  return Boolean((navigator as Navigator & { brave?: unknown }).brave);
}

export function PwaManager() {
  const [online, setOnline] = useState(true);
  const [installed, setInstalled] = useState(false);
  const [promptEvent, setPromptEvent] = useState<InstallPromptEvent | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const isIOS = useMemo(() => iosDevice(), []);
  const isBrave = useMemo(() => braveDevice(), []);

  useEffect(() => {
    setOnline(navigator.onLine);
    setInstalled(standalone());
    document.body.classList.toggle("pwa-offline", !navigator.onLine);

    const captureEarlyPrompt = () => {
      if (window.__kpiInstallPrompt) setPromptEvent(window.__kpiInstallPrompt);
    };
    captureEarlyPrompt();

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).then(async (registration) => {
        registration.update().catch(() => undefined);
        if (registration.waiting) registration.waiting.postMessage({ type: "SKIP_WAITING" });
        const ready = await navigator.serviceWorker.ready;
        const worker = ready.active || registration.active;
        worker?.postMessage({
          type: "CACHE_CURRENT",
          url: window.location.pathname + window.location.search,
        });
      }).catch(() => undefined);
    }

    const onOnline = () => {
      setOnline(true);
      document.body.classList.remove("pwa-offline");
    };
    const onOffline = () => {
      setOnline(false);
      document.body.classList.add("pwa-offline");
    };
    const onPrompt = (event: Event) => {
      event.preventDefault();
      const prompt = event as InstallPromptEvent;
      window.__kpiInstallPrompt = prompt;
      setPromptEvent(prompt);
    };
    const onEarlyPrompt = () => captureEarlyPrompt();
    const onInstalled = () => {
      setInstalled(true);
      setPromptEvent(null);
      window.__kpiInstallPrompt = null;
      setGuideOpen(false);
    };
    const onDocumentClick = (event: MouseEvent) => {
      const target = event.target as Element | null;
      if (target?.closest(".hero-logout") && navigator.serviceWorker?.controller) {
        navigator.serviceWorker.controller.postMessage({ type: "CLEAR_PRIVATE" });
      }
    };

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("kpi-install-ready", onEarlyPrompt);
    window.addEventListener("appinstalled", onInstalled);
    document.addEventListener("click", onDocumentClick, true);

    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("kpi-install-ready", onEarlyPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      document.removeEventListener("click", onDocumentClick, true);
    };
  }, []);

  async function installApp() {
    if (installed) return;
    const availablePrompt = promptEvent || window.__kpiInstallPrompt || null;
    if (availablePrompt) {
      await availablePrompt.prompt();
      const choice = await availablePrompt.userChoice;
      if (choice.outcome === "accepted") {
        setPromptEvent(null);
        window.__kpiInstallPrompt = null;
      }
      return;
    }
    setGuideOpen(true);
  }

  return (
    <>
      {!installed ? (
        <aside className="kpi-install-dock" aria-label="Install KPI Bakul Sayur">
          <button className="kpi-install-compact" type="button" onClick={installApp} title="Install KPI Bakul Sayur">
            <span className="kpi-install-icon-wrap"><img src="/kpi-app-icon.svg" alt="" /></span>
            <span className="kpi-install-mini-copy">
              <strong>{promptEvent ? "Install KPI" : "Pasang KPI"}</strong>
              <small><i className={online ? "online" : "offline"} />{promptEvent ? "Siap install" : online ? "Siap offline" : "Offline"}</small>
            </span>
            <b aria-hidden="true">↓</b>
          </button>
        </aside>
      ) : (
        <div className={"kpi-network-pill " + (online ? "online" : "offline")} aria-live="polite">
          <i />{online ? "Cloud aktif" : "Offline"}
        </div>
      )}

      {guideOpen ? (
        <div className="kpi-install-overlay" role="dialog" aria-modal="true" aria-label="Panduan install">
          <div className="kpi-install-guide">
            <button className="kpi-install-close" type="button" onClick={() => setGuideOpen(false)} aria-label="Tutup">×</button>
            <img src="/kpi-app-icon.svg" alt="KPI Bakul Sayur" />
            <span>INSTALL KPI DASHBOARD</span>
            <h2>{isIOS ? "Pasang di iPhone / iPad" : "Pasang KPI Bakul Sayur"}</h2>
            <p>{isIOS
              ? "Safari menggunakan Add to Home Screen untuk memasang web app."
              : isBrave
                ? "Brave dapat memasang PWA dari menu browser jika prompt native belum muncul."
                : "Jika prompt native belum tersedia, gunakan menu browser untuk memasang aplikasi."}</p>
            <ol>
              {isIOS ? (
                <>
                  <li>Ketuk tombol <strong>Share</strong> di Safari.</li>
                  <li>Pilih <strong>Add to Home Screen</strong>.</li>
                  <li>Ketuk <strong>Add</strong>. Ikon KPI Bakul Sayur akan muncul di Home Screen.</li>
                </>
              ) : (
                <>
                  <li>Pastikan halaman ini sudah selesai dimuat satu kali dengan koneksi aktif.</li>
                  <li>{isBrave ? <>Di Brave, buka menu browser lalu pilih <strong>Install KPI Bakul Sayur</strong> / <strong>Install app</strong>.</> : <>Buka menu browser lalu pilih <strong>Install app</strong> atau <strong>Add to Home Screen</strong>.</>}</li>
                  <li>Setelah terpasang, buka aplikasi dari ikon KPI Bakul Sayur.</li>
                </>
              )}
            </ol>
            <button className="btn btn-primary kpi-install-ok" type="button" onClick={() => setGuideOpen(false)}>Mengerti</button>
          </div>
        </div>
      ) : null}
    </>
  );
}
