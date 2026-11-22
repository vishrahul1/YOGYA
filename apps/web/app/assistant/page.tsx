import RequireAuth from "@/components/auth/RequireAuth";
import AssistantChat from "@/components/assistant/AssistantChat";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface AssistantPageProps {
  searchParams: { scheme_version_id?: string | string[] };
}

export default function AssistantPage({ searchParams }: AssistantPageProps) {
  const raw = searchParams.scheme_version_id;
  const candidate = Array.isArray(raw) ? undefined : raw;
  const schemeVersionId = candidate && UUID_PATTERN.test(candidate) ? candidate : null;

  return (
    <RequireAuth role="student">
      <section className="space-y-4">
        <h1 className="text-2xl font-bold text-slate-900">Eligibility assistant</h1>
        <AssistantChat schemeVersionId={schemeVersionId} />
      </section>
    </RequireAuth>
  );
}
