-- Preserve existing rows; distinguish checklist departments and extend error types.
alter table public.inventory_tasks add column if not exists department text not null default 'Inventory';
alter table public.inventory_tasks add constraint inventory_tasks_department_check check(department in ('Inventory','Admin'));
alter table public.inventory_tasks drop constraint inventory_tasks_organization_id_name_key;
alter table public.inventory_tasks add constraint inventory_tasks_org_department_name_key unique(organization_id,department,name);
alter table public.error_cases drop constraint error_cases_error_type_check;
alter table public.error_cases add constraint error_cases_error_type_check check(error_type in ('Packaging','Pengantaran','Belanja','Inventory','Admin'));
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
 if v_team is null then
   raise exception 'Bagian aktif tidak ditemukan';
 end if;
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
drop trigger if exists audit_attendance_policy_change on public.attendance_policies;
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

-- Add first policy for existing Admin without altering other policies/history.
with sources as (
 select t.id team_id,t.organization_id,src.id source_id
 from public.teams t cross join lateral (
 select p.id from public.attendance_policies p join public.teams pt on pt.id=p.team_id
 where p.organization_id=t.organization_id and pt.name='Produksi' and p.is_active
 and p.effective_from<=(now() at time zone 'Asia/Makassar')::date and (p.effective_until is null or p.effective_until>=(now() at time zone 'Asia/Makassar')::date)
 order by p.effective_from desc,p.version_no desc limit 1) src
 where t.name='Admin' and not exists(select 1 from public.attendance_policies p where p.team_id=t.id)
), inserted as (
 insert into public.attendance_policies(organization_id,team_id,version_no,effective_from,is_active)
 select organization_id,team_id,1,(now() at time zone 'Asia/Makassar')::date,true from sources returning id,team_id
)
insert into public.attendance_zone_ranges(policy_id,zone_name,start_time,end_time,sort_order)
select i.id,r.zone_name,r.start_time,date_trunc('minute',date '2000-01-01'+r.end_time)::time+interval '59 seconds',r.sort_order
from inserted i join sources s on s.team_id=i.team_id join public.attendance_zone_ranges r on r.policy_id=s.source_id;
create or replace function public.admin_create_attendance_team(p_name text) returns uuid
language plpgsql security invoker set search_path=public,pg_temp as $team$
declare v_org uuid:=public.require_admin_organization(); v_team uuid; v_source uuid; v_policy uuid;
begin
 if p_name is null or char_length(btrim(p_name)) not between 1 and 60 then raise exception 'Nama bagian wajib diisi (maksimal 60 karakter)'; end if;
 if exists(select 1 from public.teams where organization_id=v_org and lower(name)=lower(btrim(p_name))) then raise exception 'Nama bagian sudah tersedia'; end if;
 select p.id into v_source from public.attendance_policies p join public.teams t on t.id=p.team_id
 where p.organization_id=v_org and t.name='Produksi' and p.is_active and p.effective_from<=(now() at time zone 'Asia/Makassar')::date and (p.effective_until is null or p.effective_until>=(now() at time zone 'Asia/Makassar')::date)
 order by p.effective_from desc,p.version_no desc limit 1;
 if v_source is null then raise exception 'Zona Produksi belum tersedia'; end if;
 insert into public.teams(organization_id,code,name,is_active) values(v_org,'TEAM-'||gen_random_uuid()::text,btrim(p_name),true) returning id into v_team;
 insert into public.attendance_policies(organization_id,team_id,version_no,effective_from,is_active) values(v_org,v_team,1,(now() at time zone 'Asia/Makassar')::date,true) returning id into v_policy;
 insert into public.attendance_zone_ranges(policy_id,zone_name,start_time,end_time,sort_order)
 select v_policy,zone_name,start_time,date_trunc('minute',date '2000-01-01'+end_time)::time+interval '59 seconds',sort_order from public.attendance_zone_ranges where policy_id=v_source;
 return v_team;
end;$team$;
revoke execute on function public.admin_create_attendance_team(text) from public,anon;
grant execute on function public.admin_create_attendance_team(text) to authenticated;
CREATE OR REPLACE FUNCTION public.get_unified_app_bundle()
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
declare
  v_org uuid;
  v_role text;
  v_today date := (now() at time zone 'Asia/Makassar')::date;
  v_month_start date := date_trunc('month', v_today)::date;
  v_month_end date := (date_trunc('month', v_today) + interval '1 month - 1 day')::date;
