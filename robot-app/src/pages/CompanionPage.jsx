import { Bot, Mic, SendHorizonal, Speaker, Trash2, Waves } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { conversation } from '../data/demoData';
import { useRobot } from '../context/RobotContext';
import { apiRequest } from '../services/api';
import { speakAssistantReply, startAssistantConversation } from '../services/aiService';

const weatherQuestion = /\b(weather|wheather|wether|forecast|temperature|rain|raining|snow|wind|humidity|umbrella)\b/i;

export default function CompanionPage() {
  const { mode } = useRobot();
  const [messages, setMessages] = useState(conversation);
  const [draft, setDraft] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [speakerEnabled, setSpeakerEnabled] = useState(true);
  const [agentStatus, setAgentStatus] = useState('Disconnected');
  const [error, setError] = useState('');
  const conversationRef = useRef(null);
  const speakerEnabledRef = useRef(speakerEnabled);

  useEffect(() => {
    speakerEnabledRef.current = speakerEnabled;
  }, [speakerEnabled]);

  useEffect(() => {
    if (mode === 'demo' && conversationRef.current) {
      const activeConversation = conversationRef.current;
      conversationRef.current = null;
      activeConversation.endSession().catch((sessionError) => {
        setError(sessionError.message || 'Could not close the ElevenLabs session.');
      });
    }
  }, [mode]);

  useEffect(
    () => () => {
      const activeConversation = conversationRef.current;
      conversationRef.current = null;
      if (activeConversation) {
        activeConversation.endSession().catch((sessionError) => {
          console.error('Could not close the ElevenLabs session:', sessionError);
        });
      }
    },
    [],
  );

  const getConversation = async () => {
    if (conversationRef.current) return conversationRef.current;

    const activeConversation = await startAssistantConversation({
      onMessage: ({ message, source }) => {
        if (source !== 'ai' || !message?.trim()) return;
        setMessages((current) => [
          ...current,
          { speaker: 'robot', text: message.trim(), time: 'Now' },
        ]);
        setIsThinking(false);

        if (speakerEnabledRef.current) {
          speakAssistantReply(message).catch((speakError) => {
            setError(`Reply received, but speaker playback failed: ${speakError.message}`);
          });
        }
      },
      onStatusChange: ({ status }) => setAgentStatus(status),
      onDisconnect: () => {
        conversationRef.current = null;
        setAgentStatus('Disconnected');
      },
      onError: (message) => {
        setError(message || 'ElevenLabs conversation failed.');
        setIsThinking(false);
      },
    });

    conversationRef.current = activeConversation;
    return activeConversation;
  };

  const submitMessage = async () => {
    const text = draft.trim();
    if (!text || isThinking) return;

    setMessages((current) => [...current, { speaker: 'user', text, time: 'Now' }]);
    setDraft('');
    setError('');
    setIsThinking(true);

    if (mode === 'demo') {
      window.setTimeout(() => {
        setMessages((current) => [
          ...current,
          {
            speaker: 'robot',
            text: 'Demo response: switch to Live mode to connect to the ElevenLabs agent.',
            time: 'Now',
          },
        ]);
        setIsThinking(false);
      }, 800);
      return;
    }

    try {
      if (weatherQuestion.test(text)) {
        const { reply } = await apiRequest({
          url: '/api/assistant/weather',
          method: 'POST',
          data: { message: text },
        });
        setMessages((current) => [...current, { speaker: 'robot', text: reply, time: 'Now' }]);
        setIsThinking(false);
        if (speakerEnabledRef.current) {
          speakAssistantReply(reply).catch((speakError) => {
            setError(`Reply received, but speaker playback failed: ${speakError.message}`);
          });
        }
        return;
      }

      const activeConversation = await getConversation();
      activeConversation.sendUserMessage(text);
    } catch (sendError) {
      setError(sendError.message || 'Could not send the message to ElevenLabs.');
      setIsThinking(false);
    }
  };

  return (
    <div className="space-y-6 pb-8">
      <div className="grid gap-6 xl:grid-cols-[1.6fr_0.7fr]">
        <div className="dark-panel rounded-2xl border border-slate-800 p-4">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Conversation</div>
              <h2 className="mt-1 text-xl font-semibold text-white">AI companion</h2>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" className="btn-secondary" onClick={() => setMessages([])}>
                <Trash2 size={14} /> Clear
              </button>
            </div>
          </div>

          <div className="flex min-h-[460px] flex-col justify-between rounded-2xl border border-slate-800 bg-slate-950/70 p-3">
            <div className="space-y-3">
              {messages.length === 0 ? (
                <div className="flex min-h-[320px] items-center justify-center text-sm text-slate-400">No conversation history yet.</div>
              ) : (
                messages.map((entry, index) => (
                  <div key={`${entry.speaker}-${index}`} className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${entry.speaker === 'user' ? 'ml-auto bg-cyan-500/15 text-cyan-50' : 'mr-auto bg-slate-800 text-slate-100'}`}>
                    <div className="mb-1 text-[10px] uppercase tracking-[0.18em] text-slate-400">{entry.speaker}</div>
                    {entry.text}
                  </div>
                ))
              )}
              {isThinking && <div className="text-xs uppercase tracking-[0.18em] text-slate-400">AI is processing…</div>}
              {error && <div role="alert" className="text-sm text-rose-300">{error}</div>}
            </div>

            <div className="mt-4 space-y-3">
              <div className="flex gap-2">
                <textarea value={draft} onChange={(event) => setDraft(event.target.value)} rows="3" placeholder="Ask the robot a question…" className="input-field flex-1 resize-none" />
              </div>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span title="Voice input is handled by the robot microphone and backend." className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-300">
                    <Mic size={14} /> Robot mic
                  </span>
                  <button type="button" className="btn-secondary" aria-pressed={speakerEnabled} onClick={() => setSpeakerEnabled((enabled) => !enabled)}>
                    <Speaker size={14} /> Speaker {speakerEnabled ? 'On' : 'Off'}
                  </button>
                </div>
                <button type="button" onClick={submitMessage} disabled={isThinking || !draft.trim()} className="btn-primary disabled:cursor-not-allowed disabled:opacity-50">
                  <SendHorizonal size={14} /> Send
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="dark-panel rounded-2xl border border-slate-800 p-4">
            <div className="mb-3 flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-slate-400">
              <Bot size={14} /> AI status
            </div>
            <div className="space-y-3 text-sm text-slate-200">
              <div className="flex items-center justify-between">
                <span>ElevenLabs agent</span>
                <span className={agentStatus === 'connected' ? 'text-emerald-300' : 'text-amber-300'}>{mode === 'live' ? agentStatus : 'Demo mode'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Voice input</span>
                <span>{mode === 'live' ? 'Robot microphone' : 'Demo mode'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Speech output</span>
                <span>{speakerEnabled ? 'Robot speaker enabled' : 'Muted'}</span>
              </div>
            </div>
          </div>

          <div className="dark-panel rounded-2xl border border-slate-800 p-4">
            <div className="mb-3 flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-slate-400">
              <Waves size={14} /> Conversation history
            </div>
            <div className="space-y-2 text-sm text-slate-300">
              {messages.slice(-3).map((entry, index) => (
                <div key={`${entry.speaker}-${index}`} className="rounded-lg border border-slate-800 bg-slate-900/60 p-2">
                  {entry.text}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
