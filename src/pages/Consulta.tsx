import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Sparkles, Send, Loader2, Shield, ArrowLeft, Star, ChevronDown } from 'lucide-react';
import { useI18n } from '@/i18n/I18nContext';
import { useAppStore } from '@/store';
import { groqChatCompletion } from '@/lib/groq';
import { MarkdownMessage } from '@/components/chatbot/MarkdownMessage';
import { getLocalizedProduct } from '@/lib/productLocale';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';

type Msg = { role: 'user' | 'assistant'; content: string };

const QUICK_ES = [
  '¿Qué compuestos se estudian para la regeneración de tejidos?',
  '¿Qué compuestos se estudian en investigación metabólica?',
  '¿Diferencia entre CJC-1295 e Ipamorelin?',
  '¿Cuáles son los protocolos típicos de administración en investigación?',
  '¿Qué compuestos se estudian junto a las vías de NAD+?',
  '¿Qué señala la literatura publicada sobre interacciones entre compuestos?',
];
const QUICK_EN = [
  'Which compounds are studied for tissue regeneration?',
  'What compounds are studied in metabolic research?',
  'Difference between CJC-1295 and Ipamorelin?',
  'What are typical research administration protocols?',
  'What compounds are studied alongside NAD+ pathways?',
  'What does published literature note about compound interactions?',
];

