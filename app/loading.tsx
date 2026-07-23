import { PageState, PremiumShell, TopNav } from "@/components/ui/PremiumShell";

export default function Loading() {
  return (
    <PremiumShell
      topbar={<TopNav eyebrow="Code Golf Arena" title="Opening workspace" />}
    >
      <PageState
        loading
        eyebrow="Loading"
        title="Preparing the arena."
        description="Restoring the route and its realtime controls."
      />
    </PremiumShell>
  );
}
