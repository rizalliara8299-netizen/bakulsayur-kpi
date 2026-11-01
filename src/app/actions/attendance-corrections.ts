"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";

type EditAttendanceInput = {
  id: string;
  employeeId: string;
  workDate: string;
  status: string;
  arrivalTime: string | null;
  notes: string | null;
};

type Outcome = { ok: true } | { ok: false; error: string };

const allowedStatuses = new Set(["Hadir", "Izin", "Sakit", "Alpa", "Libur"]);
const zoneNames = new Set(["Hijau", "Kuning", "Oranye", "Merah"]);
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const shortTime = (value: string | null) => String(value || "").slice(0, 5);
const minuteOf = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));

export async function adminCorrectAttendance(input: EditAttendanceInput): Promise<Outcome> {
  const { supabase, profile, user } = await requireUser();
  if (!["admin", "superadmin"].includes(String(profile?.role || ""))) {
    return { ok: false, error: "Perubahan kehadiran hanya untuk Admin." };
  }
  const organizationId = String(profile?.organization_id || "");
  const id = String(input?.id || "");
  const employeeId = String(input?.employeeId || "");
  const workDate = String(input?.workDate || "");
  const status = String(input?.status || "");
  const arrivalTime = shortTime(input?.arrivalTime || null);
  const notes = String(input?.notes || "").trim() || null;

  if (!uuidPattern.test(id) || !uuidPattern.test(employeeId)) {
    return { ok: false, error: "ID catatan atau karyawan tidak valid." };
  }
  const parsedDate = Date.parse(workDate + "T00:00:00Z");
  if (!datePattern.test(workDate) || !Number.isFinite(parsedDate) || new Date(parsedDate).toISOString().slice(0, 10) !== workDate) {
    return { ok: false, error: "Tanggal kehadiran tidak valid." };
  }
  if (!allowedStatuses.has(status)) return { ok: false, error: "Status kehadiran tidak valid." };
  if (status === "Hadir" && !timePattern.test(arrivalTime)) {
    return { ok: false, error: "Jam datang wajib diisi untuk status Hadir." };
  }
  if ((status === "Izin" || status === "Sakit") && !notes) {
    return { ok: false, error: "Keterangan wajib untuk Izin atau Sakit." };
  }

  const { data: current, error: originalError } = await supabase
    .from("attendance_entries")
    .select("id,organization_id,employee_id,work_date,attendance_status,arrival_time,zone_result,zone_policy_id")
    .eq("id", id)
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .single();
  if (originalError || !current) return { ok: false, error: "Catatan tidak ditemukan atau sudah diarsipkan." };

  const { data: employee, error: employeeError } = await supabase
    .from("employees")
    .select("id,team_id,status")
    .eq("id", employeeId)
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .single();
  if (employeeError || !employee) return { ok: false, error: "Karyawan tidak ditemukan pada organisasi ini." };

  const coreChanged = current.work_date !== workDate
    || current.employee_id !== employeeId
    || current.attendance_status !== status
    || (status === "Hadir" && shortTime(current.arrival_time) !== arrivalTime);

  const patch: Record<string, string | null> = {
    work_date: workDate,
    employee_id: employeeId,
    attendance_status: status,
    arrival_time: status === "Hadir" ? (coreChanged ? arrivalTime : current.arrival_time) : null,
    notes,
    updated_by: user.id,
  };

  if (coreChanged) {
    if (status !== "Hadir") {
      patch.zone_result = "-";
      patch.zone_policy_id = null;
    } else {
      // The legacy Admin team has attendance rows, but does not have its own
      // zone policy. Use Produksi as the reference schedule without claiming
      // the attendance was evaluated under a team-specific policy.
      let policyTeamId = employee.team_id;
      let usingProductionReference = false;
      const { data: team, error: teamError } = await supabase
        .from("teams").select("name").eq("id", employee.team_id)
        .eq("organization_id", organizationId).single();
      if (teamError || !team) return { ok: false, error: "Divisi karyawan tidak dapat ditemukan." };
      if (team.name === "Admin") {
        const { data: productionTeam } = await supabase
          .from("teams").select("id").eq("organization_id", organizationId)
          .eq("name", "Produksi").single();
        if (!productionTeam?.id) return { ok: false, error: "Acuan zona Produksi tidak ditemukan." };
        policyTeamId = productionTeam.id;
        usingProductionReference = true;
      }
      const { data: policies, error: policiesError } = await supabase
        .from("attendance_policies")
        .select("id,effective_from,effective_until,version_no")
        .eq("organization_id", organizationId)
        .eq("team_id", policyTeamId)
        .eq("is_active", true)
        .lte("effective_from", workDate)
        .order("effective_from", { ascending: false })
        .order("version_no", { ascending: false });
      if (policiesError) return { ok: false, error: "Gagal memeriksa kebijakan zona kehadiran." };
      const activePolicy = (policies || []).find(p => !p.effective_until || p.effective_until >= workDate);
      if (!activePolicy) {
        return { ok: false, error: "Tidak ada policy zona yang berlaku untuk tanggal dan divisi ini." };
      }
      const { data: ranges, error: rangesError } = await supabase
        .from("attendance_zone_ranges")
        .select("zone_name,start_time,end_time,sort_order")
        .eq("policy_id", activePolicy.id)
        .order("sort_order", { ascending: true });
      if (rangesError || !ranges?.length) return { ok: false, error: "Rentang zona pada policy belum tersedia." };
      const minute = minuteOf(arrivalTime);
      let zone = ranges.find((r) =>
        minute >= minuteOf(shortTime(r.start_time)) && minute <= minuteOf(shortTime(r.end_time))
      )?.zone_name;
      if (!zone) zone = minute < minuteOf(shortTime(ranges[0].start_time)) ? "Hijau" : "Merah";
      if (!zoneNames.has(zone)) return { ok: false, error: "Hasil perhitungan zona tidak valid." };
      patch.zone_result = zone;
      patch.zone_policy_id = usingProductionReference ? null : activePolicy.id;
    }
  }

  const { data: updated, error: saveError } = await supabase
    .from("attendance_entries").update(patch)
    .eq("id", id).eq("organization_id", organizationId)
    .is("deleted_at", null)
    .select("id").maybeSingle();
  if (saveError) {
    if (saveError.code === "23505") return { ok: false, error: "Karyawan sudah punya kehadiran pada tanggal tersebut." };
    return { ok: false, error: saveError.message };
  }
  if (!updated) return { ok: false, error: "Tidak ada catatan yang berubah. Periksa izin dan status arsip." };

  for (const path of ["/dashboard", "/attendance", "/reports", "/ranking", "/admin"]) {
    revalidatePath(path);
  }
  return { ok: true };
}