export function Consulta() {
  const { locale } = useI18n();
  const es = locale === 'es';
  const products = useAppStore((s) => s.products);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [customPrompt, setCustomPrompt] = useState<string>('');
  const endRef = useRef<HTMLDivElement>(null);

  // Load custom consulting prompt from Firestore (editable in admin)
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'settings', 'general'), (s) => {
      if (s.exists()) {
        const p = s.data().consultaAiPrompt as string | undefined;
        if (p) setCustomPrompt(p);
      }
    });
    return () => unsub();
  }, []);

  // Welcome message
  useEffect(() => {
    setMessages([
      {
        role: 'assistant',
        content: es
          ? `👋 **Bienvenido al Asistente de Investigación de ILLIUM.**\n\nAyudo a investigadores a identificar compuestos por categoría de investigación, enfoque de estudios publicados y vía molecular objetivo.\n\nEsta herramienta es solo para orientación de investigación y no constituye asesoría médica.\n\nCuéntame: ¿qué vía o mecanismo estás estudiando?`
          : `👋 **Welcome to the ILLIUM Research Assistant.**\n\nI help researchers identify compounds by research category, published study focus, and molecular target pathway.\n\nThis tool is for research guidance only and does not constitute medical advice.\n\nTell me: what pathway or mechanism are you studying?`,
      },
    ]);
  }, [es]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const catalogBlock = useMemo(() => {
    return products
      .map((p) => {
        const lp = getLocalizedProduct(p, locale);
        const benefits = (lp.benefits || []).slice(0, 5).join('; ');
        return `- ${lp.name} [id:${p.id}, category:${p.category}, price:$${p.price}]: ${benefits}`;
      })
      .join('\n');
  }, [products, locale]);

  const systemPrompt = useMemo(() => {
    const base = `You are the ILLIUM Research Assistant — a knowledgeable guide that helps qualified researchers identify which research compounds in the ILLIUM catalog are relevant to a given research category, mechanism of action, or molecular target pathway.

STYLE:
- Professional, scientific, neutral. You are NOT a doctor, pharmacist, coach, or health advisor.
- Write in ${es ? 'Spanish (clear, professional)' : 'clear natural English'}.
- Be CONCISE (100-180 words). Use Markdown: **bold**, bullets, short headings.
- Ask clarifying questions about the user's RESEARCH FOCUS if unclear: study area, target pathway, mechanism of interest.

RESEARCH-CATEGORY MATCHING:
- Match compounds to research areas by their studied mechanism / molecular target pathway ONLY (e.g. metabolic & GLP-1 pathway research, tissue repair & regeneration research, neuropeptide & cognitive research, senescence & longevity research).
- Frame everything as "studied for / investigated in the context of [pathway]" — never as a benefit, treatment, or outcome for a person.
- Do NOT tailor suggestions to a person's sex, body, goals, symptoms, or "what they want to achieve". This is laboratory research guidance, not personal advice.

CATALOG (reference these exact names and ids when pointing to a compound):
${catalogBlock}

LINKS to use in responses (Markdown):
- [View compound](/product/{id}) — a specific compound's page
- [View catalog](/shop) — full catalog
- [Research finder](/quiz) — structured research-focus questionnaire

COMPLIANCE (STRICT — these products are FOR IN VITRO RESEARCH USE ONLY):
- DO NOT give medical advice, diagnosis, dosing, administration routes, or any human/animal-use guidance.
- DO NOT mention specific dosages (mg, mcg, ml, IU) or human protocols.
- DO NOT discuss weight loss, muscle gain, libido, anti-aging, or any human outcome. Reframe to the underlying research pathway instead.
- If the user implies personal/human use, symptoms, or "is this safe for me", REMIND them these compounds are for in vitro laboratory research only and are not for human or animal consumption, and decline personal-use guidance.

FORMAT: End every response with a short next-action ("¿Quieres que compare dos compuestos por su vía objetivo?" / "Want me to compare two compounds by target pathway?").`;

    if (customPrompt.trim()) {
      return `${base}\n\nADDITIONAL CUSTOM INSTRUCTIONS (from admin):\n${customPrompt}`;
    }
    return base;
  }, [catalogBlock, es, customPrompt]);

  const send = async (text: string) => {
    const t = text.trim();
    if (!t || loading) return;
    const userMsg: Msg = { role: 'user', content: t };
    const history = [...messages, userMsg];
    setMessages(history);
    setInput('');
    setLoading(true);
    try {
      const reply = await groqChatCompletion([
        { role: 'system', content: systemPrompt },
        ...history.map((m) => ({ role: m.role, content: m.content })),
      ]);
      setMessages((prev) => [...prev, { role: 'assistant', content: reply }]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: es
            ? 'Ups, no pude responder. ¿Intentas de nuevo?'
            : "Oops, couldn't respond. Try again?",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-emerald-950/30 to-slate-950 text-white">
      {/* Hero */}
      <section className="relative pt-20 pb-10 md:pt-28 md:pb-14 border-b border-slate-800/50">
        <div className="container mx-auto max-w-4xl px-4 text-center">
          <Link to="/" className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white mb-8">
            <ArrowLeft className="h-3.5 w-3.5" />
            {es ? 'Volver al inicio' : 'Back to home'}
          </Link>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
          >
            <div className="inline-flex items-center gap-2 rounded-full bg-brand-500/15 border border-brand-400/30 px-4 py-1.5 text-[10px] font-bold uppercase tracking-[0.25em] text-brand-300 mb-6">
              <Sparkles className="h-3 w-3" />
              {es ? 'Asistente de investigación' : 'Research assistant'}
            </div>
            <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-4">
              {es ? (
                <>
                  Buscador de <span className="bg-gradient-to-r from-brand-300 to-emerald-300 bg-clip-text text-transparent">compuestos de investigación</span>
                </>
              ) : (
                <>
                  Research <span className="bg-gradient-to-r from-brand-300 to-emerald-300 bg-clip-text text-transparent">Compound Finder</span>
                </>
              )}
            </h1>
            <p className="text-base md:text-lg text-slate-300 max-w-2xl mx-auto">
              {es
                ? 'Chatea con nuestro asistente de investigación. Encuentra compuestos por área de estudio, mecanismo de acción y vía molecular objetivo.'
                : 'Chat with our research assistant. Find compounds by study area, mechanism of action, and target molecular pathway.'}
            </p>
          </motion.div>
        </div>
      </section>

      {/* Chat */}
      <section className="py-8 md:py-12">
        <div className="container mx-auto max-w-3xl px-4">
          <div className="rounded-3xl bg-gradient-to-b from-slate-900 to-slate-950 border border-slate-800 overflow-hidden shadow-2xl shadow-brand-900/20">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-gradient-to-r from-brand-900/30 to-slate-900">
              <div className="flex items-center gap-3">
                <div className="relative h-10 w-10 rounded-xl bg-gradient-to-br from-brand-500 to-brand-800 flex items-center justify-center">
                  <Sparkles className="h-5 w-5 text-white" fill="currentColor" strokeWidth={1.5} />
                  <span className="absolute -top-1 -right-1 flex h-3 w-3">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-500"></span>
                  </span>
                </div>
                <div>
                  <p className="font-bold tracking-tight">ILLIUM Research Assistant</p>
                  <p className="text-[10px] text-brand-400 font-bold tracking-[0.2em] uppercase">
                    {es ? 'En línea · IA de investigación' : 'Online · Research AI'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 rounded-full bg-brand-500/10 border border-brand-500/30 px-2.5 py-1 text-[10px] font-bold text-brand-300">
                <Star className="h-3 w-3 fill-brand-400 text-brand-400" />
                4.9
              </div>
            </div>

            {/* Messages */}
            <div className="h-[55vh] md:h-[60vh] overflow-y-auto px-5 py-6 space-y-4 bg-slate-950">
              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                      m.role === 'user'
                        ? 'bg-brand-600 text-white rounded-br-sm'
                        : 'bg-slate-800 text-slate-100 rounded-bl-sm ring-1 ring-slate-700'
                    }`}
                  >
                    {m.role === 'user' ? (
                      <p>{m.content}</p>
                    ) : (
                      <div className="prose prose-sm prose-invert max-w-none [&_a]:text-brand-400 [&_a]:font-medium [&_strong]:text-white [&_p]:mb-2 [&_ul]:space-y-1 [&_li]:text-slate-300">
                        <MarkdownMessage text={m.content} />
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex justify-start">
                  <div className="bg-slate-800 rounded-2xl rounded-bl-sm px-4 py-3 flex gap-1">
                    <span className="h-1.5 w-1.5 bg-slate-400 rounded-full animate-bounce"></span>
                    <span className="h-1.5 w-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0.15s' }}></span>
                    <span className="h-1.5 w-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0.3s' }}></span>
                  </div>
                </div>
              )}
              <div ref={endRef} />
            </div>

            {/* Quick prompts */}
            {messages.length <= 1 && (
              <div className="px-5 pb-3 pt-3 border-t border-slate-800">
                <p className="text-[10px] uppercase tracking-widest text-slate-500 font-semibold mb-2 flex items-center gap-1.5">
                  <ChevronDown className="h-3 w-3" />
                  {es ? 'Preguntas frecuentes' : 'Frequent questions'}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {(es ? QUICK_ES : QUICK_EN).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => send(p)}
                      className="text-[11px] rounded-full bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 hover:text-white px-3 py-1.5 transition-colors"
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Input */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                send(input);
              }}
              className="border-t border-slate-800 p-3 flex gap-2 bg-slate-900"
            >
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={es ? 'Escribe tu pregunta...' : 'Type your question...'}
                className="flex-1 rounded-full bg-slate-800 border border-slate-700 px-4 py-2.5 text-sm text-white placeholder:text-slate-500 outline-none focus:border-brand-500"
              />
              <button
                type="submit"
                disabled={!input.trim() || loading}
                className="h-10 w-10 rounded-full bg-gradient-to-br from-brand-500 to-brand-700 hover:from-brand-400 hover:to-brand-600 disabled:opacity-40 flex items-center justify-center shrink-0"
              >
                {loading ? <Loader2 className="h-4 w-4 text-white animate-spin" /> : <Send className="h-4 w-4 text-white" />}
              </button>
            </form>
          </div>

          {/* Compliance */}
          <div className="mt-6 rounded-2xl bg-amber-500/5 border border-amber-400/20 p-4 flex gap-3 text-xs text-amber-100">
            <Shield className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              {es
                ? 'Esta asesoría es informativa, basada en información pública de ILLIUM. NO sustituye a un profesional de salud calificado. Los productos ILLIUM son para fines de investigación.'
                : 'This advisory is informational, based on public ILLIUM information. It does NOT replace a qualified health professional. ILLIUM products are for research purposes.'}
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
