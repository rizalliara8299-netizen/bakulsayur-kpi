"use client";

import { useEffect, useState } from "react";

export default function PwaStartPage() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const go = () => {
      if (navigator.onLine) {
        window.location.replace("/dashboard");
      } else {
        setOffline(true);
      }
    };
    const timer = window.setTimeout(go, 160);
    window.addEventListener("online", go);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("online", go);
    };
  }, []);

  return (
    <main style={{
      minHeight: "100dvh",
      display: "grid",
      placeItems: "center",
      padding: 24,
      background: "linear-gradient(145deg,#f6faf7,#e8f3ec)",
      color: "#153b2f",
      fontFamily: "Inter,system-ui,sans-serif",
    }}>
      <section style={{
        width: "min(360px,100%)",
        textAlign: "center",
        padding: "28px 24px",
        borderRadius: 26,
        background: "#fff",
        border: "1px solid #d8e8de",
        boxShadow: "0 28px 70px rgba(12,58,43,.14)",
      }}>
        <img src="/kpi-app-icon.svg" alt="KPI Bakul Sayur" style={{ width: 84, height: 84 }} />
        <div style={{ marginTop: 10, color: "#0a7750", fontSize: 10, fontWeight: 900, letterSpacing: ".16em" }}>BAKUL SAYUR</div>
        <h1 style={{ margin: "7px 0 4px", fontSize: 24, letterSpacing: "-.04em" }}>KPI Dashboard</h1>
        <p style={{ margin: 0, color: "#6d7b74", fontSize: 12, lineHeight: 1.55 }}>
          {offline ? "Mode offline aktif. Buka data terakhir yang sudah pernah dimuat." : "Menyiapkan dashboard…"}
        </p>
        {offline ? (
          <button
            type="button"
            onClick={() => window.location.replace("/dashboard")}
            style={{
              marginTop: 18,
              minHeight: 42,
              padding: "0 16px",
              border: 0,
              borderRadius: 12,
              color: "#fff",
              background: "#08734c",
              fontWeight: 800,
            }}
          >
            Buka Data Terakhir
          </button>
        ) : null}
      </section>
    </main>
  );
}
