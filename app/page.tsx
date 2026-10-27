import Panel from "@/components/ui/Panel";
import { app } from "@/lib/app-config";

export default function Home() {
  return (
    <div className="flex flex-col gap-4">
      <Panel>
        <h1 className="text-xl font-bold display-title text-[var(--text-primary)]">
          {app.name}
        </h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          {app.tagline}
        </p>
      </Panel>
    </div>
  );
}
