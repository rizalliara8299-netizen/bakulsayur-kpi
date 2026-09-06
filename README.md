# KPI Bakul Sayur — Full Stack

Modernisasi Dashboard KPI Bakul Sayur dari Google Apps Script + Spreadsheet menjadi Next.js + Supabase + Vercel.

## Stack

- Next.js App Router + TypeScript
- Tailwind CSS
- Supabase Auth, PostgreSQL, RLS, Realtime-ready
- Vercel deployment

## Modul

- Authentication login/register/logout dan bootstrap Superadmin pertama
- User approval + RBAC: superadmin, admin, supervisor, operator, viewer, employee
- Dashboard KPI
- Karyawan & tim
- Master KPI dengan versioning poin historis
- Produksi dengan snapshot poin/satuan
- Pesanan + alokasi packaging atomik
- Inventory checklist
- Kehadiran + policy zona berdasarkan tim
- Kesalahan/komplain + workflow evaluasi
- Ranking & laporan
- Audit log dan idempotency

## Migrasi legacy

Data historis dari Google Sheet telah direkonsiliasi ke Supabase tanpa menghitung ulang poin lama menggunakan master KPI terbaru.

Baseline migrasi:

- 4 karyawan
- 10 master KPI / 15 versi KPI
- 202 transaksi produksi
- Total poin historis: 7.612
- 59 data kehadiran
- 1 data inventory
- 6 kasus kesalahan valid
- 0 pesanan legacy aktif
- 7 audit legacy kritis dipertahankan (5 delete produksi, 1 koreksi kasus, 1 rename karyawan)

Rekonsiliasi poin produksi:

- Fini: 83 transaksi / 2.481 poin
- Nazma: 59 transaksi / 2.613 poin
- Felin: 60 transaksi / 2.518 poin

Prinsip utama: histori transaksi menyimpan `points_per_unit_snapshot`, `unit_snapshot`, `total_points`, dan `kpi_version_id`, sehingga perubahan master KPI masa depan tidak menulis ulang histori.

## Environment

Aplikasi mendukung `NEXT_PUBLIC_SUPABASE_URL` dan `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Publishable key tidak pernah diganti dengan `service_role` di client.

## Development

```bash
npm install
npm run dev
```

Build production:

```bash
npm run build
```

GitHub Actions menjalankan build Next.js dan menunggu status Preview Deployment Vercel sebelum perubahan dianggap lolos.

## First admin

Pada instalasi awal, daftar akun pertama melalui `/register`, login, lalu gunakan tombol **Aktifkan Superadmin Pertama**. Setelah Superadmin tersedia, registrasi berikutnya dibuat nonaktif hingga disetujui Superadmin.

## Legacy archive

`index.html` lama tetap dipertahankan sementara sebagai referensi selama masa transisi. Database operasional baru menggunakan Supabase sebagai single source of truth.
