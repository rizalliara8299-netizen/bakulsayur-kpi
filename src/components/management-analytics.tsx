"use client";

import { useEffect, useMemo, useState } from "react";

const doneStatuses = new Set(["Selesai", "Tidak ada kebutuhan"]);

type PropsBase = { supabase: any; today: string; isAdmin?: boolean; displayName?: string };

function n(v: any) { return Number(v || 0); }
function num(v: any) { return new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(n(v)); }
function clamp(v: number, min = 0, max = 100) { return Math.max(min, Math.min(max, v)); }
function pct(a: number, b: number) { return b > 0 ? Math.round((a / b) * 100) : 0; }
function delta(current: number, previous: number) {
  if (!previous) return current ? 100 : 0;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}
function monthLabel(value: string) {
  const d = new Date(`${String(value).slice(0, 7)}-01T00:00:00`);
  return new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric" }).format(d);
}
function shortMonth(value: string) {
  const d = new Date(`${String(value).slice(0, 7)}-01T00:00:00`);
  return new Intl.DateTimeFormat("id-ID", { month: "short" }).format(d);
}
function signed(v: number) { return `${v > 0 ? "+" : ""}${v}%`; }
function uniqueCount(rows: any[], key: (x: any) => string) { return new Set(rows.map(key).filter(Boolean)).size; }

function inventoryStats(data: any, current = true) {
  const inventory = current ? (data.inventory || []) : (data.inventoryPrevious || []);
  const attendance = current ? (data.attendance || []) : (data.attendancePrevious || []);
  const activeTasks = (data.tasks || []).filter((t: any) => t.active);
  const activeIds = new Set(activeTasks.map((t: any) => t.id));
  const filtered = inventory.filter((r: any) => activeIds.has(r.task_id));
  const presentDays = new Set(
    attendance
      .filter((r: any) => (r.team === "Inventory" || !current) && r.attendance_status === "Hadir")
      .map((r: any) => `${r.work_date}|${r.employee_id}`),
  );
  const fallbackDays = new Set(filtered.map((r: any) => `${r.work_date}|${r.employee_id}`));
  const employeeDays = presentDays.size || fallbackDays.size;
  const expected = employeeDays * activeTasks.length;
  const completed = filtered.filter((r: any) => doneStatuses.has(r.work_status)).length;
  const issues = filtered.filter((r: any) => r.work_status === "Ada kendala" || r.work_status === "Belum selesai").length;
  return { expected, completed, issues, recorded: filtered.length, missing: Math.max(0, expected - filtered.length), compliance: expected ? pct(completed, expected) : 0 };
}

function deriveSummary(data: any) {
  const production = data.production || [];
  const previousProduction = data.productionPrevious || [];
  const attendance = data.attendance || [];
  const previousAttendance = data.attendancePrevious || [];
  const errors = data.errors || [];
  const previousErrors = data.errorsPrevious || [];
  const employees = data.employees || [];

  const points = production.reduce((s: number, r: any) => s + n(r.total_points), 0);
  const prevPoints = previousProduction.reduce((s: number, r: any) => s + n(r.total_points), 0);
  const entries = production.length;
  const prevEntries = previousProduction.length;
  const products = production.filter((r: any) => String(r.kpi_name).toLowerCase() === "packaging").reduce((s: number, r: any) => s + n(r.quantity), 0);
  const prevProducts = previousProduction.filter((r: any) => String(r.kpi_name).toLowerCase() === "packaging").reduce((s: number, r: any) => s + n(r.quantity), 0);

  const hadir = attendance.filter((r: any) => r.attendance_status === "Hadir").length;
  const prevHadir = previousAttendance.filter((r: any) => r.attendance_status === "Hadir").length;
  const green = attendance.filter((r: any) => r.zone_result === "Hijau").length;
  const prevGreen = previousAttendance.filter((r: any) => r.zone_result === "Hijau").length;
  const attendanceRate = attendance.length ? pct(hadir, attendance.length) : 0;
  const prevAttendanceRate = previousAttendance.length ? pct(prevHadir, previousAttendance.length) : 0;
  const punctuality = hadir ? pct(green, hadir) : 0;
  const prevPunctuality = prevHadir ? pct(prevGreen, prevHadir) : 0;

  const inv = inventoryStats(data, true);
  const prevInv = inventoryStats(data, false);

  const prodPresent = new Set(attendance.filter((r: any) => r.team === "Produksi" && r.attendance_status === "Hadir").map((r: any) => `${r.work_date}|${r.employee_id}`));
  const prodEntered = new Set(production.map((r: any) => `${r.work_date}|${r.employee_id}`));
  let matchedProd = 0;
  prodPresent.forEach(k => { if (prodEntered.has(k)) matchedProd++; });
  const productionCoverage = prodPresent.size ? pct(matchedProd, prodPresent.size) : (entries ? 100 : 0);

  const activeEmployees = employees.filter((e: any) => e.status === "active").length;
  const attendanceDays = uniqueCount(attendance, (r: any) => r.work_date);
  const attendancePairs = uniqueCount(attendance, (r: any) => `${r.work_date}|${r.employee_id}`);
  const attendanceExpected = attendanceDays * activeEmployees;
  const attendanceCoverage = attendanceExpected ? Math.min(100, pct(attendancePairs, attendanceExpected)) : (attendance.length ? 100 : 0);
  const completenessParts = [productionCoverage, attendanceCoverage];
  if (inv.expected) completenessParts.push(inv.compliance);
  const completeness = completenessParts.length ? Math.round(completenessParts.reduce((a, b) => a + b, 0) / completenessParts.length) : 0;

  const byEmployee = new Map<string, any>();
  for (const e of employees.filter((x: any) => x.team === "Produksi" && x.status === "active")) byEmployee.set(e.id, { id: e.id, name: e.name, code: e.code, points: 0, entries: 0, products: 0 });
  for (const r of production) {
    const x = byEmployee.get(r.employee_id); if (!x) continue;
    x.points += n(r.total_points); x.entries++;
    if (String(r.kpi_name).toLowerCase() === "packaging") x.products += n(r.quantity);
  }
  const employeeRows = [...byEmployee.values()].sort((a, b) => b.points - a.points || b.products - a.products);
  const topEmployee = employeeRows[0] || null;

  const byKpi = new Map<string, any>();
  for (const r of production) {
    const key = r.kpi_id || r.kpi_name;
    const x = byKpi.get(key) || { id: key, name: r.kpi_name, points: 0, quantity: 0, entries: 0 };
    x.points += n(r.total_points); x.quantity += n(r.quantity); x.entries++;
    byKpi.set(key, x);
  }
  const kpiRows = [...byKpi.values()].sort((a, b) => b.points - a.points);

  const errorCount = errors.length;
  const prevErrorCount = previousErrors.length;
  const prodIndex = prevPoints > 0 ? clamp((points / prevPoints) * 100) : (points > 0 ? 100 : 0);
  const errorControl = prevErrorCount > 0 ? clamp(100 - Math.max(0, ((errorCount - prevErrorCount) / prevErrorCount) * 100)) : (errorCount === 0 ? 100 : clamp(100 - errorCount * 15));
  const scoreParts = [
    { value: prodIndex, weight: 25, available: points > 0 || prevPoints > 0 },
    { value: attendanceRate, weight: 30, available: attendance.length > 0 },
    { value: inv.compliance, weight: 25, available: inv.expected > 0 },
    { value: errorControl, weight: 20, available: production.length > 0 || errorCount > 0 || prevErrorCount > 0 },
  ].filter(x => x.available);
  const health = scoreParts.length ? Math.round(scoreParts.reduce((s, x) => s + x.value * x.weight, 0) / scoreParts.reduce((s, x) => s + x.weight, 0)) : 0;

  return {
    points, prevPoints, pointDelta: delta(points, prevPoints), entries, prevEntries, products, prevProducts,
    hadir, prevHadir, attendanceRate, prevAttendanceRate, punctuality, prevPunctuality,
    inv, prevInv, errors: errorCount, prevErrors: prevErrorCount,
    productionCoverage, attendanceCoverage, completeness, employeeRows, topEmployee, kpiRows, health,
  };
}

