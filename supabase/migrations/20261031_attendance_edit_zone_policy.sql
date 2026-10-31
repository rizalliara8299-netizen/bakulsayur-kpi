-- Safe scoped backend rollout for the already-live Bakul Sayur attendance UI.
-- Deliberately no mass UPDATE/DELETE and no modification to historical attendance rows.
-- Mutating RPCs run as caller, honor existing RLS and explicitly check active admin.

create or replace function public.admin_update_attendance_entry(
 p_id uuid, p_work_date date, p_employee_id uuid, p_status text,
 p_arrival_time time without time zone default null, p_notes text default null
) returns public.attendance_entries
language plpgsql security invoker set search_path = public, pg_temp as $edit$
declare
 v_org uuid:=public.require_admin_organization();
 v_old public.attendance_entries;
 v_new public.attendance_entries;
 v_team uuid;
 v_policy uuid;
 v_zone text:='-';
begin
 select * into v_old from public.attendance_entries
 where id=p_id and organization_id=v_org and deleted_at is null for update;
 if not found then raise exception 'Catatan kehadiran aktif tidak ditemukan'; end if;
 if p_work_date is null or p_employee_id is null then raise exception 'Tanggal dan karyawan wajib diisi'; end if;
 if p_status is null or p_status not in ('Hadir','Izin','Sakit','Alpa','Libur') then raise exception 'Status tidak valid'; end if;
 if p_status='Hadir' and p_arrival_time is null then raise exception 'Jam datang wajib diisi'; end if;
 if p_status in ('Izin','Sakit') and nullif(btrim(coalesce(p_notes,'')),'') is null then
  raise exception 'Keterangan wajib untuk izin atau sakit';
 end if;
 if exists (
  select 1 from public.monthly_period_closings c
  where c.organization_id=v_org and c.status='closed'
    and c.period_start in (date_trunc('month',v_old.work_date)::date,date_trunc('month',p_work_date)::date)
 ) then raise exception 'Periode sudah ditutup. Buka closing dahulu'; end if;
 select e.team_id into v_team from public.employees e
 where e.id=p_employee_id and e.organization_id=v_org and e.status='active' and e.deleted_at is null;
 if v_team is null then raise exception 'Karyawan tidak aktif atau tidak ditemukan'; end if;

 if p_status='Hadir' then
  select pol.id into v_policy from public.attendance_policies pol
  where pol.organization_id=v_org and pol.team_id=v_team and pol.is_active=true
    and pol.effective_from<=p_work_date and (pol.effective_until is null or pol.effective_until>=p_work_date)
  order by pol.effective_from desc,pol.version_no desc limit 1;
  if v_policy is null then raise exception 'Kebijakan zona untuk tanggal ini tidak ditemukan'; end if;
  select r.zone_name into v_zone from public.attendance_zone_ranges r
   where r.policy_id=v_policy and p_arrival_time between r.start_time and r.end_time
   order by r.sort_order limit 1;
  if v_zone is null then
    select case when p_arrival_time<min(r.start_time) then 'Hijau' else 'Merah' end
    into v_zone from public.attendance_zone_ranges r where r.policy_id=v_policy;
  end if;
  v_zone:=coalesce(v_zone,'Merah');
 end if;

 update public.attendance_entries set work_date=p_work_date,employee_id=p_employee_id,
   attendance_status=p_status,
   arrival_time=case when p_status='Hadir' then p_arrival_time else null end,
   zone_policy_id=case when p_status='Hadir' then v_policy else null end,
   zone_result=v_zone,notes=nullif(btrim(coalesce(p_notes,'')),''),
   updated_by=auth.uid(),updated_at=now()
 where id=p_id and organization_id=v_org and deleted_at is null
 returning * into v_new;
 if not found then raise exception 'Perubahan gagal disimpan'; end if;
 -- Existing AFTER UPDATE audit_attendance trigger records before/after values.
 return v_new;
exception when unique_violation then
 raise exception 'Sudah ada kehadiran untuk karyawan pada tanggal itu (termasuk arsip)';
end;
$edit$;
revoke execute on function public.admin_update_attendance_entry(uuid,date,uuid,text,time without time zone,text)
 from public,anon;
