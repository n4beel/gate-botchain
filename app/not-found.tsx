import Link from "next/link";
import Button from "@/components/ui/Button";
import Panel from "@/components/ui/Panel";

export default function NotFound() {
  return (
    <div className="flex flex-col gap-6 py-12 items-center text-center">
      <Panel variant="docket" className="max-w-md w-full p-8 flex flex-col items-center gap-4">
        <span className="mono text-4xl font-extrabold text-[var(--text-muted)]">
          404
        </span>
        <div>
          <h1 className="text-xl font-bold display-title text-[var(--text-primary)]">
            Ticket Not Found
          </h1>
          <p className="text-xs text-[var(--text-secondary)] mt-1 leading-relaxed">
            The gate or pass ticket you requested could not be found at this turnstile.
          </p>
        </div>

        <Link href="/" className="no-underline mt-2">
          <Button variant="primary" size="md">
            Return to Rack
          </Button>
        </Link>
      </Panel>
    </div>
  );
}
