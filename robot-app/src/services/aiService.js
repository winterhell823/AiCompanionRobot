import { apiRequest } from './api';

export async function startAssistantConversation(callbacks) {
  const { Conversation } = await import('@elevenlabs/client');
  const { signedUrl } = await apiRequest({
    url: '/api/assistant/session',
    method: 'POST',
    data: {},
  });

  if (typeof signedUrl !== 'string' || !signedUrl) {
    throw new Error('Backend did not provide an ElevenLabs conversation URL.');
  }

  return Conversation.startSession({
    signedUrl,
    connectionType: 'websocket',
    textOnly: true,
    overrides: { conversation: { textOnly: true } },
    ...callbacks,
  });
}

export async function speakAssistantReply(text) {
  return apiRequest({
    url: '/api/assistant/speak',
    method: 'POST',
    data: { text },
  });
}
