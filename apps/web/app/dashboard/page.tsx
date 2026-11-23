import RequireAuth from "@/components/auth/RequireAuth";
import ApplicationProgressSection from "@/components/dashboard/ApplicationProgressSection";
import PendingDocumentTasksSection from "@/components/dashboard/PendingDocumentTasksSection";
import ProfileSummary from "@/components/dashboard/ProfileSummary";
import SavedSchemesSection from "@/components/dashboard/SavedSchemesSection";
import UpcomingRemindersSection from "@/components/dashboard/UpcomingRemindersSection";

export default function DashboardPage() {
  return (
    <RequireAuth role="student">
      <section className="space-y-6">
        <h1 className="text-2xl font-bold text-slate-900">Student dashboard</h1>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <ProfileSummary />
          <SavedSchemesSection />
          <ApplicationProgressSection />
          <UpcomingRemindersSection />
          <PendingDocumentTasksSection />
        </div>
      </section>
    </RequireAuth>
  );
}
