"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";

const modules = {
  production: { label: "PRODUKSI", paths: ["/production", "/dashboard", "/ranking", "/reports"] },
  attendance: { label: "KEHADIRAN", paths: ["/attendance", "/dashboard", "/ranking", "/reports"] },
  inventory: { label: "INVENTORY", paths: ["/inventory", "/reports"] },
  errors: { label: "KESALAHAN", paths: ["/errors", "/dashboard", "/ranking", "/reports"] },
  orders: { label: "PESANAN", paths: ["/orders", "/dashboard", "/reports"] },
} as const;

type ModuleKey = keyof typeof modules;

function isModule(value: string): value is ModuleKey {
  return value in modules;
}

async function requireAdmin() {
  const auth = await requireUser();
  const role = String(auth.profile?.role || "");
  if (!["admin", "superadmin"].includes(role)) redirect("/settings?error=Akses admin diperlukan");
  return auth;
}

function refreshModule(module: ModuleKey) {
  revalidatePath("/admin");
  for (const path of modules[module].paths) revalidatePath(path);
}

export async function adminBulkArchive(formData: FormData) {
  const { supabase } = await requireAdmin();
  const module = String(formData.get("module") || "").trim().toLowerCase();
  const confirmation = String(formData.get("confirmation") || "").trim().toUpperCase();

  if (!isModule(module)) redirect("/admin?error=Modul tidak valid");
  const phrase = `HAPUS ${modules[module].label}`;
  if (confirmation !== phrase) {
    redirect(`/admin?error=${encodeURIComponent(`Konfirmasi salah. Ketik ${phrase}`)}`);
  }

  const { data, error } = await supabase.rpc("admin_bulk_soft_delete", { p_module: module });
  if (error) redirect(`/admin?error=${encodeURIComponent(error.message)}`);

  refreshModule(module);
  redirect(`/admin?saved=${encodeURIComponent(`${Number(data || 0)} data ${modules[module].label.toLowerCase()} berhasil diarsipkan`)}`);
}

export async function adminBulkRestore(formData: FormData) {
  const { supabase } = await requireAdmin();
  const module = String(formData.get("module") || "").trim().toLowerCase();
  if (!isModule(module)) redirect("/admin?error=Modul tidak valid");

  const { data, error } = await supabase.rpc("admin_bulk_restore", { p_module: module });
  if (error) redirect(`/admin?error=${encodeURIComponent(error.message)}`);

  refreshModule(module);
  redirect(`/admin?saved=${encodeURIComponent(`${Number(data || 0)} data ${modules[module].label.toLowerCase()} berhasil dipulihkan`)}`);
}

export async function adminArchiveRecord(formData: FormData) {
  const { supabase } = await requireAdmin();
  const module = String(formData.get("module") || "").trim().toLowerCase();
  const id = String(formData.get("id") || "").trim();
  if (!isModule(module) || !id) redirect("/admin?error=Record tidak valid");

  const { data, error } = await supabase.rpc("admin_soft_delete_record", { p_module: module, p_id: id });
  if (error) redirect(`/admin?error=${encodeURIComponent(error.message)}`);

  refreshModule(module);
  redirect(`/admin?saved=${encodeURIComponent(data ? "Record berhasil diarsipkan" : "Record sudah tidak aktif")}`);
}

export async function adminRestoreRecord(formData: FormData) {
  const { supabase } = await requireAdmin();
  const module = String(formData.get("module") || "").trim().toLowerCase();
  const id = String(formData.get("id") || "").trim();
  if (!isModule(module) || !id) redirect("/admin?error=Record tidak valid");

  const { data, error } = await supabase.rpc("admin_restore_record", { p_module: module, p_id: id });
  if (error) redirect(`/admin?error=${encodeURIComponent(error.message)}`);

  refreshModule(module);
  redirect(`/admin?saved=${encodeURIComponent(data ? "Record berhasil dipulihkan" : "Record sudah aktif")}`);
}