grant execute on function public.admin_update_attendance_entry(uuid,date,uuid,text,time without time zone,text)
 to authenticated;

create or replace function public.admin_archive_attendance_entry(p_id uuid)
returns boolean language plpgsql security invoker set search_path=public,pg_temp as $archive$
declare v_org uuid:=public.require_admin_organization();
        v_date date;
begin
 select e.work_date into v_date from public.attendance_entries e
 where e.id=p_id and e.organization_id=v_org and e.deleted_at is null;
 if v_date is null then return false; end if;
 if exists (select 1 from public.monthly_period_closings c where c.organization_id=v_org
    and c.status='closed' and c.period_start=date_trunc('month',v_date)::date) then
  raise exception 'Periode sudah ditutup. Buka closing dahulu';
 end if;
 -- Reuse existing admin-checked soft-delete RPC; its audit and closing triggers remain.
 return public.admin_soft_delete_record('attendance',p_id);
end;
$archive$;
revoke execute on function public.admin_archive_attendance_entry(uuid) from public,anon;
grant execute on function public.admin_archive_attendance_entry(uuid) to authenticated;

-- Policy changes are versioned and effective only on a future date.
create or replace function public.admin_create_attendance_policy(
 p_team_id uuid,p_effective_from date,p_ranges jsonb
) returns integer language plpgsql security invoker set search_path=public,pg_temp as $policy$
declare
 v_org uuid:=public.require_admin_organization();
 v_team text;
 v_prev public.attendance_policies;
 v_new_id uuid;
 v_ver integer;
 v_names text[]:=array['Hijau','Kuning','Oranye','Merah'];
 v_zone text;
 v_item jsonb;
 v_start time;
 v_end time;
 v_start_min integer;
 v_end_min integer;
 v_previous_end integer:=-1;
 i integer;
