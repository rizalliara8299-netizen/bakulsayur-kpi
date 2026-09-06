"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";

export async function updateUserAccess(formData: FormData) {
  const { supabase, profile } = await requireUser();
  if (profile?.role !== "superadmin") redirect("/users?error=Hanya Superadmin yang dapat mengubah akses pengguna");
  const id = String(formData.get("profileId") || "");
  const role = String(formData.get("role") || "viewer");
  const isActive = String(formData.get("isActive") || "false") === "true";
  const allowed = ["superadmin","admin","supervisor","operator","viewer","employee"];
  if (!allowed.includes(role)) redirect("/users?error=Role tidak valid");
  const { error } = await supabase.from("profiles").update({ role, is_active: isActive }).eq("id", id);
  if (error) redirect(`/users?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/users");
  redirect("/users?saved=1");
}
