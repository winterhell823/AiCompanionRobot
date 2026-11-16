import { Bot, Mic, SendHorizonal, Speaker, Trash2, Volume2, Waves } from 'lucide-react';
import { useState } from 'react';
import { conversation } from '../data/demoData';
import { useRobot } from '../context/RobotContext';

export default function CompanionPage() {
  const { mode } = useRobot();
  const [messages, setMessages] = useState(conversation);
  const [draft, setDraft] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isThinking, setIsThinking] = useState(false);

  const submitMessage = () => {
    if (!draft.trim()) return;

    const nextMessage = {
      speaker: 'user',
      text: draft.trim(),
      time: 'Now',
    };

    setMessages((current) => [...current, nextMessage]);
    setDraft('');
    setIsThinking(true);

    window.setTimeout(() => {
      setMessages((current) => [
        ...current,
        {
          speaker: 'robot',
          text: mode === 'demo' ? 'Demo placeholder response: I have received your input and will send it to the Qwen backend once live mode is connected.' : 'Live AI response is pending backend connection.',
          time: 'Now',
        },
      ]);
      setIsThinking(false);
    }, 800);
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
            </div>

            <div className="mt-4 space-y-3">
              <div className="flex gap-2">
                <textarea value={draft} onChange={(event) => setDraft(event.target.value)} rows="3" placeholder="Ask the robot to narrate the environment or respond to a query…" className="input-field flex-1 resize-none" />
              </div>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => setIsListening((current) => !current)} className={`rounded-lg border px-3 py-2 text-sm ${isListening ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200' : 'border-slate-700 bg-slate-900 text-slate-200'}`}>
                    <Mic size={14} />
                  </button>
                  <button type="button" className="btn-secondary">
                    <Speaker size={14} /> Speaker
                  </button>
                </div>
                <button type="button" onClick={submitMessage} className="btn-primary">
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
                <span>Qwen connection</span>
                <span className={mode === 'live' ? 'text-emerald-300' : 'text-amber-300'}>{mode === 'live' ? 'Connected' : 'Demo mode'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Voice input</span>
                <span>{isListening ? 'Listening' : 'Idle'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Speech output</span>
                <span>Ready</span>
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
