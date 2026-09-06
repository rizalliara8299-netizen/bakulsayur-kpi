"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";

function text(formData: FormData, key: string) {
  return String(formData.get(key) || "").trim();
}
function number(formData: FormData, key: string) {
  return Number(formData.get(key) || 0);
}
function fail(path: string, error: unknown): never {
  const message = error instanceof Error ? error.message : String(error || "Gagal menyimpan data");
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}
function done(path: string): never {
  revalidatePath(path);
  revalidatePath("/dashboard");
  redirect(`${path}?saved=1`);
}

export async function createEmployee(formData: FormData) {
  const { supabase, profile, user } = await requireUser();
  const path = "/employees";
  const { error } = await supabase.from("employees").insert({
    organization_id: profile.organization_id,
    employee_code: text(formData, "employeeCode").toUpperCase(),
    name: text(formData, "name"),
    team_id: text(formData, "teamId"),
    status: text(formData, "status") || "active",
    created_by: user.id,
    updated_by: user.id,
  });
  if (error) fail(path, error);
  done(path);
}

export async function createKpi(formData: FormData) {
  const { supabase } = await requireUser();
  const path = "/kpi";
  const { error } = await supabase.rpc("create_kpi_with_version", {
    p_code: text(formData, "code"),
    p_name: text(formData, "name"),
    p_unit: text(formData, "unit"),
    p_points: number(formData, "points"),
    p_effective_from: text(formData, "effectiveFrom"),
  });
  if (error) fail(path, error);
  done(path);
}

export async function addKpiVersion(formData: FormData) {
  const { supabase } = await requireUser();
  const path = "/kpi";
  const { error } = await supabase.rpc("add_kpi_version", {
    p_kpi_id: text(formData, "kpiId"),
    p_unit: text(formData, "unit"),
    p_points: number(formData, "points"),
    p_effective_from: text(formData, "effectiveFrom"),
  });
  if (error) fail(path, error);
  done(path);
}

export async function createProduction(formData: FormData) {
  const { supabase } = await requireUser();
  const path = "/production";
  const { error } = await supabase.rpc("create_production_entry", {
    p_work_date: text(formData, "workDate"),
    p_employee_id: text(formData, "employeeId"),
    p_kpi_id: text(formData, "kpiId"),
    p_quantity: number(formData, "quantity"),
    p_order_id: text(formData, "orderId") || null,
    p_notes: text(formData, "notes") || null,
  });
  if (error) fail(path, error);
  done(path);
}

export async function saveInventory(formData: FormData) {
  const { supabase } = await requireUser();
  const path = "/inventory";
  const { error } = await supabase.rpc("upsert_inventory_entry", {
    p_work_date: text(formData, "workDate"),
    p_employee_id: text(formData, "employeeId"),
    p_task_id: text(formData, "taskId"),
    p_work_status: text(formData, "workStatus"),
    p_notes: text(formData, "notes") || null,
  });
  if (error) fail(path, error);
  done(path);
}

export async function saveAttendance(formData: FormData) {
  const { supabase } = await requireUser();
  const path = "/attendance";
  const { error } = await supabase.rpc("upsert_attendance", {
    p_work_date: text(formData, "workDate"),
    p_employee_id: text(formData, "employeeId"),
    p_status: text(formData, "status"),
    p_arrival_time: text(formData, "arrivalTime") || null,
    p_notes: text(formData, "notes") || null,
  });
  if (error) fail(path, error);
  done(path);
}

export async function createOrder(formData: FormData) {
  const { supabase } = await requireUser();
  const path = "/orders";
  const allocations = [1, 2, 3]
    .map((slot) => ({
      employeeId: text(formData, `employee${slot}`),
      quantity: number(formData, `quantity${slot}`),
    }))
    .filter((item) => item.employeeId && item.quantity > 0);
  const { error } = await supabase.rpc("create_order_with_allocations", {
    p_order_date: text(formData, "orderDate"),
    p_customer_name: text(formData, "customerName"),
    p_total_products: Math.floor(number(formData, "totalProducts")),
    p_responsible_employee_id: text(formData, "responsibleEmployeeId"),
    p_status: text(formData, "status"),
    p_notes: text(formData, "notes") || null,
    p_allocations: allocations,
  });
  if (error) fail(path, error);
  done(path);
}

export async function createErrorCase(formData: FormData) {
  const { supabase, profile, user } = await requireUser();
  const path = "/errors";
  const evaluationStatus = text(formData, "evaluationStatus");
  const performer = text(formData, "performerEmployeeId") || null;
  const responsible = text(formData, "responsibleEmployeeId") || null;
  const { error } = await supabase.from("error_cases").insert({
    organization_id: profile.organization_id,
    error_date: text(formData, "errorDate"),
    order_id: text(formData, "orderId") || null,
    error_type: text(formData, "errorType"),
    chronology: text(formData, "chronology"),
    performer_employee_id: performer,
    responsible_employee_id: responsible,
    evaluation_status: evaluationStatus,
    customer_name_snapshot: text(formData, "customerName") || null,
    severity: text(formData, "severity") || "medium",
    notes: text(formData, "notes") || null,
    created_by: user.id,
    updated_by: user.id,
  });
  if (error) fail(path, error);
  done(path);
}