begin
 if p_effective_from is null or p_effective_from <= (now() at time zone 'Asia/Makassar')::date then
   raise exception 'Tanggal efektif harus setelah hari ini';
 end if;
 select t.name into v_team from public.teams t
 where t.id=p_team_id and t.organization_id=v_org and t.is_active=true for update;
 if coalesce(v_team,'') not in ('Produksi','Inventory') then raise exception 'Pilih divisi yang aktif'; end if;
 if jsonb_typeof(p_ranges) is distinct from 'array' or jsonb_array_length(p_ranges)<>4 then
  raise exception 'Isi empat zona waktu';
 end if;
 for i in 1..4 loop
  v_zone:=v_names[i];
  if (select count(*) from jsonb_array_elements(p_ranges) j
      where j->>'name'=v_zone)<>1 then raise exception 'Zona % harus tepat satu',v_zone; end if;
  select j into v_item from jsonb_array_elements(p_ranges) j
   where j->>'name'=v_zone;
  if coalesce(v_item->>'start','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
   or coalesce(v_item->>'end','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
   raise exception 'Format jam zona % tidak valid',v_zone;
  end if;
  v_start:=(v_item->>'start')::time;
  v_end:=(v_item->>'end')::time;
  v_start_min:=extract(hour from v_start)::int*60+extract(minute from v_start)::int;
  v_end_min:=extract(hour from v_end)::int*60+extract(minute from v_end)::int;
  if v_start_min>v_end_min then raise exception 'Rentang zona % terbalik',v_zone; end if;
  if i>1 and v_start_min<>v_previous_end+1 then
    raise exception 'Zona % harus menyambung tanpa celah',v_zone;
  end if;
  if i=4 and v_end_min<>1439 then raise exception 'Zona Merah harus selesai 23:59'; end if;
  v_previous_end:=v_end_min;
 end loop;

 select * into v_prev from public.attendance_policies pol
 where pol.organization_id=v_org and pol.team_id=p_team_id
 order by pol.effective_from desc,pol.version_no desc limit 1 for update;
 if v_prev.id is not null and p_effective_from<=v_prev.effective_from then
  raise exception 'Tanggal efektif harus setelah policy terbaru';
 end if;
 v_ver:=coalesce(v_prev.version_no,0)+1;
 if v_prev.id is not null then
  update public.attendance_policies set effective_until=p_effective_from-1
  where id=v_prev.id and organization_id=v_org;
 end if;
 insert into public.attendance_policies(organization_id,team_id,version_no,effective_from,is_active)
 values(v_org,p_team_id,v_ver,p_effective_from,true)
 returning id into v_new_id;
 for i in 1..4 loop
   v_zone:=v_names[i];
   select j into v_item from jsonb_array_elements(p_ranges) j
   where j->>'name'=v_zone;
   insert into public.attendance_zone_ranges(policy_id,zone_name,start_time,end_time,sort_order)
   values(v_new_id,v_zone,(v_item->>'start')::time,
    (v_item->>'end')::time+interval '59 seconds',i);
 end loop;
 return v_ver;
end;
$policy$;
revoke execute on function public.admin_create_attendance_policy(uuid,date,jsonb) from public,anon;
grant execute on function public.admin_create_attendance_policy(uuid,date,jsonb) to authenticated;

-- The existing audit_row_change trigger function has privileges to record policy changes.
create trigger audit_attendance_policy_change
after insert or update on public.attendance_policies
for each row execute function private.audit_row_change();

-- The regular attendance form may update existing active records, but MUST NOT restore archived records.
-- This preserves the existing function signature, RLS behavior and history triggers.
CREATE OR REPLACE FUNCTION public.upsert_attendance(p_work_date date, p_employee_id uuid, p_status text, p_arrival_time time without time zone DEFAULT NULL::time without time zone, p_notes text DEFAULT NULL::text)
 RETURNS attendance_entries
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_org uuid := private.current_org_id();
  v_team uuid;
  v_policy uuid;
  v_zone text := '-';
  v_result public.attendance_entries;
begin
  if p_status not in ('Hadir','Izin','Sakit','Alpa','Libur') then raise exception 'Invalid attendance status'; end if;
  if p_status = 'Hadir' and p_arrival_time is null then raise exception 'Arrival time is required'; end if;
  if p_status in ('Izin','Sakit') and nullif(btrim(coalesce(p_notes,'')),'') is null then raise exception 'Notes are required'; end if;
  select team_id into v_team from public.employees
   where id = p_employee_id and organization_id = v_org and status = 'active' and deleted_at is null;
  if v_team is null then raise exception 'Active employee not found'; end if;
  if p_status = 'Hadir' then
    select id into v_policy from public.attendance_policies
     where organization_id = v_org and team_id = v_team and is_active = true
       and effective_from <= p_work_date and (effective_until is null or effective_until >= p_work_date)
     order by effective_from desc, version_no desc limit 1;
    select zone_name into v_zone from public.attendance_zone_ranges
     where policy_id = v_policy and p_arrival_time between start_time and end_time
     order by sort_order limit 1;
    if v_zone is null then
      select case when p_arrival_time < min(start_time) then 'Hijau' else 'Merah' end
        into v_zone from public.attendance_zone_ranges where policy_id=v_policy;
    end if;
    v_zone := coalesce(v_zone, 'Merah');
  end if;
  if exists (select 1 from public.attendance_entries
    where organization_id=v_org and employee_id=p_employee_id
      and work_date=p_work_date and deleted_at is not null) then
    raise exception 'Catatan tanggal ini sudah diarsipkan. Pulihkan melalui Admin Control';
  end if;
  insert into public.attendance_entries (
    organization_id, work_date, employee_id, attendance_status, arrival_time, zone_policy_id, zone_result, notes, created_by, updated_by
  ) values (
    v_org, p_work_date, p_employee_id, p_status, case when p_status='Hadir' then p_arrival_time else null end,
    case when p_status='Hadir' then v_policy else null end, case when p_status='Hadir' then v_zone else '-' end,
    p_notes, auth.uid(), auth.uid()
  )
  on conflict (employee_id, work_date) do update set
    attendance_status = excluded.attendance_status,
    arrival_time = excluded.arrival_time,
    zone_policy_id = excluded.zone_policy_id,
    zone_result = excluded.zone_result,
    notes = excluded.notes,
    updated_by = auth.uid(),
    updated_at = now()
  where public.attendance_entries.deleted_at is null
  returning * into v_result;
  if v_result.id is null then
    raise exception 'Catatan berada di arsip. Pulihkan melalui Admin Control';
  end if;
  return v_result;
end;
$function$;
