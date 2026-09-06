import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function requireUser() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) redirect("/login");
  const { data: profile } = await supabase
    .from("profiles")
    .select("id,display_name,email,role,organization_id,is_active")
    .eq("id", data.user.id)
    .single();
  if (!profile?.is_active) {
    await supabase.auth.signOut();
    redirect("/login?error=Akun belum diaktifkan oleh Superadmin");
  }
  return { supabase, user: data.user, profile };
}

export function canWrite(role?: string | null) {
  return ["superadmin", "admin", "supervisor", "operator"].includes(String(role || ""));
}

export function canManageMaster(role?: string | null) {
  return ["superadmin", "admin"].includes(String(role || ""));
}