function buildInsights(s: any) {
  const strengths: string[] = [];
  const attention: string[] = [];
  const recommendations: string[] = [];

  if (s.pointDelta > 0) strengths.push(`Produktivitas naik ${Math.abs(s.pointDelta)}% dibanding periode pembanding yang setara.`);
  if (s.attendanceRate >= 90) strengths.push(`Tingkat hadir berada di ${s.attendanceRate}%, menunjukkan pencatatan kehadiran yang kuat.`);
  if (s.punctuality >= 85) strengths.push(`Ketepatan zona Hijau mencapai ${s.punctuality}% dari kehadiran.`);
  if (s.inv.expected && s.inv.compliance >= 90) strengths.push(`Compliance checklist Inventory mencapai ${s.inv.compliance}% tanpa menggunakan sistem poin.`);
  if (s.errors <= s.prevErrors && s.prevErrors > 0) strengths.push(`Jumlah kesalahan tidak meningkat dibanding periode pembanding (${s.errors} vs ${s.prevErrors}).`);
  if (s.topEmployee) strengths.push(`${s.topEmployee.name} menjadi kontributor poin Produksi terbesar pada periode ini.`);

  if (s.pointDelta < -10) attention.push(`Poin Produksi turun ${Math.abs(s.pointDelta)}% dibanding periode pembanding. Perlu ditinjau KPI yang paling banyak turun.`);
  if (s.attendanceRate < 90 && s.hadir + (s.prevHadir || 0) > 0) attention.push(`Tingkat hadir ${s.attendanceRate}% masih di bawah ambang monitoring 90%.`);
  if (s.punctuality < 80 && s.hadir > 0) attention.push(`Proporsi zona Hijau baru ${s.punctuality}% dari kehadiran; pola keterlambatan perlu ditinjau.`);
  if (s.inv.expected && s.inv.compliance < 90) attention.push(`Checklist Inventory baru ${s.inv.compliance}% lengkap; terdapat ${s.inv.missing} item belum tercatat.`);
  if (s.inv.issues > 0) attention.push(`Terdapat ${s.inv.issues} checklist Inventory berstatus kendala/belum selesai.`);
  if (s.errors > s.prevErrors) attention.push(`Kesalahan meningkat dari ${s.prevErrors} menjadi ${s.errors} kasus pada periode pembanding yang setara.`);
  if (s.completeness < 90) attention.push(`Kelengkapan data operasional terukur ${s.completeness}%; interpretasi performa perlu mempertimbangkan data yang belum lengkap.`);

  if (s.pointDelta < 0) recommendations.push("Review KPI dengan kontribusi turun terbesar dan cocokkan dengan volume pekerjaan aktual sebelum menyimpulkan penyebab.");
  if (s.attendanceRate < 90 || s.punctuality < 80) recommendations.push("Lakukan review pola kehadiran per karyawan dan hari, lalu tindak lanjuti keterlambatan yang berulang.");
  if (s.inv.expected && (s.inv.compliance < 95 || s.inv.issues > 0)) recommendations.push("Fokus pada agenda Inventory yang paling sering belum diisi/kendala dan pastikan closing checklist dilakukan sebelum pulang.");
  if (s.errors > 0) recommendations.push("Kelompokkan kesalahan berdasarkan jenis dan pelaksana/PJ untuk mencari pola berulang, bukan hanya menghitung jumlah kasus.");
  if (s.completeness < 95) recommendations.push("Lengkapi data yang belum tercatat sebelum laporan difinalisasi atau periode ditutup.");

  while (strengths.length < 3) strengths.push("Data periode ini sudah dapat digunakan sebagai baseline untuk pemantauan tren berikutnya.");
  while (attention.length < 3) attention.push("Belum ada anomali besar lain yang terdeteksi dari indikator yang tersedia.");
  while (recommendations.length < 3) recommendations.push("Pertahankan monitoring mingguan agar perubahan performa terlihat sebelum akhir bulan.");
  return { strengths: strengths.slice(0, 4), attention: attention.slice(0, 5), recommendations: recommendations.slice(0, 5) };
}

