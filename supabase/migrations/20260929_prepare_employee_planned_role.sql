-- Applied to Supabase project wmdqqxdyhqxfrtptqwjq on 2026-09-29.
-- planned_role is metadata only; it never grants live admin privileges.

alter table public.employees
  add column if not exists planned_role text not null default 'employee';

alter table public.employees
  drop constraint if exists employees_planned_role_check;

alter table public.employees
  add constraint employees_planned_role_check
  check (planned_role in ('employee','admin'));

comment on column public.employees.planned_role is
  'Future access intent only. Does not grant application privileges; live authorization remains profiles.role.';

create or replace function public.update_employee_master(
  p_id uuid,
  p_code text,
  p_name text,
  p_team_id uuid,
  p_status text,
  p_planned_role text
)
returns boolean
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_org uuid := public.require_admin_organization();
begin
  if nullif(btrim(p_code),'') is null or nullif(btrim(p_name),'') is null then
    raise exception 'Kode dan nama karyawan wajib diisi';
  end if;

  if not exists (
    select 1 from public.teams t
    where t.id = p_team_id and t.organization_id = v_org
  ) then
    raise exception 'Tim tidak valid';
  end if;

  if p_status not in ('active','inactive') then
    raise exception 'Status tidak valid';
  end if;

  if p_planned_role not in ('employee','admin') then
    raise exception 'Rencana role tidak valid';
  end if;

  update public.employees
     set employee_code = upper(btrim(p_code)),
         name = btrim(p_name),
         team_id = p_team_id,
         status = p_status::public.employee_status,
         planned_role = p_planned_role,
         updated_by = auth.uid(),
         updated_at = now()
   where id = p_id
     and organization_id = v_org
     and deleted_at is null;

  return found;
end;
$function$;

revoke execute on function public.update_employee_master(uuid,text,text,uuid,text,text) from public;
revoke execute on function public.update_employee_master(uuid,text,text,uuid,text,text) from anon;
grant execute on function public.update_employee_master(uuid,text,text,uuid,text,text) to authenticated;
