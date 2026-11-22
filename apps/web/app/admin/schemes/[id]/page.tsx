import Link from "next/link";
import RequireAuth from "@/components/auth/RequireAuth";
import SchemeDetailPanel from "@/components/admin/SchemeDetailPanel";

interface AdminSchemePageProps {
  params: { id: string };
}

export default function AdminSchemePage({ params }: AdminSchemePageProps) {
  return (
    <RequireAuth role="admin">
      <section className="space-y-6">
        <Link href="/admin" className="text-accent-blue underline">
          Back to admin dashboard
        </Link>
        <SchemeDetailPanel schemeId={params.id} />
      </section>
    </RequireAuth>
  );
}
