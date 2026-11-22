import Link from "next/link";
import RequireAuth from "@/components/auth/RequireAuth";
import ApplicationProgressSection from "@/components/dashboard/ApplicationProgressSection";
import PendingDocumentTasksSection from "@/components/dashboard/PendingDocumentTasksSection";
import ProfileSummary from "@/components/dashboard/ProfileSummary";
import SavedSchemesSection from "@/components/dashboard/SavedSchemesSection";
import UpcomingRemindersSection from "@/components/dashboard/UpcomingRemindersSection";
import Card from "@/components/ui/Card";

export default function DashboardPage() {
  return (
    <RequireAuth role="student">
      <section className="space-y-6">
        <h1 className="text-2xl font-bold text-slate-900">Student dashboard</h1>

        <Card className="space-y-2">
          <h2 className="text-lg font-semibold text-slate-900">Eligibility assistant</h2>
          <p className="text-sm text-slate-700">
            Describe your circumstances in Telugu or English and get help with your details and
            checklist. The assistant does not decide eligibility.
          </p>
          <Link href="/assistant" className="inline-block text-accent-blue underline">
            Open the assistant
          </Link>
        </Card>

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
