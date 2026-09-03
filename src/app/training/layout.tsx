import TrainingNav from "@/components/TrainingNav";

export default function TrainingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Training</h1>
        <p className="mt-1 text-sm text-muted">
          The playbook and the practice range. Everything here pays points on the leaderboard.
        </p>
      </div>
      <TrainingNav />
      {children}
    </div>
  );
}
