import { UnifiedDashboardAppV3 } from "@/components/unified-dashboard-app-v3";
import { requireUser } from "@/lib/auth";

export default async function DashboardPage() {
  const { supabase, profile, user } = await requireUser();
  const { data, error } = await supabase.rpc("get_unified_app_bundle");

  if (error) {
    return (
      <div className="single-app-fatal">
        <div>
          <strong>Dashboard belum dapat dimuat.</strong>
          <p>{error.message}</p>
        </div>
      </div>
    );
  }

  return (
    <UnifiedDashboardAppV3
      initialBundle={data || {}}
      displayName={profile?.display_name || "Admin"}
      role={String(profile?.role || "viewer")}
      organizationId={String(profile?.organization_id || "")}
      userId={user.id}
    />
  );
}
