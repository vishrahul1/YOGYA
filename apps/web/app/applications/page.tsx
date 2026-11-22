import RequireAuth from "@/components/auth/RequireAuth";
import ApplicationsSection from "@/components/tracking/ApplicationsSection";
import RemindersSection from "@/components/tracking/RemindersSection";

export default function ApplicationsPage() {
  return (
    <RequireAuth role="student">
      <section className="space-y-8">
        <header className="space-y-2">
          <h1 className="text-2xl font-bold text-slate-900">Applications</h1>
          <p className="text-sm text-slate-600">
            Track your own application progress. YOGYA does not submit applications for you.
          </p>
        </header>

        <div className="space-y-4">
          <h2 className="text-xl font-semibold text-slate-900">Your applications</h2>
          <ApplicationsSection />
        </div>

        <div className="space-y-4">
          <h2 className="text-xl font-semibold text-slate-900">Upcoming reminders</h2>
          <RemindersSection />
        </div>
      </section>
    </RequireAuth>
  );
}
