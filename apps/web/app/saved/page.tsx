import RequireAuth from "@/components/auth/RequireAuth";
import SavedSchemesList from "@/components/tracking/SavedSchemesList";

export default function SavedPage() {
  return (
    <RequireAuth role="student">
      <section className="space-y-6">
        <header className="space-y-2">
          <h1 className="text-2xl font-bold text-slate-900">Saved scholarships</h1>
          <p className="text-sm text-slate-600">
            Scholarships you saved from the catalogue. Saving does not apply to them.
          </p>
        </header>
        <SavedSchemesList />
      </section>
    </RequireAuth>
  );
}
