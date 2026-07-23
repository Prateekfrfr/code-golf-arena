import Link from "next/link";
import { PageState, PremiumShell, TopNav } from "@/components/ui/PremiumShell";

export default function NotFound() {
  return (
    <PremiumShell
      topbar={<TopNav eyebrow="404" title="Route not found" />}
    >
      <PageState
        eyebrow="Unknown route"
        title="There is no arena here."
        description="Check the room link, or return home to create a new round."
        action={
          <Link className="button button-primary" href="/">
            back home
          </Link>
        }
      />
    </PremiumShell>
  );
}
