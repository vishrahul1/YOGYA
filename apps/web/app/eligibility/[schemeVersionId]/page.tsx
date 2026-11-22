import RequireAuth from "@/components/auth/RequireAuth";
import EligibilityResult from "@/components/eligibility/EligibilityResult";
import ErrorMessage from "@/components/ui/ErrorMessage";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface EligibilityPageProps {
  params: { schemeVersionId: string };
}

export default function EligibilityPage({ params }: EligibilityPageProps) {
  const { schemeVersionId } = params;
  return (
    <RequireAuth role="student">
      <section className="space-y-4">
        <h1 className="text-2xl font-bold text-slate-900">Eligibility check</h1>
        {UUID_PATTERN.test(schemeVersionId) ? (
          <EligibilityResult schemeVersionId={schemeVersionId} />
        ) : (
          <ErrorMessage message="This scholarship link is not valid. Choose a scholarship from the catalogue." />
        )}
      </section>
    </RequireAuth>
  );
}
