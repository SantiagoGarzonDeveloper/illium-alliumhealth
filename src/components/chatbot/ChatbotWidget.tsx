import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { MessageCircle, X, Send, Minus, Sparkles } from 'lucide-react';
// MessageCircle kept for title bar
import { Button } from '../ui/button';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAppStore } from '@/store';
import { groqChatCompletion } from '@/lib/groq';
import { MarkdownMessage } from './MarkdownMessage';
import { useI18n } from '@/i18n/I18nContext';
import { getLocalizedProduct } from '@/lib/productLocale';

const DEFAULT_SYSTEM_EN =
  'You are a professional AI assistant for ILLIUM, which supplies high-purity laboratory research compounds (research peptides such as BPC-157 and GHK-Cu, NAD+, and nootropic compounds) for in vitro research use only. Keep answers concise and scientific. Describe compounds only by their studied mechanism or molecular target pathway. Do NOT give medical, dosing, or human/animal-use advice; these products are not for human or animal consumption. If asked about personal use, remind the user they are for laboratory research only.';

export function ChatbotWidget() {
  const products = useAppStore((s) => s.products);
  const { t, locale } = useI18n();
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [systemPrompt, setSystemPrompt] = useState(DEFAULT_SYSTEM_EN);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const docSnap = await getDoc(doc(db, 'settings', 'general'));
        if (docSnap.exists() && docSnap.data().aiPrompt) {
          setSystemPrompt(docSnap.data().aiPrompt as string);
        } else {
          setSystemPrompt(DEFAULT_SYSTEM_EN);
        }
      } catch (e) {
        console.error(e);
      }
    };
    void fetchSettings();
  }, []);

  const resetWelcome = useCallback(() => {
    setMessages([{ role: 'assistant', content: t('adminPage.chatbot.welcome') }]);
  }, [t]);

  useEffect(() => {
    resetWelcome();
  }, [locale, resetWelcome]);

  const catalogBlock = useMemo(() => {
    const header = t('adminPage.chatbot.catalogHeader');
    const suffix =
      locale === 'es' ? t('adminPage.chatbot.systemSuffixEs') : t('adminPage.chatbot.systemSuffixEn');
    const lines = products.slice(0, 50).map((p) => {
      const { name } = getLocalizedProduct(p, locale);
      return t('adminPage.chatbot.catalogLine')
        .replace('{name}', name)
        .replace('{id}', p.id)
        .replace('{price}', String(p.price))
        .replace('{category}', p.category);
    });
    const body = lines.length ? `\n\n${header}\n${lines.join('\n')}` : '';
    return `${body}${suffix}`;
  }, [products, locale, t]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput('');
    const userMsg = { role: 'user' as const, content: userMessage };
    const historyForApi = [...messages, userMsg];
    setMessages(historyForApi);
    setIsLoading(true);

    const storefrontLang = locale === 'es' ? 'Spanish' : 'English';
    const strictReplyLang = `\n\nStorefront language is ${storefrontLang}. Write every assistant reply entirely in ${storefrontLang}. If earlier messages in this thread are in another language, ignore that for wording—still answer in ${storefrontLang}. Do not prepend translations of past messages; only produce the new reply.`;
    const fullSystem = `${systemPrompt}${catalogBlock}${strictReplyLang}`;

    try {
      const text = await groqChatCompletion([
        { role: 'system', content: fullSystem },
        ...historyForApi.map((m) => ({ role: m.role, content: m.content })),
      ]);
      setMessages((prev) => [...prev, { role: 'assistant', content: text }]);
    } catch (error) {
      console.error(error);
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: t('adminPage.chatbot.error'),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => {
          setIsOpen(true);
          setIsMinimized(false);
        }}
        className="group fixed bottom-6 right-6 z-50 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 via-brand-700 to-brand-900 text-white shadow-2xl shadow-brand-700/40 transition-all duration-300 hover:scale-110"
        aria-label="AI Assistant"
        style={{ boxShadow: '0 10px 40px -10px rgba(22,163,74,0.6), 0 0 0 4px white' }}
      >
        {/* Pulse ring */}
        <span className="absolute -inset-1 rounded-full animate-ping bg-brand-500/30 pointer-events-none" />
        {/* Icon - always visible, simple */}
        <Sparkles className="relative z-10 h-7 w-7 text-white drop-shadow-lg" fill="currentColor" strokeWidth={1.5} />
        {/* Online indicator */}
        <span className="absolute top-1 right-1 flex h-3.5 w-3.5 pointer-events-none">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
          <span className="relative inline-flex h-3.5 w-3.5 rounded-full bg-emerald-500 ring-2 ring-white"></span>
        </span>
      </button>
    );
  }

  return (
    <div
      className={`fixed right-6 z-50 flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl transition-all duration-300 ${
        isMinimized ? 'bottom-6 h-14 w-64' : 'bottom-6 h-[500px] max-h-[calc(100vh-48px)] w-80 sm:w-96'
      }`}
    >
      <div
        className="flex shrink-0 cursor-pointer items-center justify-between bg-slate-900 p-4 text-white"
        onClick={() => isMinimized && setIsMinimized(false)}
        onKeyDown={(e) => e.key === 'Enter' && isMinimized && setIsMinimized(false)}
        role="presentation"
      >
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
          <span className="font-semibold">{t('adminPage.chatbot.title')}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={(ev) => {
              ev.stopPropagation();
              setIsMinimized(!isMinimized);
            }}
            className="rounded p-1 hover:bg-white/20"
          >
            {isMinimized ? <MessageCircle className="h-4 w-4" /> : <Minus className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={(ev) => {
              ev.stopPropagation();
              setIsOpen(false);
            }}
            className="rounded p-1 hover:bg-white/20"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {!isMinimized && (
        <>
          <div className="flex-1 space-y-4 overflow-y-auto bg-slate-50 p-4">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-2 ${
                    msg.role === 'user'
                      ? 'rounded-br-sm bg-brand-700 text-white'
                      : 'rounded-bl-sm border border-slate-200 bg-white text-slate-800 shadow-sm'
                  }`}
                >
                  {msg.role === 'user' ? (
                    <p className="text-sm leading-relaxed">{msg.content}</p>
                  ) : (
                    <MarkdownMessage text={msg.content} className="text-slate-800" />
                  )}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex justify-start">
                <div className="flex gap-1 rounded-2xl rounded-bl-sm border border-slate-200 bg-white px-4 py-3 shadow-sm">
                  <div className="h-2 w-2 animate-bounce rounded-full bg-slate-400" />
                  <div className="h-2 w-2 animate-bounce rounded-full bg-slate-400 delay-100" />
                  <div className="h-2 w-2 animate-bounce rounded-full bg-slate-400 delay-200" />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <form onSubmit={handleSend} className="flex shrink-0 gap-2 border-t border-slate-200 bg-white p-3">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t('adminPage.chatbot.placeholder')}
              className="flex-1 rounded-full border-transparent bg-slate-100 px-4 py-2 text-sm outline-none transition-all focus:border-transparent focus:bg-white focus:ring-2 focus:ring-brand-600"
            />
            <Button
              type="submit"
              size="icon"
              variant="primary"
              className="shrink-0 rounded-full"
              disabled={!input.trim() || isLoading}
            >
              <Send className="ml-0.5 h-4 w-4" />
            </Button>
          </form>
        </>
      )}
    </div>
  );
}
