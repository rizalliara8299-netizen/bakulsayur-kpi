"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const APP_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://bakulsayur-kpi.vercel.app").replace(/\/$/, "");
const CONFIRM_URL = `${APP_URL}/auth/confirm`;

function friendlyAuthError(message: string) {
  const text = message.toLowerCase();
  if (text.includes("email rate limit exceeded")) {
    return "Terlalu banyak email verifikasi diminta. Tunggu beberapa saat lalu kirim ulang satu kali saja.";
  }
  if (text.includes("for security purposes") || text.includes("request this after")) {
    return "Permintaan verifikasi terlalu cepat. Tunggu sekitar 60 detik sebelum mencoba lagi.";
  }
  if (text.includes("already registered") || text.includes("already exists")) {
    return "Email ini sudah terdaftar. Jika belum terverifikasi, gunakan Kirim ulang verifikasi.";
  }
  if (text.includes("invalid login credentials")) {
    return "Email atau password tidak sesuai, atau email belum diverifikasi.";
  }
  return message;
}

export async function login(formData: FormData) {
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) redirect(`/login?error=${encodeURIComponent(friendlyAuthError(error.message))}`);
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
    options: {
      data: { full_name: name },
      emailRedirectTo: CONFIRM_URL,
    },
  });

  if (error) redirect(`/register?error=${encodeURIComponent(friendlyAuthError(error.message))}`);
  if (data.session) redirect("/dashboard");
  redirect(`/login?message=${encodeURIComponent("Akun dibuat. Buka email verifikasi terbaru, lalu klik Konfirmasi Email.")}`);
}

export async function resendConfirmation(formData: FormData) {
  const email = String(formData.get("email") || "").trim();
  if (!email) {
    redirect(`/register?error=${encodeURIComponent("Masukkan email yang ingin dikirim ulang verifikasinya.")}`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.resend({
    type: "signup",
    email,
    options: { emailRedirectTo: CONFIRM_URL },
  });

  if (error) redirect(`/register?error=${encodeURIComponent(friendlyAuthError(error.message))}`);
  redirect(`/register?message=${encodeURIComponent("Email verifikasi baru sudah dikirim. Gunakan email yang paling baru dan abaikan link sebelumnya.")}`);
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
