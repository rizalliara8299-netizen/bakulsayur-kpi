-- Correct the employee model: Admin is a team, not an employee access role.
-- Live authorization remains in public.profiles.role and is intentionally separate.

update public.teams
set code = 'ADM',
    name = 'Admin',
    updated_at = now()
where code = 'MGT'
  and name = 'Management';

drop function if exists public.update_employee_master(uuid,text,text,uuid,text,text);

alter table public.employees
  drop constraint if exists employees_planned_role_check;

alter table public.employees
  drop column if exists planned_role;