begin
  select p.organization_id, p.role::text into v_org, v_role
  from public.profiles p
  where p.id = auth.uid() and p.is_active = true;
  if v_org is null then raise exception 'Authentication required'; end if;

  return jsonb_build_object(
    'today', v_today,
    'dashboard', public.get_dashboard_snapshot(v_month_start, v_month_end, v_today),
    'employees', coalesce((select jsonb_agg(jsonb_build_object(
      'id',e.id,'code',e.employee_code,'name',e.name,'teamId',e.team_id,'team',t.name,'status',e.status::text,'userId',e.user_id
    ) order by e.name) from public.employees e join public.teams t on t.id=e.team_id
    where e.organization_id=v_org and e.deleted_at is null),'[]'::jsonb),
    'teams', coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'name',t.name,'active',t.is_active) order by t.name)
      from public.teams t where t.organization_id=v_org),'[]'::jsonb),
    'kpis', coalesce((select jsonb_agg(jsonb_build_object(
      'id',k.id,'code',k.kpi_code,'name',k.name,'category',k.category,'active',k.is_active,
      'unit',kv.unit,'points',kv.points_per_unit,'version',kv.version_no,'effectiveFrom',kv.effective_from
    ) order by k.kpi_code)
      from public.kpis k
      left join lateral (
        select v.unit,v.points_per_unit,v.version_no,v.effective_from
        from public.kpi_versions v where v.kpi_id=k.id and v.effective_from<=v_today
        order by v.effective_from desc,v.version_no desc limit 1
      ) kv on true
      where k.organization_id=v_org and k.deleted_at is null),'[]'::jsonb),
    'tasks', coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'name',i.name,'active',i.is_active,'sortOrder',i.sort_order,'department',i.department) order by i.sort_order)
      from public.inventory_tasks i where i.organization_id=v_org and i.deleted_at is null),'[]'::jsonb),
    'production', coalesce((select jsonb_agg(to_jsonb(x) order by x.work_date desc,x.created_at desc) from (
      select pe.id,pe.work_date,pe.quantity,pe.unit_snapshot,pe.points_per_unit_snapshot,pe.total_points,pe.notes,pe.created_at,
             e.id employee_id,e.name employee_name,k.id kpi_id,k.name kpi_name
      from public.production_entries pe join public.employees e on e.id=pe.employee_id join public.kpis k on k.id=pe.kpi_id
      where pe.organization_id=v_org and pe.deleted_at is null order by pe.work_date desc,pe.created_at desc limit 500
    ) x),'[]'::jsonb),
    'inventory', coalesce((select jsonb_agg(to_jsonb(x) order by x.work_date desc,x.created_at desc) from (
      select i.id,i.work_date,i.work_status,i.notes,i.created_at,e.id employee_id,e.name employee_name,t.id task_id,t.name task_name,t.department
      from public.inventory_entries i join public.employees e on e.id=i.employee_id join public.inventory_tasks t on t.id=i.task_id
      where i.organization_id=v_org and i.deleted_at is null order by i.work_date desc,i.created_at desc limit 500
    ) x),'[]'::jsonb),
    'attendance', coalesce((select jsonb_agg(to_jsonb(x) order by x.work_date desc,x.created_at desc) from (
      select a.id,a.work_date,a.attendance_status,a.arrival_time,a.zone_result,a.notes,a.created_at,e.id employee_id,e.name employee_name
      from public.attendance_entries a join public.employees e on e.id=a.employee_id
      where a.organization_id=v_org and a.deleted_at is null order by a.work_date desc,a.created_at desc limit 500
    ) x),'[]'::jsonb),
    'errors', coalesce((select jsonb_agg(to_jsonb(x) order by x.error_date desc,x.created_at desc) from (
      select er.id,er.error_date,er.error_type,er.chronology,er.evaluation_status,er.customer_name_snapshot,er.severity,er.notes,er.created_at,
             ep.name performer_name,er.performer_employee_id,er.responsible_employee_id,rp.name responsible_name,er.order_id
      from public.error_cases er left join public.employees ep on ep.id=er.performer_employee_id left join public.employees rp on rp.id=er.responsible_employee_id
      where er.organization_id=v_org and er.deleted_at is null order by er.error_date desc,er.created_at desc limit 500
    ) x),'[]'::jsonb),
    'orders', coalesce((select jsonb_agg(to_jsonb(x) order by x.order_date desc,x.created_at desc) from (
      select o.id,o.order_date,o.order_number,o.customer_name_snapshot,o.total_products,o.status,o.notes,o.created_at,
             o.responsible_employee_id,e.name responsible_name,
             coalesce((select jsonb_agg(jsonb_build_object('employeeId',oa.employee_id,'name',ae.name,'quantity',oa.quantity) order by ae.name)
                       from public.order_allocations oa join public.employees ae on ae.id=oa.employee_id where oa.order_id=o.id),'[]'::jsonb) allocations
      from public.orders o join public.employees e on e.id=o.responsible_employee_id
      where o.organization_id=v_org and o.deleted_at is null order by o.order_date desc,o.created_at desc limit 500
    ) x),'[]'::jsonb),
    'settings', coalesce((select jsonb_object_agg(s.setting_key,s.setting_value) from public.app_settings s where s.organization_id=v_org),'{}'::jsonb),
    'attendancePolicies', coalesce((select jsonb_agg(jsonb_build_object(
      'id',p.id,'version',p.version_no,'effectiveFrom',p.effective_from,'effectiveUntil',p.effective_until,'active',p.is_active,'team',t.name,
      'ranges',coalesce((select jsonb_agg(jsonb_build_object('name',r.zone_name,'start',r.start_time,'end',r.end_time,'sort',r.sort_order) order by r.sort_order)
                         from public.attendance_zone_ranges r where r.policy_id=p.id),'[]'::jsonb)
    ) order by p.effective_from desc,p.version_no desc)
      from public.attendance_policies p join public.teams t on t.id=p.team_id where p.organization_id=v_org),'[]'::jsonb),
    'inventoryTargets', coalesce((select jsonb_agg(jsonb_build_object('id',it.id,'task',tk.name,'target',it.target_count,'period',it.period_type,'effectiveFrom',it.effective_from,'effectiveUntil',it.effective_until) order by it.effective_from desc)
      from public.inventory_targets it join public.inventory_tasks tk on tk.id=it.task_id where it.organization_id=v_org),'[]'::jsonb),
    'users', case when v_role in ('admin','superadmin') then coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'email',p.email,'name',p.display_name,'role',p.role::text,'active',p.is_active) order by p.created_at desc)
      from public.profiles p where p.organization_id=v_org),'[]'::jsonb) else '[]'::jsonb end,
    'audit', case when v_role in ('admin','superadmin') then coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from (
      select a.id,a.created_at,a.action,a.entity_type,a.entity_id,a.source,a.actor_user_id,p.display_name actor_name
      from public.audit_logs a left join public.profiles p on p.id=a.actor_user_id where a.organization_id=v_org order by a.created_at desc limit 100
    ) x),'[]'::jsonb) else '[]'::jsonb end,
    'admin', case when v_role in ('admin','superadmin') then public.admin_control_snapshot() else null end
  );
