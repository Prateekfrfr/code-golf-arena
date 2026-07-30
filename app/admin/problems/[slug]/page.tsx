import { ProblemEditor } from "@/components/admin/ProblemEditor";

export default async function EditProblemPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <ProblemEditor slug={slug} />;
}

