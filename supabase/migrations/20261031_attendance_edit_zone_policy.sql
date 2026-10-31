-- Attendance editing and versioned zone policies. No historical records are modified here.
create or replace function public.admin_update_attendance_entry(
  p_id uuid,
  p_work_date date,
  p_employee_id uuid,
  p_status text,
  p_arrival_time time without time zone default null,
  p_notes text default null
)
returns public.attendance_entries
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_org uuid := public.require_admin_organization();
  v_old public.attendance_entries;
  v_new public.attendance_entries;
  v_team uuid;
  v_policy uuid;
  v_zone text := '-';
begin
  select * into v_old from public.attendance_entries
    where id=p_id and organization_id=v_org and deleted_at is null for update;
  if not found then raise exception 'Kehadiran tidak ditemukan atau sudah diarsipkan'; end if;
  if p_work_date is null or p_employee_id is null then raise exception 'Tanggal dan karyawan wajib diisi'; end if;
  if p_status is null or p_status not in ('Hadir','Izin','Sakit','Alpa','Libur') then
    raise exception 'Status kehadiran tidak valid';
  end if;
  if p_status='Hadir' and p_arrival_time is null then
    raise exception 'Jam kedatangan wajib untuk status Hadir';
  end if;
  if p_status in ('Izin','Sakit') and nullif(btrim(coalesce(p_notes,'')),'') is null then
    raise exception 'Keterangan wajib untuk Izin atau Sakit';
  end if;
  if exists (
    select 1 from public.monthly_period_closings c
    where c.organization_id=v_org and c.status='closed'
      and c.period_start in (date_trunc('month',v_old.work_date)::date, date_trunc('month',p_work_date)::date)
  ) then raise exception 'Periode laporan sudah ditutup. Buka kembali closing sebelum mengedit'; end if;
  select team_id into v_team from public.employees
    where id=p_employee_id and organization_id=v_org and status='active' and deleted_at is null;
  if v_team is null then raise exception 'Karyawan aktif tidak ditemukan'; end if;
  if exists (select 1 from public.attendance_entries a
    where a.employee_id=p_employee_id and a.work_date=p_work_date and a.id<>p_id)
  then raise exception 'Kehadiran untuk karyawan dan tanggal ini sudah ada (termasuk arsip)'; end if;

  if p_status='Hadir' then
    select p.id into v_policy from public.attendance_policies p
    where p.organization_id=v_org and p.team_id=v_team and p.is_active=true
      and p.effective_from<=p_work_date and (p.effective_until is null or p.effective_until>=p_work_date)
    order by p.effective_from desc,p.version_no desc limit 1;
    if v_policy is null then raise exception 'Policy zona tidak ditemukan untuk tanggal tersebut'; end if;
    select r.zone_name into v_zone from public.attendance_zone_ranges r
      where r.policy_id=v_policy and p_arrival_time between r.start_time and r.end_time
      order by r.sort_order limit 1;
    if v_zone is null then
      select case when p_arrival_time < min(start_time) then 'Hijau' else 'Merah' end
        into v_zone from public.attendance_zone_ranges where policy_id=v_policy;
      v_zone:=coalesce(v_zone,'Merah');
    end if;
  end if;
  update public.attendance_entries set work_date=p_work_date, employee_id=p_employee_id,
    attendance_status=p_status,
    arrival_time=case when p_status='Hadir' then p_arrival_time else null end,
    zone_policy_id=case when p_status='Hadir' then v_policy else null end,
    zone_result=v_zone, notes=nullif(btrim(coalesce(p_notes,'')),''),
    updated_by=auth.uid(),updated_at=now()
  where id=p_id and organization_id=v_org and deleted_at is null returning * into v_new;
  insert into public.audit_logs(organization_id,actor_user_id,action,entity_type,entity_id,before_data,after_data,source)
    values(v_org,auth.uid(),'ATTENDANCE_EDIT','attendance_entries',p_id::text,to_jsonb(v_old),to_jsonb(v_new),'admin_control');
  return v_new;
exception when unique_violation then
  raise exception 'Kehadiran karyawan pada tanggal ini sudah ada';
end; $$;

revoke all on function public.admin_update_attendance_entry(uuid,date,uuid,text,time without time zone,text) from public,anon;
grant execute on function public.admin_update_attendance_entry(uuid,date,uuid,text,time without time zone,text) to authenticated;

