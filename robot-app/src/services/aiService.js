import { apiRequest } from './api';

export async function sendChatMessage({ text, mode = 'demo' }) {
  if (mode === 'demo') {
    return {
      reply: `Demo response: I have recorded the message "${text}" and will route it to the Qwen backend once live mode is connected.`,
      source: 'demo',
    };
  }

  return apiRequest({
    url: '/api/assistant/chat',
    method: 'POST',
    data: { message: text },
    fallback: {
      reply: 'AI integration is required. Connect the backend to enable Qwen responses.',
      source: 'pending',
    },
  });
}

export async function sendVoicePrompt({ text, mode = 'demo' }) {
  if (mode === 'demo') {
    return { success: true, message: 'Demo voice capture received.' };
  }

  return apiRequest({
    url: '/api/assistant/voice',
    method: 'POST',
    data: { text },
    fallback: { success: false, message: 'Voice integration is required.' },
  });
}
