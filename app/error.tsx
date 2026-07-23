"use client";

import Link from "next/link";
import { PageState, PremiumShell, TopNav } from "@/components/ui/PremiumShell";

export default function ErrorPage({
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <PremiumShell
      topbar={<TopNav eyebrow="Code Golf Arena" title="Route interrupted" />}
    >
      <PageState
        eyebrow="Unexpected error"
        title="This screen could not finish loading."
        description="Your room data was not changed. Retry the screen, or return home and reconnect."
        action={
          <div className="toolbar">
            <button
              className="button button-primary"
              type="button"
              onClick={unstable_retry}
            >
              retry screen
            </button>
            <Link className="button" href="/">
              back home
            </Link>
          </div>
        }
      />
    </PremiumShell>
  );
}
