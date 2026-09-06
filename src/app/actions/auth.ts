"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function login(formData: FormData) {
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) redirect(`/login?error=${encodeURIComponent(error.message)}`);
  redirect("/dashboard");
}

export async function signUp(formData: FormData) {
  const name = String(formData.get("name") || "").trim();
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");
  if (!name || !email || password.length < 8) {
    redirect(`/register?error=${encodeURIComponent("Nama, email, dan password minimal 8 karakter wajib diisi.")}`);
  }
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: name } },
  });
  if (error) redirect(`/register?error=${encodeURIComponent(error.message)}`);
  if (data.session) redirect("/dashboard");
  redirect(`/login?message=${encodeURIComponent("Akun dibuat. Jika konfirmasi email aktif, buka email Anda lalu login.")}`);
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function bootstrapSuperadmin() {
  const supabase = await createClient();
  const { error } = await supabase.rpc("bootstrap_first_superadmin");
  if (error) redirect(`/dashboard?setupError=${encodeURIComponent(error.message)}`);
  redirect("/dashboard?setup=ok");
}
