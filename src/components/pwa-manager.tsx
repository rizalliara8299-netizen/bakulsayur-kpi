"use client";

import { useEffect, useMemo, useState } from "react";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

function standalone() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(display-mode: standalone)").matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
}

function iosDevice() {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export function PwaManager() {
  const [online, setOnline] = useState(true);
  const [installed, setInstalled] = useState(false);
  const [promptEvent, setPromptEvent] = useState<InstallPromptEvent | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const isIOS = useMemo(() => iosDevice(), []);

  useEffect(() => {
    setOnline(navigator.onLine);
    setInstalled(standalone());
    document.body.classList.toggle("pwa-offline", !navigator.onLine);

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).then((registration) => {
        registration.update().catch(() => undefined);
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
      setPromptEvent(event as InstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setPromptEvent(null);
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
    window.addEventListener("appinstalled", onInstalled);
    document.addEventListener("click", onDocumentClick, true);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      document.removeEventListener("click", onDocumentClick, true);
    };
  }, []);

  async function installApp() {
    if (installed) return;
    if (promptEvent) {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      if (choice.outcome === "accepted") setPromptEvent(null);
      return;
    }
    setGuideOpen(true);
  }

  return (
    <>
      {!installed ? (
        <aside className="kpi-install-dock" aria-label="Install KPI Bakul Sayur">
          <div className="kpi-install-icon-wrap"><img src="/kpi-app-icon.svg" alt="" /></div>
          <div className="kpi-install-copy">
            <span>KPI BAKUL SAYUR APP</span>
            <strong>Pasang dashboard di perangkat</strong>
            <small><i className={online ? "online" : "offline"} />{online ? "Cloud aktif · siap offline" : "Mode offline · data terakhir tersedia"}</small>
          </div>
          <button type="button" onClick={installApp}>{isIOS ? "Pasang Aplikasi" : "Install Aplikasi"} <b>↓</b></button>
        </aside>
      ) : (
        <div className={"kpi-network-pill " + (online ? "online" : "offline")} aria-live="polite">
          <i />{online ? "Cloud tersinkron" : "Mode offline"}
        </div>
      )}

      {guideOpen ? (
        <div className="kpi-install-overlay" role="dialog" aria-modal="true" aria-label="Panduan install">
          <div className="kpi-install-guide">
            <button className="kpi-install-close" type="button" onClick={() => setGuideOpen(false)} aria-label="Tutup">×</button>
            <img src="/kpi-app-icon.svg" alt="KPI Bakul Sayur" />
            <span>INSTALL KPI DASHBOARD</span>
            <h2>{isIOS ? "Pasang di iPhone / iPad" : "Pasang KPI Bakul Sayur"}</h2>
            <p>{isIOS ? "Safari menggunakan Add to Home Screen untuk memasang web app." : "Jika prompt install browser belum muncul, pasang lewat menu browser."}</p>
            <ol>
              {isIOS ? (
                <>
                  <li>Ketuk tombol <strong>Share</strong> di Safari.</li>
                  <li>Pilih <strong>Add to Home Screen</strong>.</li>
                  <li>Ketuk <strong>Add</strong>. Ikon KPI Bakul Sayur akan muncul di Home Screen.</li>
                </>
              ) : (
                <>
                  <li>Buka menu browser.</li>
                  <li>Pilih <strong>Install app</strong> atau <strong>Add to Home Screen</strong>.</li>
                  <li>Konfirmasi pemasangan KPI Bakul Sayur.</li>
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
