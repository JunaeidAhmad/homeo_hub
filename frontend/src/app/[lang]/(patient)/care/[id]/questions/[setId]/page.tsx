import { AnswerForm } from "@/areas/patient/care/AnswerForm";

export default async function QuestionSetAnswerPage({
  params,
}: PageProps<"/[lang]/care/[id]/questions/[setId]">) {
  const { id, setId } = await params;
  return <AnswerForm caseId={id} setId={setId} />;
}
