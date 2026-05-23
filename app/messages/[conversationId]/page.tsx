import { redirect } from "next/navigation";

export default function ConversationPage({
  params,
}: {
  params: { conversationId: string };
}) {
  redirect(`/messages?conversation=${params.conversationId}`);
}