create or replace function public.admin_create_attendance_policy(
  p_team_id uuid, p_effective_from date, p_ranges jsonb
)
returns integer
language plpgsql security definer set search_path = public,pg_temp
as $$
declare
  v_org uuid:=public.require_admin_organization();
  v_team_name text;
  v_prev public.attendance_policies;
  v_new_id uuid;
  v_version integer;
  v_zone text;
  v_item jsonb;
  v_start time;
  v_end time;
  v_start_min integer;
  v_end_min integer;
  v_prev_end_min integer:=-1;
  v_index integer;
  v_names text[]:=array['Hijau','Kuning','Oranye','Merah'];
begin
  if p_effective_from is null or p_effective_from <= (now() at time zone 'Asia/Makassar')::date then
    raise exception 'Tanggal mulai berlaku harus setelah hari ini agar histori tetap aman';
  end if;
  select t.name into v_team_name from public.teams t
    where t.id=p_team_id and t.organization_id=v_org and t.is_active=true for update;
  if v_team_name not in ('Produksi','Inventory') or v_team_name is null then
    raise exception 'Pilih divisi Produksi atau Inventory yang aktif';
  end if;
  if jsonb_typeof(p_ranges) is distinct from 'array' or jsonb_array_length(p_ranges)<>4 then
    raise exception 'Keempat zona wajib diisi';
  end if;
  select * into v_prev from public.attendance_policies p
    where p.organization_id=v_org and p.team_id=p_team_id
    order by p.effective_from desc,p.version_no desc limit 1 for update;
  if v_prev.id is not null and p_effective_from <= v_prev.effective_from then
    raise exception 'Tanggal efektif harus setelah kebijakan terakhir';
  end if;

  for v_index in 1..4 loop
    v_zone:=v_names[v_index];
    select e.value into v_item from jsonb_array_elements(p_ranges) e(value)
      where e.value->>'name'=v_zone;
    if v_item is null then raise exception 'Zona % wajib diisi',v_zone; end if;
    if (select count(*) from jsonb_array_elements(p_ranges) e(value)
       where e.value->>'name'=v_zone)<>1 then raise exception 'Nama zona duplikat'; end if;
    if coalesce(v_item->>'start','') !~ '^[0-2][0-9]:[0-5][0-9]$'
      or coalesce(v_item->>'end','') !~ '^[0-2][0-9]:[0-5][0-9]$' then
      raise exception 'Jam wajib dalam format JJ:MM';
    end if;
    v_start:=(v_item->>'start')::time;
    v_end:=(v_item->>'end')::time;
    v_start_min:=(extract(hour from v_start)::integer*60+extract(minute from v_start)::integer);
    v_end_min:=(extract(hour from v_end)::integer*60+extract(minute from v_end)::integer);
    if v_start_min>v_end_min then raise exception 'Rentang % terbalik',v_zone; end if;
    if v_index>1 and v_start_min<>v_prev_end_min+1 then
      raise exception 'Zona % harus langsung menyambung tanpa celah atau tumpang tindih',v_zone;
    end if;
    if v_index=4 and v_end_min<>1439 then
      raise exception 'Zona Merah harus berakhir pada 23:59';
    end if;
    v_prev_end_min:=v_end_min;
  end loop;

  v_version:=coalesce(v_prev.version_no,0)+1;
  if v_prev.id is not null then
    update public.attendance_policies set effective_until=p_effective_from-1
      where id=v_prev.id and organization_id=v_org;
  end if;
  insert into public.attendance_policies(organization_id,team_id,version_no,effective_from,is_active)
    values(v_org,p_team_id,v_version,p_effective_from,true) returning id into v_new_id;
  for v_index in 1..4 loop
    v_zone:=v_names[v_index];
    select e.value into v_item from jsonb_array_elements(p_ranges) e(value)
      where e.value->>'name'=v_zone;
    insert into public.attendance_zone_ranges(policy_id,zone_name,start_time,end_time,sort_order)
      values(v_new_id,v_zone,(v_item->>'start')::time,
        (v_item->>'end')::time+interval '59 seconds',v_index);
  end loop;
  insert into public.audit_logs(organization_id,actor_user_id,action,entity_type,entity_id,before_data,after_data,source)
    values(v_org,auth.uid(),'ATTENDANCE_POLICY_CREATED','attendance_policies',v_new_id::text,
      case when v_prev.id is not null then to_jsonb(v_prev) else null end,
      jsonb_build_object('team',v_team_name,'version',v_version,'effectiveFrom',p_effective_from,'ranges',p_ranges),
      'admin_control');
  return v_version;
end; $$;

revoke all on function public.admin_create_attendance_policy(uuid,date,jsonb) from public,anon;
grant execute on function public.admin_create_attendance_policy(uuid,date,jsonb) to authenticated;