end;
$function$

CREATE OR REPLACE FUNCTION public.get_management_analytics(p_period date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
declare
  v_org uuid;
  v_today date := (now() at time zone 'Asia/Makassar')::date;
  v_start date;
  v_end date;
  v_prev_start date;
  v_prev_end date;
  v_selected date := coalesce(p_period, (now() at time zone 'Asia/Makassar')::date);
begin
  select p.organization_id into v_org
  from public.profiles p where p.id=auth.uid() and p.is_active=true;
  if v_org is null then raise exception 'Authentication required'; end if;

  v_start := date_trunc('month', v_selected)::date;
  v_end := (date_trunc('month', v_selected) + interval '1 month - 1 day')::date;
  if v_start = date_trunc('month', v_today)::date then v_end := least(v_end, v_today); end if;
  v_prev_start := (v_start - interval '1 month')::date;
  if v_start = date_trunc('month', v_today)::date then
    v_prev_end := least((date_trunc('month', v_prev_start) + interval '1 month - 1 day')::date, v_prev_start + (v_end - v_start));
  else
    v_prev_end := (date_trunc('month', v_prev_start) + interval '1 month - 1 day')::date;
  end if;

  return jsonb_build_object(
    'period', jsonb_build_object(
      'start',v_start,'end',v_end,'previousStart',v_prev_start,'previousEnd',v_prev_end,
      'isCurrent',v_start=date_trunc('month',v_today)::date,
      'label',to_char(v_start,'TMMonth YYYY'),'comparisonLabel',to_char(v_prev_start,'TMMonth YYYY')
    ),
    'availableMonths', coalesce((
      select jsonb_agg(m order by m desc) from (
        select distinct date_trunc('month',d)::date m from (
          select work_date d from public.production_entries where organization_id=v_org and deleted_at is null
          union all select work_date from public.attendance_entries where organization_id=v_org and deleted_at is null
          union all select work_date from public.inventory_entries where organization_id=v_org and deleted_at is null
          union all select error_date from public.error_cases where organization_id=v_org and deleted_at is null
        ) z
      ) q
    ), '[]'::jsonb),
    'employees', coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'code',e.employee_code,'name',e.name,'team',t.name,'status',e.status::text) order by t.name,e.name)
      from public.employees e join public.teams t on t.id=e.team_id where e.organization_id=v_org and e.deleted_at is null),'[]'::jsonb),
    'tasks', coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'name',i.name,'active',i.is_active,'sortOrder',i.sort_order,'department',i.department) order by i.sort_order,i.name)
      from public.inventory_tasks i where i.organization_id=v_org),'[]'::jsonb),
    'production', coalesce((select jsonb_agg(to_jsonb(x) order by x.work_date,x.employee_name,x.kpi_name) from (
      select pe.id,pe.work_date,pe.employee_id,e.name employee_name,e.employee_code,pe.kpi_id,k.name kpi_name,
             pe.quantity,pe.unit_snapshot,pe.points_per_unit_snapshot,pe.total_points,pe.notes
      from public.production_entries pe join public.employees e on e.id=pe.employee_id join public.kpis k on k.id=pe.kpi_id
      where pe.organization_id=v_org and pe.deleted_at is null and pe.work_date between v_start and v_end
    ) x),'[]'::jsonb),
    'productionPrevious', coalesce((select jsonb_agg(to_jsonb(x)) from (
      select pe.work_date,pe.employee_id,e.name employee_name,pe.kpi_id,k.name kpi_name,pe.quantity,pe.total_points
      from public.production_entries pe join public.employees e on e.id=pe.employee_id join public.kpis k on k.id=pe.kpi_id
      where pe.organization_id=v_org and pe.deleted_at is null and pe.work_date between v_prev_start and v_prev_end
    ) x),'[]'::jsonb),
    'attendance', coalesce((select jsonb_agg(to_jsonb(x) order by x.work_date,x.employee_name) from (
      select a.id,a.work_date,a.employee_id,e.name employee_name,e.employee_code,t.name team,a.attendance_status,a.arrival_time,a.zone_result,a.notes
      from public.attendance_entries a join public.employees e on e.id=a.employee_id join public.teams t on t.id=e.team_id
      where a.organization_id=v_org and a.deleted_at is null and a.work_date between v_start and v_end
    ) x),'[]'::jsonb),
    'attendancePrevious', coalesce((select jsonb_agg(to_jsonb(x)) from (
      select a.work_date,a.employee_id,a.attendance_status,a.zone_result
      from public.attendance_entries a where a.organization_id=v_org and a.deleted_at is null and a.work_date between v_prev_start and v_prev_end
    ) x),'[]'::jsonb),
    'inventory', coalesce((select jsonb_agg(to_jsonb(x) order by x.work_date,x.employee_name,x.task_name) from (
      select i.id,i.work_date,i.employee_id,e.name employee_name,i.task_id,t.name task_name,t.department,i.work_status,i.notes
      from public.inventory_entries i join public.employees e on e.id=i.employee_id join public.inventory_tasks t on t.id=i.task_id
      where i.organization_id=v_org and i.deleted_at is null and i.work_date between v_start and v_end
    ) x),'[]'::jsonb),
    'inventoryPrevious', coalesce((select jsonb_agg(to_jsonb(x)) from (
      select i.work_date,i.employee_id,i.task_id,i.work_status
      from public.inventory_entries i where i.organization_id=v_org and i.deleted_at is null and i.work_date between v_prev_start and v_prev_end
    ) x),'[]'::jsonb),
    'errors', coalesce((select jsonb_agg(to_jsonb(x) order by x.error_date,x.error_type) from (
      select er.id,er.error_date,er.error_type,er.chronology,er.evaluation_status,er.customer_name_snapshot,er.severity,er.notes,
             er.performer_employee_id,ep.name performer_name,er.responsible_employee_id,rp.name responsible_name
      from public.error_cases er left join public.employees ep on ep.id=er.performer_employee_id left join public.employees rp on rp.id=er.responsible_employee_id
      where er.organization_id=v_org and er.deleted_at is null and er.error_date between v_start and v_end
    ) x),'[]'::jsonb),
    'errorsPrevious', coalesce((select jsonb_agg(to_jsonb(x)) from (
      select er.error_date,er.error_type,er.performer_employee_id,er.responsible_employee_id,er.severity
      from public.error_cases er where er.organization_id=v_org and er.deleted_at is null and er.error_date between v_prev_start and v_prev_end
    ) x),'[]'::jsonb),
    'trend6', coalesce((select jsonb_agg(to_jsonb(x) order by x.month_start) from (
      with months as (
        select generate_series(date_trunc('month',v_start)-interval '5 months',date_trunc('month',v_start),interval '1 month')::date month_start
      )
      select m.month_start,
        coalesce((select sum(pe.total_points) from public.production_entries pe where pe.organization_id=v_org and pe.deleted_at is null and pe.work_date>=m.month_start and pe.work_date<(m.month_start+interval '1 month')::date),0) points,
        coalesce((select count(*) from public.production_entries pe where pe.organization_id=v_org and pe.deleted_at is null and pe.work_date>=m.month_start and pe.work_date<(m.month_start+interval '1 month')::date),0) production_entries,
        coalesce((select count(*) from public.attendance_entries a where a.organization_id=v_org and a.deleted_at is null and a.attendance_status='Hadir' and a.work_date>=m.month_start and a.work_date<(m.month_start+interval '1 month')::date),0) hadir,
        coalesce((select count(*) from public.error_cases er where er.organization_id=v_org and er.deleted_at is null and er.error_date>=m.month_start and er.error_date<(m.month_start+interval '1 month')::date),0) errors
      from months m
    ) x),'[]'::jsonb),
    'closing', coalesce((select jsonb_build_object('status',c.status,'note',c.note,'closedAt',c.closed_at,'reopenedAt',c.reopened_at,'closedBy',p.display_name)
      from public.monthly_period_closings c left join public.profiles p on p.id=c.closed_by
      where c.organization_id=v_org and c.period_start=v_start),'null'::jsonb),
    'snapshotMeta', coalesce((select jsonb_build_object('id',s.id,'version',s.version_no,'generatedAt',s.generated_at,'generatedBy',p.display_name)
      from public.monthly_report_snapshots s left join public.profiles p on p.id=s.generated_by
      where s.organization_id=v_org and s.period_start=v_start order by s.version_no desc limit 1),'null'::jsonb)
  );
