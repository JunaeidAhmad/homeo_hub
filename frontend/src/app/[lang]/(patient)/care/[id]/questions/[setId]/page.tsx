import { Suspense } from "react";

import { AnswerForm } from "@/areas/patient/care/AnswerForm";
import { PageLoading } from "@/components/shell/PageLoading";

type Params = PageProps<"/[lang]/care/[id]/questions/[setId]">["params"];

// The ids are read under Suspense so a navigation here can show the loading state at once.
async function Answers({ params }: { params: Params }) {
  const { id, setId } = await params;
  return <AnswerForm caseId={id} setId={setId} />;
}

export default function QuestionSetAnswerPage({
  params,
}: PageProps<"/[lang]/care/[id]/questions/[setId]">) {
  return (
    <Suspense fallback={<PageLoading />}>
      <Answers params={params} />
    </Suspense>
  );
}