-- Prevent normal attendance entry from silently restoring archived records.
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
  if exists (select 1 from public.attendance_entries where employee_id=p_employee_id and work_date=p_work_date and deleted_at is not null) then
    raise exception 'Catatan ini berada di arsip. Pulihkan lewat Admin Control dahulu';
  end if;
  if exists (select 1 from public.monthly_period_closings c where c.organization_id=v_org and c.status='closed' and c.period_start=date_trunc('month',p_work_date)::date) then
    raise exception 'Periode laporan sudah ditutup';
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
  returning * into v_result;
  return v_result;
end;
$function$;


-- Protect a closed accounting period when archiving attendance from the dashboard.
create or replace function public.admin_archive_attendance_entry(p_id uuid)
returns boolean language plpgsql security definer set search_path=public,pg_temp
as $$
declare
 v_org uuid:=public.require_admin_organization();
 v_old public.attendance_entries;
begin
 select * into v_old from public.attendance_entries
 where id=p_id and organization_id=v_org and deleted_at is null for update;
 if not found then return false; end if;
 if exists (select 1 from public.monthly_period_closings c
  where c.organization_id=v_org and c.period_start=date_trunc('month',v_old.work_date)::date
   and c.status='closed') then
   raise exception 'Periode laporan sudah ditutup. Buka closing dahulu';
 end if;
 update public.attendance_entries set deleted_at=now(),updated_by=auth.uid(),updated_at=now()
 where id=p_id and organization_id=v_org and deleted_at is null;
 insert into public.audit_logs(organization_id,actor_user_id,action,entity_type,entity_id,before_data,after_data,source)
 values(v_org,auth.uid(),'ATTENDANCE_ARCHIVE','attendance_entries',p_id::text,
 to_jsonb(v_old),jsonb_build_object('deleted_at',now()),'admin_control');
 return true;
end; $$;
revoke all on function public.admin_archive_attendance_entry(uuid) from public,anon;
grant execute on function public.admin_archive_attendance_entry(uuid) to authenticated;


-- Schedule Inventory to use the same zone hours as Produksi from the next Makassar-local day.
-- Existing attendance, existing policy history, and current-day zone evaluation are untouched.
do $inventory_seed$
declare
  v_org uuid;
  v_inventory uuid;
  v_production uuid;
  v_source uuid;
  v_old public.attendance_policies;
  v_new uuid;
  v_effective date := ((now() at time zone 'Asia/Makassar')::date + 1);
begin
  for v_org in select distinct organization_id from public.teams loop
    select id into v_inventory from public.teams
      where organization_id=v_org and name='Inventory' and is_active=true limit 1;
    select id into v_production from public.teams
      where organization_id=v_org and name='Produksi' and is_active=true limit 1;
    if v_inventory is null or v_production is null then
      continue;
    end if;
    select p.id into v_source from public.attendance_policies p
      where p.organization_id=v_org and p.team_id=v_production and p.is_active=true
        and p.effective_from <= v_effective
        and (p.effective_until is null or p.effective_until >= v_effective)
      order by p.effective_from desc,p.version_no desc limit 1;
    if v_source is null then
      raise exception 'Active Produksi zone policy unavailable for migration date';
    end if;
    select * into v_old from public.attendance_policies p
      where p.organization_id=v_org and p.team_id=v_inventory
      order by p.effective_from desc,p.version_no desc limit 1 for update;
    if v_old.id is not null and v_old.effective_from >= v_effective then
      raise exception 'Inventory already has a new/future effective policy: refuse to overwrite';
    end if;
    if v_old.id is not null then
      update public.attendance_policies
        set effective_until=v_effective - 1
        where id=v_old.id and organization_id=v_org;
    end if;
    insert into public.attendance_policies(organization_id,team_id,version_no,effective_from,is_active)
      values(v_org,v_inventory,coalesce(v_old.version_no,0)+1,v_effective,true)
      returning id into v_new;
    insert into public.attendance_zone_ranges(policy_id,zone_name,start_time,end_time,sort_order)
      select v_new,zone_name,start_time,end_time,sort_order
      from public.attendance_zone_ranges where policy_id=v_source;
    insert into public.audit_logs(organization_id,actor_user_id,action,entity_type,entity_id,before_data,after_data,source)
      values(v_org,null,'ATTENDANCE_POLICY_CREATED','attendance_policies',v_new::text,
        case when v_old.id is null then null else to_jsonb(v_old) end,
        jsonb_build_object('team','Inventory','copiedFrom','Produksi','effectiveFrom',v_effective),
        'migration');
    v_inventory:=null;v_production:=null;v_source:=null;
  end loop;
end;
$inventory_seed$;
