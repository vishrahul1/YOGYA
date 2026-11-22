import RequireAuth from "@/components/auth/RequireAuth";
import ChecklistSection from "@/components/tracking/ChecklistSection";

export default function ChecklistsPage() {
  return (
    <RequireAuth role="student">
      <section className="space-y-6">
        <header className="space-y-2">
          <h1 className="text-2xl font-bold text-slate-900">Document checklist</h1>
          <p className="text-sm text-slate-600">
            Mark documents as prepared as you gather them. Check the official requirements on the
            scheme page.
          </p>
        </header>
        <ChecklistSection />
      </section>
    </RequireAuth>
  );
}
