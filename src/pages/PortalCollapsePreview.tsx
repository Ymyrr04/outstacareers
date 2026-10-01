// TEMP: visual check only, removed after verification
import { ContractorProfilePanel } from '@/pages/ClientPortalDashboard';

export default function PortalCollapsePreview() {
  const assignments: any[] = [
    { id: 'a1', job_title: 'Bilingual Medical Biller', hours_per_week: 40, timezone: 'EST', start_date: '2026-06-01', status: 'active', sunday_hours_excluded: false, applicant: { full_name: 'Laura Juliana Rincon Sanchez', email: 'l@example.com' } },
    { id: 'a2', job_title: 'CSR', hours_per_week: 40, timezone: 'EST', start_date: null, status: 'inactive', sunday_hours_excluded: false, applicant: { full_name: 'Mark Anthony Chua', email: 'm@example.com' } },
  ];
  return (
    <div className="min-h-screen bg-muted/20">
      <main className="max-w-7xl mx-auto px-4 py-6">
        <h1 className="text-xl font-semibold mb-3">Submitted Timesheets</h1>
        <ContractorProfilePanel assignments={assignments} clientName="Test Client" />
      </main>
    </div>
  );
}
