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

function isStandalone() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(display-mode: standalone)").matches ||
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
}

function getBrowserInfo() {
  if (typeof navigator === "undefined") {
    return { android: false, ios: false, brave: false, chromeAndroid: false, samsung: false };
  }
  const ua = navigator.userAgent;
  const android = /Android/i.test(ua);
  const ios = /iPhone|iPad|iPod/i.test(ua);
  const brave = Boolean((navigator as Navigator & { brave?: unknown }).brave);
  const samsung = /SamsungBrowser/i.test(ua);
  const chromeAndroid =
    android &&
    /Chrome\//i.test(ua) &&
    !brave &&
    !samsung &&
    !/EdgA|OPR\//i.test(ua);
  return { android, ios, brave, chromeAndroid, samsung };
}

function openCurrentPageInChrome() {
  const url = new URL(window.location.href);
  const target = `${url.host}${url.pathname}${url.search}`;
  window.location.href = `intent://${target}#Intent;scheme=https;package=com.android.chrome;end`;
}

export function PwaManager() {
  const browser = useMemo(() => getBrowserInfo(), []);
  const [online, setOnline] = useState(true);
  const [installed, setInstalled] = useState(false);
  const [promptEvent, setPromptEvent] = useState<InstallPromptEvent | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const [swReady, setSwReady] = useState(false);
  const [workerFailed, setWorkerFailed] = useState(false);

  useEffect(() => {
    setOnline(navigator.onLine);
    setInstalled(isStandalone());
    document.body.classList.toggle("pwa-offline", !navigator.onLine);

    const captureEarlyPrompt = () => {
      if (window.__kpiInstallPrompt) setPromptEvent(window.__kpiInstallPrompt);
    };
    captureEarlyPrompt();

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).then(async (registration) => {
        registration.update().catch(() => undefined);
        if (registration.waiting) registration.waiting.postMessage({ type: "SKIP_WAITING" });

        const ready = await navigator.serviceWorker.ready;
        setSwReady(true);
        const worker = ready.active || registration.active;
        worker?.postMessage({
          type: "CACHE_CURRENT",
          url: window.location.pathname + window.location.search,
        });

      }).catch(() => setWorkerFailed(true));
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

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("kpi-install-ready", onEarlyPrompt);
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("kpi-install-ready", onEarlyPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, [browser.android, browser.chromeAndroid]);

  async function installApp() {
    if (installed) return;

    const nativePrompt = promptEvent || window.__kpiInstallPrompt || null;
    if (nativePrompt) {
      setPromptEvent(null);
      window.__kpiInstallPrompt = null;
      try {
        await nativePrompt.prompt();
        await nativePrompt.userChoice;
      } catch {
        setGuideOpen(true);
      }
      return;
    }

    if (browser.android && !browser.chromeAndroid) {
      openCurrentPageInChrome();
      return;
    }

    setGuideOpen(true);
  }

  const installTitle =
    browser.android && !browser.chromeAndroid && !promptEvent
      ? "Pasang via Chrome"
      : "Pasang Aplikasi";

  const installStatus = promptEvent
    ? "Siap dipasang"
    : browser.android && !browser.chromeAndroid
      ? "Buka di Chrome"
      : workerFailed
        ? "Service worker gagal"
        : swReady
          ? "Lihat panduan pemasangan"
          : "Menyiapkan…";

  return (
    <>
      {!installed ? (
        <aside className="kpi-install-dock" aria-label="Install KPI Bakul Sayur">
          <button className="kpi-install-compact" type="button" onClick={installApp} title={installTitle}>
            <span className="kpi-install-icon-wrap"><img src="/kpi-app-icon.svg" alt="" /></span>
            <span className="kpi-install-mini-copy">
              <strong>{installTitle}</strong>
              <small><i className={online ? "online" : "offline"} />{installStatus}</small>
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
            <h2>{browser.ios ? "Pasang di iPhone / iPad" : "Install KPI Bakul Sayur"}</h2>

            {browser.ios ? (
              <>
                <p>Di iPhone/iPad, PWA dipasang melalui Safari dan Add to Home Screen.</p>
                <ol>
                  <li>Buka halaman ini di <strong>Safari</strong>.</li>
                  <li>Ketuk <strong>Share</strong> lalu <strong>Add to Home Screen</strong>.</li>
                  <li>Ketuk <strong>Add</strong>.</li>
                </ol>
              </>
            ) : browser.android && browser.chromeAndroid ? (
              <>
                <p>{workerFailed ? "Service worker gagal dimuat. Periksa koneksi dan muat ulang." : "Chrome belum mengirim izin instalasi native. Status service worker saja tidak menjamin aplikasi dapat dipasang."}</p>
                <ol>
                  <li>Pastikan halaman selesai dimuat dengan internet aktif.</li>
                  <li>Buka menu Chrome <strong>⋮ → Add to home screen → Install app</strong>.</li>
                  <li>Jika tombol Instal belum tersedia, buka <a href="/install.html">halaman pemasangan KPI</a>. Jangan pilih pintasan jika ingin aplikasi standalone.</li>
                </ol>
              </>
            ) : (
              <>
                <p>Untuk instalasi Android penuh sebagai WebAPK, buka halaman ini di Chrome.</p>
                <button className="btn btn-primary kpi-install-ok" type="button" onClick={openCurrentPageInChrome}>
                  Buka di Chrome
                </button>
              </>
            )}

            {(browser.ios || (browser.android && browser.chromeAndroid)) ? (
              <button className="btn btn-primary kpi-install-ok" type="button" onClick={() => setGuideOpen(false)}>Mengerti</button>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