end;
$function$

CREATE OR REPLACE FUNCTION public.upsert_inventory_entry(p_work_date date, p_employee_id uuid, p_task_id uuid, p_work_status text, p_notes text DEFAULT NULL::text)
 RETURNS inventory_entries
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_org uuid := private.current_org_id();
  v_result public.inventory_entries;
begin
  if p_work_status not in ('Selesai','Belum selesai','Tidak ada kebutuhan','Ada kendala') then raise exception 'Invalid inventory status'; end if;
  if p_work_status='Ada kendala' and nullif(btrim(coalesce(p_notes,'')),'') is null then raise exception 'Notes required for issue'; end if;
  if not exists (select 1 from public.employees e join public.teams t on t.id=e.team_id where e.id=p_employee_id and e.organization_id=v_org and e.status='active' and e.deleted_at is null and t.name in ('Inventory','Admin')) then raise exception 'Active inventory employee not found'; end if;
  if not exists (select 1 from public.inventory_tasks it join public.employees e on e.id=p_employee_id join public.teams t on t.id=e.team_id where it.id=p_task_id and it.organization_id=v_org and it.is_active=true and it.deleted_at is null and it.department=t.name) then raise exception 'Checklist tidak sesuai bagian petugas'; end if;

  insert into public.inventory_entries (organization_id,work_date,employee_id,task_id,work_status,notes,created_by,updated_by)
  values (v_org,p_work_date,p_employee_id,p_task_id,p_work_status,p_notes,auth.uid(),auth.uid())
  on conflict (employee_id,work_date,task_id) do update set
    work_status=excluded.work_status,
    notes=excluded.notes,
    updated_by=auth.uid(),
    updated_at=now(),
    deleted_at=null
  returning * into v_result;
  return v_result;
end;
$function$

