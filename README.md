# KPI Bakul Sayur — Full Stack

Modernisasi Dashboard KPI Bakul Sayur dari Google Apps Script + Spreadsheet menjadi Next.js + Supabase + Vercel.

## Stack

- Next.js App Router + TypeScript
- Tailwind CSS
- Supabase Auth, PostgreSQL, RLS, Realtime-ready
- Vercel deployment

## Fondasi yang sudah disiapkan

- Authentication login/logout
- Protected dashboard
- Role profile: superadmin, admin, supervisor, operator, viewer, employee
- Master organisasi, tim, karyawan
- KPI + versioning poin historis
- Pesanan + allocation packaging
- Produksi dengan snapshot poin
- Inventory checklist + target
- Kehadiran + policy zona versioned
- Error/complaint workflow
- Audit logs
- Idempotency table
- RLS seluruh tabel public
- Views ranking produksi dan KPI performance

## Environment

Salin `.env.example` ke `.env.local` dan isi publishable key Supabase.

## Local

```bash
npm install
npm run dev
```

## First admin

Buat user pertama melalui Supabase Auth, login, lalu gunakan tombol **Aktifkan Superadmin Pertama**. RPC bootstrap hanya dapat berhasil sebelum superadmin pertama tersedia.

## Branch

Implementasi awal dikembangkan di `fullstack-foundation` sebelum digabung ke `main`.