function downloadBlob(content: BlobPart, type: string, filename: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function xml(v: any) { return String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
function excelCell(v: any, header = false) {
  const isNumber = typeof v === "number" && Number.isFinite(v);
  return `<Cell${header ? ' ss:StyleID="Header"' : ""}><Data ss:Type="${isNumber ? "Number" : "String"}">${xml(v)}</Data></Cell>`;
}
function workbookSheet(name: string, rows: any[][]) {
  return `<Worksheet ss:Name="${xml(name.slice(0, 31))}"><Table>${rows.map((r, ri) => `<Row>${r.map(v => excelCell(v, ri === 0)).join("")}</Row>`).join("")}</Table></Worksheet>`;
}
function downloadManagementExcel(data: any, s: any, insights: any) {
  const production = data.production || [], attendance = data.attendance || [], inventory = data.inventory || [], errors = data.errors || [];
  const sheets = [
    workbookSheet("Ringkasan", [
      ["LAPORAN BULANAN BAKUL SAYUR", monthLabel(data.period?.start || "")],
      ["Indikator", "Nilai", "Perbandingan"],
      ["Operational Health (indikator)", s.health, "Bukan KPI karyawan"],
      ["Total Poin Produksi", s.points, signed(s.pointDelta)],
      ["Produk Packaging", s.products, `Sebelumnya ${s.prevProducts}`],
      ["Kehadiran", `${s.attendanceRate}%`, `Sebelumnya ${s.prevAttendanceRate}%`],
      ["Ketepatan Zona Hijau", `${s.punctuality}%`, `Sebelumnya ${s.prevPunctuality}%`],
      ["Compliance Inventory", `${s.inv.compliance}%`, `${s.inv.missing} belum diisi`],
      ["Kesalahan", s.errors, `Sebelumnya ${s.prevErrors}`],
      ["Kelengkapan Data", `${s.completeness}%`, "Coverage operasional"],
    ]),
    workbookSheet("Insight", [["Kategori", "Analisis"], ...insights.strengths.map((x: string) => ["Kekuatan", x]), ...insights.attention.map((x: string) => ["Perlu Perhatian", x]), ...insights.recommendations.map((x: string) => ["Rekomendasi", x])]),
    workbookSheet("Karyawan", [["Kode", "Nama", "Poin", "Input KPI", "Produk Packaging"], ...s.employeeRows.map((r: any) => [r.code, r.name, r.points, r.entries, r.products])]),
    workbookSheet("KPI", [["KPI", "Poin", "Jumlah", "Jumlah Input"], ...s.kpiRows.map((r: any) => [r.name, r.points, r.quantity, r.entries])]),
    workbookSheet("Produksi", [["Tanggal", "Kode", "Karyawan", "KPI", "Jumlah", "Satuan", "Poin/Satuan", "Total Poin", "Keterangan"], ...production.map((r: any) => [r.work_date, r.employee_code, r.employee_name, r.kpi_name, n(r.quantity), r.unit_snapshot, n(r.points_per_unit_snapshot), n(r.total_points), r.notes || ""])]),
    workbookSheet("Kehadiran", [["Tanggal", "Kode", "Karyawan", "Tim", "Status", "Jam Datang", "Zona", "Keterangan"], ...attendance.map((r: any) => [r.work_date, r.employee_code, r.employee_name, r.team, r.attendance_status, r.arrival_time || "", r.zone_result || "", r.notes || ""])]),
    workbookSheet("Inventory", [["Tanggal", "Karyawan", "Agenda", "Status", "Keterangan"], ...inventory.map((r: any) => [r.work_date, r.employee_name, r.task_name, r.work_status, r.notes || ""])]),
    workbookSheet("Kesalahan", [["Tanggal", "Jenis", "Customer", "Pelaksana", "PJ", "Severity", "Status Evaluasi", "Kronologi", "Keterangan"], ...errors.map((r: any) => [r.error_date, r.error_type, r.customer_name_snapshot || "", r.performer_name || "", r.responsible_name || "", r.severity, r.evaluation_status, r.chronology, r.notes || ""])]),
  ];
  const content = `<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Styles><Style ss:ID="Header"><Font ss:Bold="1"/><Interior ss:Color="#DFF4ED" ss:Pattern="Solid"/></Style></Styles>${sheets.join("")}</Workbook>`;
  downloadBlob(content, "application/vnd.ms-excel;charset=utf-8", `Laporan_Bakul_Sayur_${String(data.period?.start || "periode").slice(0, 7)}.xls`);
}

function ascii(v: string) { return v.normalize("NFKD").replace(/[^\x20-\x7E]/g, "").replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)"); }
function wrapText(text: string, max = 86) {
  const words = ascii(text).split(/\s+/); const lines: string[] = []; let line = "";
  for (const word of words) { const next = line ? `${line} ${word}` : word; if (next.length > max && line) { lines.push(line); line = word; } else line = next; }
  if (line) lines.push(line); return lines;
}
function buildPdf(title: string, lines: string[]) {
  const pageLines: string[][] = []; let page: string[] = [];
  for (const line of lines) { for (const wrapped of wrapText(line, 88)) { if (page.length >= 43) { pageLines.push(page); page = []; } page.push(wrapped); } }
  if (page.length || !pageLines.length) pageLines.push(page);
  const objects: string[] = [];
  const pageNums = pageLines.map((_, i) => 5 + i * 2);
  objects[1] = `<< /Type /Catalog /Pages 2 0 R >>`;
  objects[2] = `<< /Type /Pages /Kids [${pageNums.map(x => `${x} 0 R`).join(" ")}] /Count ${pageNums.length} >>`;
  objects[3] = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`;
  objects[4] = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>`;
  pageLines.forEach((ls, i) => {
    const pageObj = 5 + i * 2, contentObj = pageObj + 1;
    let stream = `q 0.08 0.48 0.32 rg 0 790 595 52 re f Q\nBT /F2 18 Tf 42 812 Td (${ascii(title)}) Tj ET\nBT /F1 9 Tf 42 796 Td (Bakul Sayur - Management Report) Tj ET\n`;
    let y = 760;
    for (const raw of ls) {
      const heading = raw.startsWith("## "); const text = heading ? raw.slice(3) : raw;
      stream += `BT /${heading ? "F2" : "F1"} ${heading ? 11 : 9.5} Tf 42 ${y} Td (${ascii(text)}) Tj ET\n`;
      y -= heading ? 21 : 15;
    }
    stream += `BT /F1 8 Tf 42 28 Td (Halaman ${i + 1} dari ${pageLines.length}) Tj ET`;
    objects[pageObj] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentObj} 0 R >>`;
    objects[contentObj] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  });
  let pdf = "%PDF-1.4\n"; const offsets: number[] = [0];
  for (let i = 1; i < objects.length; i++) { offsets[i] = pdf.length; pdf += `${i} 0 obj\n${objects[i]}\nendobj\n`; }
  const xref = pdf.length; pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let i = 1; i < objects.length; i++) pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return pdf;
}
function downloadManagementPdf(data: any, s: any, insights: any) {
  const lines = [
    `Periode: ${monthLabel(data.period?.start || "")}`,
    `Perbandingan: ${monthLabel(data.period?.previousStart || "")} (${data.period?.previousStart} s.d. ${data.period?.previousEnd})`,
    "",
    "## RINGKASAN EKSEKUTIF",
    `Operational Health: ${s.health}/100 (indikator manajemen, bukan KPI karyawan).`,
    `Produksi: ${num(s.points)} poin, perubahan ${signed(s.pointDelta)} dibanding periode pembanding yang setara.`,
    `Kehadiran: ${s.attendanceRate}% hadir; ${s.punctuality}% dari kehadiran berada pada zona Hijau.`,
    `Inventory: compliance ${s.inv.compliance}% dengan ${s.inv.missing} item belum tercatat dan ${s.inv.issues} kendala/belum selesai.`,
    `Kesalahan: ${s.errors} kasus; periode pembanding ${s.prevErrors} kasus.`,
    `Kelengkapan data operasional: ${s.completeness}%.`,
    "",
    "## KEKUATAN",
    ...insights.strengths.map((x: string, i: number) => `${i + 1}. ${x}`),
    "",
    "## PERLU PERHATIAN",
    ...insights.attention.map((x: string, i: number) => `${i + 1}. ${x}`),
    "",
    "## REKOMENDASI",
    ...insights.recommendations.map((x: string, i: number) => `${i + 1}. ${x}`),
    "",
    "## PERINGKAT PRODUKSI",
    ...s.employeeRows.slice(0, 10).map((r: any, i: number) => `${i + 1}. ${r.name} - ${num(r.points)} poin - ${num(r.products)} produk Packaging`),
    "",
    "## KPI PRODUKSI",
    ...s.kpiRows.map((r: any) => `${r.name}: ${num(r.points)} poin; jumlah ${num(r.quantity)}; ${r.entries} input.`),
    "",
    "Catatan analisis: hubungan antar indikator dibaca sebagai pola/asosiasi. Laporan tidak mengklaim sebab-akibat tanpa bukti tambahan.",
  ];
  downloadBlob(buildPdf(`Laporan Bulanan - ${monthLabel(data.period?.start || "")}`, lines), "application/pdf", `Laporan_Bakul_Sayur_${String(data.period?.start || "periode").slice(0, 7)}.pdf`);
}

function DeltaChip({ value, inverse = false }: { value: number; inverse?: boolean }) {
  const good = inverse ? value <= 0 : value >= 0;
  return <span className={`analytics-delta ${good ? "good" : "bad"}`}>{signed(value)}</span>;
}

export function ManagementReportsPanel({ supabase, today, isAdmin, displayName }: PropsBase) {
  const [period, setPeriod] = useState(today.slice(0, 7));
  const [live, setLive] = useState<any>(null);
  const [snapshot, setSnapshot] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  async function load(target = period) {
    setLoading(true); setMessage(null); setSnapshot(null);
    const { data, error } = await supabase.rpc("get_management_analytics", { p_period: `${target}-01` });
    if (error) { setMessage(error.message); setLoading(false); return; }
    setLive(data);
    if (data?.closing?.status === "closed") {
      const frozen = await supabase.rpc("get_monthly_report_snapshot", { p_period: `${target}-01` });
      if (!frozen.error && frozen.data) setSnapshot(frozen.data);
    }
    setLoading(false);
  }
  useEffect(() => { load(period); }, [period]);

  const data = snapshot || live;
  const summary = useMemo(() => data ? deriveSummary(data) : null, [data]);
  const insights = useMemo(() => summary ? buildInsights(summary) : null, [summary]);

  async function closePeriod() {
    if (!summary || !live) return;
    if (summary.completeness < 90 && !window.confirm(`Kelengkapan data baru ${summary.completeness}%. Tetap tutup periode?`)) return;
    if (!window.confirm(`Tutup periode ${monthLabel(`${period}-01`)}? Setelah ditutup, data Produksi, Kehadiran, Inventory, dan Kesalahan pada bulan ini dikunci.`)) return;
    const note = window.prompt("Catatan closing (opsional):") || null;
    const { error } = await supabase.rpc("close_monthly_period", { p_period: `${period}-01`, p_note: note });
    if (error) setMessage(error.message); else { setMessage("Periode ditutup dan snapshot final berhasil dibuat."); await load(period); }
  }
  async function reopenPeriod() {
    const reason = window.prompt("Alasan membuka kembali periode (disarankan untuk audit):") || null;
    if (!window.confirm(`Buka kembali ${monthLabel(`${period}-01`)} untuk koreksi data?`)) return;
    const { error } = await supabase.rpc("reopen_monthly_period", { p_period: `${period}-01`, p_note: reason });
    if (error) setMessage(error.message); else { setMessage("Periode dibuka kembali. Snapshot lama tetap tersimpan di histori."); await load(period); }
  }

  if (loading) return <section className="card analytics-loading"><strong>Memuat Monitoring & Analisis Bulanan…</strong><span>Menghitung produksi, kehadiran, Inventory, kesalahan, dan periode pembanding.</span></section>;
  if (!data || !summary || !insights) return <section className="card analytics-loading error">{message || "Analisis belum dapat dimuat."}</section>;

  const trend = data.trend6 || [];
  const maxTrend = Math.max(1, ...trend.map((x: any) => n(x.points)));
  const closing = live?.closing;
  const isClosed = closing?.status === "closed";

  return <div className="analytics-page">
    <div className="analytics-title-row">
      <div><h1>Monitoring & Analisis Bulanan</h1><p>Ringkasan manajemen, tren, insight, laporan lengkap, dan closing periode dalam satu halaman.</p></div>
      <div className="analytics-period"><label>Periode<input type="month" value={period} max={today.slice(0, 7)} onChange={e => setPeriod(e.target.value)} /></label><button onClick={() => load(period)}>↻ Refresh</button></div>
    </div>

    {message ? <div className="analytics-message">{message}</div> : null}
    <section className={`analytics-final-banner ${isClosed ? "closed" : "open"}`}>
      <div><span>{isClosed ? "● PERIODE FINAL" : "● PERIODE AKTIF"}</span><strong>{monthLabel(data.period.start)}</strong><small>{snapshot ? `Menampilkan snapshot final v${live?.snapshotMeta?.version || 1}` : "Menampilkan data operasional terbaru"}</small></div>
      <div className="analytics-export-actions"><button onClick={() => downloadManagementPdf(data, summary, insights)}>↓ PDF Lengkap</button><button onClick={() => downloadManagementExcel(data, summary, insights)}>↓ Excel Lengkap</button>{isAdmin ? (isClosed ? <button className="warning" onClick={reopenPeriod}>Buka Kembali</button> : <button className="primary" onClick={closePeriod}>Tutup Periode</button>) : null}</div>
    </section>

    <section className="analytics-kpi-grid">
      <article className="analytics-health-card"><span>OPERATIONAL HEALTH</span><strong>{summary.health}<small>/100</small></strong><p>Indikator manajemen, bukan poin KPI karyawan.</p><div className="health-track"><i style={{ width: `${summary.health}%` }} /></div></article>
      <article><span>POIN PRODUKSI</span><strong>{num(summary.points)}</strong><div><DeltaChip value={summary.pointDelta} /> <small>vs periode setara</small></div></article>
      <article><span>KEHADIRAN</span><strong>{summary.attendanceRate}%</strong><div><DeltaChip value={summary.attendanceRate - summary.prevAttendanceRate} /> <small>poin persentase</small></div></article>
      <article><span>COMPLIANCE INVENTORY</span><strong>{summary.inv.expected ? `${summary.inv.compliance}%` : "N/A"}</strong><div><small>{summary.inv.missing} belum diisi · {summary.inv.issues} kendala</small></div></article>
      <article><span>KESALAHAN</span><strong>{summary.errors}</strong><div><DeltaChip value={delta(summary.errors, summary.prevErrors)} inverse /> <small>vs periode setara</small></div></article>
      <article><span>KELENGKAPAN DATA</span><strong>{summary.completeness}%</strong><div><small>coverage input operasional</small></div></article>
    </section>

    <section className="card analytics-executive">
      <div className="analytics-card-head"><div><h2>Executive Summary</h2><p>Perbandingan dibuat secara fair: bulan berjalan dibandingkan jumlah hari yang sama pada bulan sebelumnya.</p></div><span className="analytics-period-chip">{data.period.start} — {data.period.end}</span></div>
      <div className="executive-sentence">Secara operasional, periode <b>{monthLabel(data.period.start)}</b> mencatat <b>{num(summary.points)} poin Produksi</b>, kehadiran <b>{summary.attendanceRate}%</b>, compliance Inventory <b>{summary.inv.expected ? `${summary.inv.compliance}%` : "belum cukup data"}</b>, dan <b>{summary.errors} kasus kesalahan</b>. Produktivitas berubah <b>{signed(summary.pointDelta)}</b> terhadap periode pembanding yang setara.</div>
      <div className="executive-three"><div className="strength"><h3>✓ Kekuatan</h3>{insights.strengths.slice(0, 3).map((x: string, i: number) => <p key={i}>{x}</p>)}</div><div className="attention"><h3>! Perlu Perhatian</h3>{insights.attention.slice(0, 3).map((x: string, i: number) => <p key={i}>{x}</p>)}</div><div className="recommend"><h3>→ Rekomendasi</h3>{insights.recommendations.slice(0, 3).map((x: string, i: number) => <p key={i}>{x}</p>)}</div></div>
    </section>

    <div className="analytics-two-col">
      <section className="card analytics-panel"><div className="analytics-card-head"><div><h2>Tren Produksi 6 Bulan</h2><p>Total poin per bulan. Bulan berjalan dapat bersifat month-to-date.</p></div></div><div className="trend-bars">{trend.map((x: any) => <div className="trend-column" key={x.month_start}><div className="trend-value">{num(x.points)}</div><div className="trend-track"><i style={{ height: `${Math.max(5, (n(x.points) / maxTrend) * 100)}%` }} /></div><span>{shortMonth(x.month_start)}</span></div>)}</div></section>
      <section className="card analytics-panel"><div className="analytics-card-head"><div><h2>Kualitas Data</h2><p>Memisahkan performa dari kualitas pencatatan agar analisis tidak menyesatkan.</p></div></div><div className="quality-list"><div><span>Coverage Produksi pada hari hadir</span><b>{summary.productionCoverage}%</b><progress max="100" value={summary.productionCoverage}/></div><div><span>Coverage pencatatan Kehadiran</span><b>{summary.attendanceCoverage}%</b><progress max="100" value={summary.attendanceCoverage}/></div><div><span>Checklist Inventory</span><b>{summary.inv.expected ? `${summary.inv.compliance}%` : "N/A"}</b><progress max="100" value={summary.inv.compliance}/></div></div></section>
    </div>

    <section className="card analytics-panel"><div className="analytics-card-head"><div><h2>Capaian KPI Produksi</h2><p>Kontribusi setiap KPI terhadap total poin periode terpilih.</p></div></div><div className="analytics-kpi-breakdown">{summary.kpiRows.length ? summary.kpiRows.map((k: any) => <article key={k.id}><div><strong>{k.name}</strong><span>{k.entries} input · jumlah {num(k.quantity)}</span></div><b>{num(k.points)}<small> poin</small></b></article>) : <p className="analytics-empty">Belum ada Produksi pada periode ini.</p>}</div></section>

    <section className="card analytics-panel"><div className="analytics-card-head"><div><h2>Kontribusi Karyawan Produksi</h2><p>Ranking periode terpilih; detail individual tersedia pada menu Peringkat & Profil.</p></div></div><div className="portrait-table-wrap"><table className="analytics-table"><thead><tr><th>#</th><th>Karyawan</th><th>Poin</th><th>Input KPI</th><th>Packaging</th></tr></thead><tbody>{summary.employeeRows.map((r: any, i: number) => <tr key={r.id}><td><span className={`analytics-rank ${i === 0 ? "first" : ""}`}>{i + 1}</span></td><td><strong>{r.name}</strong><small>{r.code}</small></td><td><b>{num(r.points)}</b></td><td>{r.entries}</td><td>{num(r.products)}</td></tr>)}</tbody></table></div></section>

    <section className="card analytics-panel"><div className="analytics-card-head"><div><h2>Analisis Management</h2><p>Temuan bersifat data-driven. Hubungan lintas indikator dianggap pola/asosiasi, bukan otomatis sebab-akibat.</p></div></div><div className="analysis-detail-grid"><div><h3>Kekuatan Periode</h3>{insights.strengths.map((x: string, i: number) => <p key={i}><b>{i + 1}</b>{x}</p>)}</div><div><h3>Perlu Perhatian</h3>{insights.attention.map((x: string, i: number) => <p key={i}><b>{i + 1}</b>{x}</p>)}</div><div><h3>Rekomendasi Prioritas</h3>{insights.recommendations.map((x: string, i: number) => <p key={i}><b>{i + 1}</b>{x}</p>)}</div></div></section>

    {isClosed ? <section className="card analytics-closing-info"><strong>Snapshot laporan sudah dikunci.</strong><p>Perubahan master pada bulan berikutnya tidak mengubah snapshot final ini. Jika koreksi diperlukan, Admin harus membuka kembali periode; tindakan tersebut tercatat di Audit Log.</p><small>Closed by {closing?.closedBy || displayName || "Admin"} · {closing?.closedAt ? new Date(closing.closedAt).toLocaleString("id-ID") : "-"}</small></section> : null}
  </div>;
}

function employeeInsights(profile: any, rank: number) {
  const c = profile.current || {}, p = profile.previous || {};
  const pointDelta = delta(n(c.points), n(p.points));
  const hadirRate = n(c.attendance) ? pct(n(c.hadir), n(c.attendance)) : 0;
  const greenRate = n(c.hadir) ? pct(n(c.green), n(c.hadir)) : 0;
  const notes: string[] = [];
  notes.push(`${profile.employee.name} berada di peringkat #${rank || "-"} pada periode terpilih dengan ${num(c.points)} poin.`);
  if (pointDelta > 0) notes.push(`Poin meningkat ${Math.abs(pointDelta)}% dibanding periode pembanding yang setara.`);
  else if (pointDelta < 0) notes.push(`Poin turun ${Math.abs(pointDelta)}%; perlu dilihat apakah penurunan berasal dari volume kerja atau jenis KPI yang dikerjakan.`);
  if (hadirRate >= 90) notes.push(`Kehadiran tercatat kuat (${hadirRate}%).`); else notes.push(`Kehadiran tercatat ${hadirRate}% dan perlu ditinjau bersama status izin/sakit/libur.`);
  if (greenRate < 80 && n(c.hadir)) notes.push(`Zona Hijau ${greenRate}% dari kehadiran; konsistensi waktu datang dapat menjadi area perbaikan.`);
  if (n(c.errors) > n(p.errors)) notes.push(`Kasus terkait karyawan meningkat dari ${n(p.errors)} menjadi ${n(c.errors)}; perlu review konteks tiap kasus sebelum evaluasi.`);
  return notes;
}

function downloadEmployeeExcel(profile: any, rank: number) {
  const c = profile.current || {}, p = profile.previous || {};
  const sheets = [
    workbookSheet("Profil", [["Laporan Kinerja Karyawan", profile.employee.name], ["Kode", profile.employee.code], ["Tim", profile.employee.team], ["Peringkat", rank || "-"], ["Metrik", "Periode Ini", "Sebelumnya"], ["Poin", n(c.points), n(p.points)], ["Input KPI", n(c.entries), n(p.entries)], ["Packaging", n(c.products), n(p.products)], ["Hadir", n(c.hadir), n(p.hadir)], ["Zona Hijau", n(c.green), n(p.green)], ["Kesalahan", n(c.errors), n(p.errors)]]),
    workbookSheet("KPI", [["KPI", "Poin", "Jumlah", "Input"], ...(profile.kpis || []).map((k: any) => [k.name, n(k.points), n(k.quantity), n(k.entries)])]),
    workbookSheet("Tren 6 Bulan", [["Bulan", "Poin", "Input KPI", "Hadir", "Kesalahan"], ...(profile.trend6 || []).map((t: any) => [t.month_start, n(t.points), n(t.entries), n(t.hadir), n(t.errors)])]),
  ];
  const content = `<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Styles><Style ss:ID="Header"><Font ss:Bold="1"/><Interior ss:Color="#DFF4ED" ss:Pattern="Solid"/></Style></Styles>${sheets.join("")}</Workbook>`;
  downloadBlob(content, "application/vnd.ms-excel;charset=utf-8", `Kinerja_${profile.employee.name.replace(/\s+/g, "_")}_${String(profile.period.start).slice(0, 7)}.xls`);
}
function downloadEmployeePdf(profile: any, rank: number) {
  const c = profile.current || {}, p = profile.previous || {};
  const notes = employeeInsights(profile, rank);
  const lines = [
    `Karyawan: ${profile.employee.name} (${profile.employee.code})`, `Tim: ${profile.employee.team}`, `Periode: ${profile.period.start} s.d. ${profile.period.end}`, `Peringkat periode: #${rank || "-"}`, "",
    "## RINGKASAN", `Poin: ${num(c.points)} | Sebelumnya ${num(p.points)} | Perubahan ${signed(delta(n(c.points), n(p.points)))}`, `Input KPI: ${n(c.entries)} | Packaging: ${num(c.products)}`, `Hadir: ${n(c.hadir)}/${n(c.attendance)} | Zona Hijau: ${n(c.green)} | Kesalahan terkait: ${n(c.errors)}`, "",
    "## ANALISIS", ...notes.map((x, i) => `${i + 1}. ${x}`), "", "## KONTRIBUSI KPI", ...(profile.kpis || []).map((k: any) => `${k.name}: ${num(k.points)} poin; jumlah ${num(k.quantity)}; ${k.entries} input.`), "", "Catatan: laporan ini merupakan alat evaluasi manajemen dan harus dibaca bersama konteks pekerjaan aktual.",
  ];
  downloadBlob(buildPdf(`Profil Kinerja - ${profile.employee.name}`, lines), "application/pdf", `Kinerja_${profile.employee.name.replace(/\s+/g, "_")}_${String(profile.period.start).slice(0, 7)}.pdf`);
}

export function PerformanceProfilesPanel({ supabase, today, employees }: PropsBase & { employees: any[] }) {
  const productionEmployees = employees.filter((e: any) => e.team === "Produksi" && e.status === "active");
  const [period, setPeriod] = useState(today.slice(0, 7));
  const [employeeId, setEmployeeId] = useState(productionEmployees[0]?.id || "");
  const [profile, setProfile] = useState<any>(null);
  const [management, setManagement] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => { if (!employeeId && productionEmployees[0]?.id) setEmployeeId(productionEmployees[0].id); }, [employees]);
  useEffect(() => {
    if (!employeeId) return;
    let active = true; setLoading(true); setMessage(null);
    Promise.all([
      supabase.rpc("get_employee_performance", { p_employee_id: employeeId, p_period: `${period}-01` }),
      supabase.rpc("get_management_analytics", { p_period: `${period}-01` }),
    ]).then(([a, b]) => {
      if (!active) return;
      if (a.error || b.error) setMessage(a.error?.message || b.error?.message || "Gagal memuat profil.");
      else { setProfile(a.data); setManagement(b.data); }
      setLoading(false);
    });
    return () => { active = false; };
  }, [employeeId, period]);

  const rank = useMemo(() => {
    if (!management || !employeeId) return 0;
    const map = new Map<string, number>();
    for (const r of management.production || []) map.set(r.employee_id, (map.get(r.employee_id) || 0) + n(r.total_points));
    const ordered = [...map.entries()].sort((a, b) => b[1] - a[1]);
    const i = ordered.findIndex(([id]) => id === employeeId); return i >= 0 ? i + 1 : 0;
  }, [management, employeeId]);

  if (!productionEmployees.length) return <section className="card analytics-loading">Belum ada karyawan Produksi aktif.</section>;
  const c = profile?.current || {}, p = profile?.previous || {};
  const pointDelta = delta(n(c.points), n(p.points));
  const attendanceRate = n(c.attendance) ? pct(n(c.hadir), n(c.attendance)) : 0;
  const greenRate = n(c.hadir) ? pct(n(c.green), n(c.hadir)) : 0;
  const notes = profile ? employeeInsights(profile, rank) : [];
  const trend = profile?.trend6 || [];
  const maxTrend = Math.max(1, ...trend.map((x: any) => n(x.points)));

  return <div className="analytics-page profile-page">
    <div className="analytics-title-row"><div><h1>Peringkat & Profil Kinerja</h1><p>Evaluasi individual yang lebih lengkap: KPI, tren, kehadiran, ketepatan waktu, kesalahan, dan perbandingan periode.</p></div><div className="profile-filters"><label>Periode<input type="month" value={period} max={today.slice(0, 7)} onChange={e => setPeriod(e.target.value)} /></label><label>Karyawan<select value={employeeId} onChange={e => setEmployeeId(e.target.value)}>{productionEmployees.map((e: any) => <option key={e.id} value={e.id}>{e.code} · {e.name}</option>)}</select></label></div></div>
    {message ? <div className="analytics-message">{message}</div> : null}
    {loading || !profile ? <section className="card analytics-loading"><strong>Memuat profil kinerja…</strong></section> : <>
      <section className="profile-hero card"><div className="profile-avatar">{profile.employee.name.split(/\s+/).slice(0, 2).map((x: string) => x[0]).join("")}</div><div className="profile-main"><span>{profile.employee.team}</span><h2>{profile.employee.name}</h2><p>{profile.employee.code} · {monthLabel(profile.period.start)}</p></div><div className="profile-rank"><span>PERINGKAT</span><strong>#{rank || "-"}</strong></div><div className="analytics-export-actions profile-export"><button onClick={() => downloadEmployeePdf(profile, rank)}>↓ PDF Karyawan</button><button onClick={() => downloadEmployeeExcel(profile, rank)}>↓ Excel Karyawan</button></div></section>
      <section className="profile-metric-grid"><article><span>TOTAL POIN</span><strong>{num(c.points)}</strong><DeltaChip value={pointDelta}/></article><article><span>PACKAGING</span><strong>{num(c.products)}</strong><small>produk</small></article><article><span>KEHADIRAN</span><strong>{attendanceRate}%</strong><small>{n(c.hadir)}/{n(c.attendance)} tercatat hadir</small></article><article><span>ZONA HIJAU</span><strong>{greenRate}%</strong><small>dari kehadiran</small></article><article><span>KESALAHAN TERKAIT</span><strong>{n(c.errors)}</strong><DeltaChip value={delta(n(c.errors), n(p.errors))} inverse/></article></section>
      <div className="analytics-two-col"><section className="card analytics-panel"><div className="analytics-card-head"><div><h2>Tren Poin 6 Bulan</h2><p>Melihat konsistensi, bukan hanya ranking satu bulan.</p></div></div><div className="trend-bars">{trend.map((x: any) => <div className="trend-column" key={x.month_start}><div className="trend-value">{num(x.points)}</div><div className="trend-track"><i style={{ height: `${Math.max(5, (n(x.points) / maxTrend) * 100)}%` }} /></div><span>{shortMonth(x.month_start)}</span></div>)}</div></section><section className="card analytics-panel"><div className="analytics-card-head"><div><h2>Analisis Karyawan</h2><p>Narasi otomatis dari metrik terukur.</p></div></div><div className="employee-insight-list">{notes.map((x, i) => <p key={i}><b>{i + 1}</b>{x}</p>)}</div></section></div>
      <section className="card analytics-panel"><div className="analytics-card-head"><div><h2>Kontribusi KPI</h2><p>Jenis pekerjaan yang membentuk performa karyawan pada periode ini.</p></div></div><div className="profile-kpi-grid">{(profile.kpis || []).length ? profile.kpis.map((k: any) => <article key={k.id}><span>{k.name}</span><strong>{num(k.points)} <small>poin</small></strong><p>{k.entries} input · jumlah {num(k.quantity)}</p></article>) : <p className="analytics-empty">Belum ada KPI pada periode ini.</p>}</div></section>
      <section className="card analytics-panel"><div className="analytics-card-head"><div><h2>Perbandingan Periode</h2><p>Bulan berjalan dibandingkan jumlah hari yang sama pada bulan sebelumnya.</p></div></div><div className="portrait-table-wrap"><table className="analytics-table compare-table"><thead><tr><th>Metrik</th><th>Periode Ini</th><th>Sebelumnya</th><th>Perubahan</th></tr></thead><tbody><tr><td>Poin</td><td><b>{num(c.points)}</b></td><td>{num(p.points)}</td><td><DeltaChip value={pointDelta}/></td></tr><tr><td>Input KPI</td><td>{n(c.entries)}</td><td>{n(p.entries)}</td><td><DeltaChip value={delta(n(c.entries), n(p.entries))}/></td></tr><tr><td>Packaging</td><td>{num(c.products)}</td><td>{num(p.products)}</td><td><DeltaChip value={delta(n(c.products), n(p.products))}/></td></tr><tr><td>Hadir</td><td>{n(c.hadir)}</td><td>{n(p.hadir)}</td><td><DeltaChip value={delta(n(c.hadir), n(p.hadir))}/></td></tr><tr><td>Kesalahan terkait</td><td>{n(c.errors)}</td><td>{n(p.errors)}</td><td><DeltaChip value={delta(n(c.errors), n(p.errors))} inverse/></td></tr></tbody></table></div></section>
    </>}
  </div>;
}
