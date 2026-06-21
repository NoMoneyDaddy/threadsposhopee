import RunPipelineButton from "@/components/RunPipelineButton";
import LiveDashboard from "@/components/LiveDashboard";
import SetupGuide from "@/components/SetupGuide";
import { getCurrentUser } from "@/lib/auth";
import { getSetupSteps } from "@/lib/setup-status";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  const steps = user ? await getSetupSteps(user) : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">儀表板</h1>
          <p className="text-sm text-ink-2">即時連動各服務，每 20 秒自動更新</p>
        </div>
        <RunPipelineButton />
      </div>

      {steps.length > 0 && <SetupGuide steps={steps} />}

      <LiveDashboard />
    </div>
  );
}
