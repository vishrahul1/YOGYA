import RequireAuth from "@/components/auth/RequireAuth";
import SchemeDetailPanel from "@/components/admin/SchemeDetailPanel";

interface AdminSchemePageProps {
  params: { id: string };
}

export default function AdminSchemePage({ params }: AdminSchemePageProps) {
  return (
    <RequireAuth role="admin">
      <section className="space-y-6">
        <SchemeDetailPanel schemeId={params.id} />
      </section>
    </RequireAuth>
  );
}
