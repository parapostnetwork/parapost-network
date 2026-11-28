import { redirect } from "next/navigation";

export default async function GroupConversationPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const { conversationId } = await params;
  redirect(`/messages?group=${encodeURIComponent(conversationId)}`);
}
