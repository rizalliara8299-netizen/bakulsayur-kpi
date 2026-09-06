import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const requireUser = cache(async () => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (error || !userId) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id,display_name,email,role,organization_id,is_active")
    .eq("id", userId)
    .single();

  if (!profile?.is_active) {
    await supabase.auth.signOut();
    redirect("/login?error=Akun belum diaktifkan oleh Superadmin");
  }

  return {
    supabase,
    user: { id: userId, email: String(data.claims?.email || profile.email || "") },
    profile,
  };
});

export function canWrite(role?: string | null) {
  return ["superadmin", "admin", "supervisor", "operator"].includes(String(role || ""));
}

export function canManageMaster(role?: string | null) {
  return ["superadmin", "admin"].includes(String(role || ""));
}
