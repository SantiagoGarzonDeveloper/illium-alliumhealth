import { useMemo, useRef, useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowRight, ArrowLeft, Loader2, Sparkles, Check, ShoppingCart } from 'lucide-react';
import { db } from '@/lib/firebase';
import { collection, addDoc, serverTimestamp, doc, updateDoc } from 'firebase/firestore';
import { useAppStore, useToastStore, type Product } from '@/store';
import { groqChatCompletion } from '@/lib/groq';
import { validateEmailRemote, emailErrorMessage, validatePhone, phoneErrorMessage } from '@/lib/validation';
import { EmailOTP } from '@/components/ui/email-otp';
import { useI18n } from '@/i18n/I18nContext';
import { getQuizSteps } from '@/i18n/quizContent';
import type { Locale } from '@/i18n/translations';
import { getLocalizedProduct } from '@/lib/productLocale';
import { getEffectivePrice } from '@/lib/pricing';

function extractJsonObject(text: string): string | null {
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  return t.slice(start, end + 1);
}

function guessProductIds(products: Product[], text: string, seed: string[], locale: Locale): string[] {
  const lower = text.toLowerCase();
  const set = new Set(seed);
  for (const p of products) {
    const lp = getLocalizedProduct(p, locale);
    const variants = [lp.name, p.name];
    let hit = false;
    for (const nm of variants) {
      const name = nm.toLowerCase();
      const tokens = name.split(/[\s\-+]+/).filter((w) => w.length > 2);
      if (lower.includes(name) || tokens.some((tok) => lower.includes(tok))) {
        hit = true;
        break;
      }
    }
    if (hit) set.add(p.id);
  }
  return [...set].slice(0, 6);
}

type QuizResult = {
  stackName: string;
  tagline: string;
  benefits: string[];
  productIds: string[];
};

/**
 * Strip forbidden medical/dosage language that the AI might slip in.
 * We remove whole sentences that contain any blocked term, then if the
 * string is empty we fall back to a safe marketing line.
 */
const FORBIDDEN_PATTERNS: RegExp[] = [
  /\b\d+\s*(mg|mcg|ml|iu|ui|gr|grams?|units?|unidades?)\b/gi,
  /\b(dosis|dosage|dosing|dose)\b/gi,
  /\b(inyecci[oó]n(?:es)?|injection|inject)\b/gi,
  /\b(protocolo|protocol)\b/gi,
  /\b(tratamiento|treatment)\b/gi,
  /\b(administraci[oó]n|administer|administration)\b/gi,
  /\b(ciclo|cycle)\b/gi,
  /\b(diario|daily|semanal|weekly|mensual|monthly)\b/gi,
  /\b(prescribe|prescribed|prescripci[oó]n|prescription)\b/gi,
];

function sanitizeMarketingText(text: string): string {
  if (!text) return text;
  // Split by sentences
  const sentences = text.split(/(?<=[.!?])\s+/);
  const kept = sentences.filter((s) => !FORBIDDEN_PATTERNS.some((re) => re.test(s)));
  // Also scrub residual patterns inside remaining sentences
  return kept
    .map((s) => FORBIDDEN_PATTERNS.reduce((acc, re) => acc.replace(re, ''), s))
    .join(' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function sanitizeBenefits(benefits: string[], locale: Locale): string[] {
  const safe = benefits
    .map((b) => sanitizeMarketingText(b))
    .filter((b) => b && b.length >= 3);
  if (safe.length >= 2) return safe.slice(0, 3);
  return locale === 'es'
    ? ['Balance general', 'Bienestar diario', 'Apoyo integral']
    : ['Overall balance', 'Daily wellness', 'Integrated support'];
}

function parseQuizAiResponse(
  raw: string,
  products: Product[],
  locale: Locale
): QuizResult {
  const jsonStr = extractJsonObject(raw);
  if (jsonStr) {
    try {
      const o = JSON.parse(jsonStr) as Partial<QuizResult> & { markdown?: string };
      const ids = Array.isArray(o.productIds)
        ? o.productIds.filter((x): x is string => typeof x === 'string')
        : [];
      const valid = ids.filter((id) => products.some((p) => p.id === id));
      const merged = valid.length > 0 ? valid : guessProductIds(products, o.markdown || raw, [], locale);
      const benefits = Array.isArray(o.benefits)
        ? o.benefits.filter((b): b is string => typeof b === 'string').slice(0, 3)
        : [];
      const rawStack = (o.stackName || (locale === 'es' ? 'Tu selección' : 'Your Selection')).toString();
      const rawTagline = (o.tagline || (locale === 'es'
        ? 'Productos seleccionados según tus respuestas.'
        : 'Products selected based on your answers.')).toString();
      const cleanStack = sanitizeMarketingText(rawStack) || (locale === 'es' ? 'Tu selección' : 'Your Selection');
      const cleanTagline = sanitizeMarketingText(rawTagline) || (locale === 'es'
        ? 'Productos seleccionados según tus respuestas.'
        : 'Products selected based on your answers.');
      return {
        stackName: cleanStack,
        tagline: cleanTagline,
        benefits: sanitizeBenefits(benefits, locale),
        productIds: merged,
      };
    } catch {
      /* fall through */
    }
  }
  return {
    stackName: locale === 'es' ? 'Tu selección' : 'Your Selection',
    tagline: locale === 'es'
      ? 'Productos seleccionados según tus respuestas.'
      : 'Products selected based on your answers.',
    benefits: locale === 'es'
      ? ['Balance general', 'Bienestar diario', 'Apoyo integral']
      : ['Overall balance', 'Daily wellness', 'Integrated support'],
    productIds: guessProductIds(products, raw, [], locale),
  };
}

export function Quiz() {
  const { t, locale } = useI18n();
  const steps = useMemo(() => getQuizSteps(locale), [locale]);
  const products = useAppStore((s) => s.products);
  const addToCart = useAppStore((s) => s.addToCart);
  const showToast = useToastStore((s) => s.showToast);

  const QUIZ_STATE_KEY = 'illium_quiz_state_v1';
  type StoredQuizState = {
    currentStep: number;
    answers: Record<string, string>;
    multiAnswers: Record<string, string[]>;
    result: QuizResult | null;
  };
  const restored = (() => {
    if (typeof window === 'undefined') return null;
    try {
      const raw = window.sessionStorage.getItem(QUIZ_STATE_KEY);
      if (!raw) return null;
      return JSON.parse(raw) as StoredQuizState;
    } catch {
      return null;
    }
  })();

  const [currentStep, setCurrentStep] = useState(restored?.currentStep ?? 0);
  const [answers, setAnswers] = useState<Record<string, string>>(restored?.answers ?? {});
  const [multiAnswers, setMultiAnswers] = useState<Record<string, string[]>>(restored?.multiAnswers ?? {});
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<QuizResult | null>(restored?.result ?? null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.sessionStorage.setItem(
        QUIZ_STATE_KEY,
        JSON.stringify({ currentStep, answers, multiAnswers, result })
      );
    } catch { /* ignore quota */ }
  }, [currentStep, answers, multiAnswers, result]);

  const [userInfo, setUserInfo] = useState({ name: '', email: '', phone: '' });
  const [userInfoErrors, setUserInfoErrors] = useState<{ email?: string; phone?: string }>({});
  const [emailVerified, setEmailVerified] = useState(false);
  const recommendedRef = useRef<HTMLDivElement>(null);

  // Pre-select options marked as preselected
  useEffect(() => {
    const newAnswers = { ...answers };
    for (const step of steps) {
      if (step.optionMeta && !step.multiSelect && !newAnswers[step.id]) {
        for (const opt of step.options) {
          if (step.optionMeta[opt]?.preselected) {
            newAnswers[step.id] = opt;
          }
        }
      }
    }
    setAnswers(newAnswers);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale]);

  useEffect(() => {
    setCurrentStep(0);
    setResult(null);
  }, [locale]);

  const recommendedProducts = useMemo(() => {
    if (!result) return [];
    return result.productIds
      .map((id) => products.find((p) => p.id === id))
      .filter((p): p is Product => Boolean(p));
  }, [result, products]);

  // Determine months multiplier from duration answer
  const durationMonths = useMemo(() => {
    const d = (answers.duration || '').toLowerCase();
    if (d.includes('6')) return 6;
    if (d.includes('3')) return 3;
    return 1;
  }, [answers.duration]);

  // Compute how many vials of a given product cover the user's selected duration.
  const vialsFor = (p: Product): number => {
    const perVial = Number(p.monthsSupplyPerVial) || 1;
    return Math.max(1, Math.ceil(durationMonths / perVial));
  };

  // Auto-add recommended products × duration months to the cart
  useEffect(() => {
    if (!result || recommendedProducts.length === 0) return;
    const { cart } = useAppStore.getState();
    const idsInCart = new Set(cart.map((ci) => ci.product.id));
    const toAdd = recommendedProducts.filter((p) => !idsInCart.has(p.id));
    if (toAdd.length === 0) return;
    toAdd.forEach((p) => addToCart(p, vialsFor(p)));
    const totalUnits = toAdd.reduce((s, p) => s + vialsFor(p), 0);
    showToast(
      locale === 'es'
        ? `✓ ${toAdd.length} producto${toAdd.length > 1 ? 's' : ''} × ${durationMonths} ${durationMonths === 1 ? 'mes' : 'meses'} añadido${totalUnits > 1 ? 's' : ''} a tu carrito`
        : `✓ ${toAdd.length} product${toAdd.length > 1 ? 's' : ''} × ${durationMonths} month${durationMonths > 1 ? 's' : ''} added to your cart`
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);

  const handleSelect = (option: string) => {
    const step = steps[currentStep];
    if (step.multiSelect) {
      const current = multiAnswers[step.id] || [];
      const updated = current.includes(option)
        ? current.filter((o) => o !== option)
        : [...current, option];
      setMultiAnswers({ ...multiAnswers, [step.id]: updated });
      setAnswers({ ...answers, [step.id]: updated.join(', ') });
    } else {
      setAnswers({ ...answers, [step.id]: option });
    }
  };

  const isOptionSelected = (option: string): boolean => {
    const step = steps[currentStep];
    if (step.multiSelect) {
      return (multiAnswers[step.id] || []).includes(option);
    }
    return answers[step.id] === option;
  };

  const canProceed = (): boolean => {
    const step = steps[currentStep];
    if (step.multiSelect) {
      return (multiAnswers[step.id] || []).length > 0;
    }
    return Boolean(answers[step.id]);
  };

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else if (currentStep === steps.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  // recommendedRef kept for future use (anchor scroll)
  void recommendedRef;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setLoading(true);
    // Require OTP verification — the gold standard
    if (!emailVerified) {
      const msg = locale === 'es' ? 'Verifica tu correo con el código antes de continuar' : 'Verify your email with the code before continuing';
      setUserInfoErrors({ email: msg });
      showToast(msg);
      setLoading(false);
      return;
    }
    // Still do format + MX check as second line of defense
    const emailCheck = await validateEmailRemote(userInfo.email);
    const errs: { email?: string; phone?: string } = {};
    if (!emailCheck.valid) {
      errs.email = emailErrorMessage(emailCheck, locale);
      showToast(errs.email);
    }
    // Validate phone (country code comes bundled into userInfo.phone as "+X Y")
    // Try to split "+XX digits" or use raw digits with fallback to +1
    let phoneOk = false;
    const raw = userInfo.phone.trim();
    if (/^\+/.test(raw)) {
      const m = raw.match(/^(\+\d{1,4})\s*(.+)$/);
      if (m) {
        const pc = validatePhone(m[1], m[2]);
        phoneOk = pc.valid;
        if (!pc.valid) errs.phone = phoneErrorMessage(pc.reason, locale);
      }
    } else {
      // Treat whole thing as digits; need at least 8 digits to pass
      const digits = raw.replace(/\D/g, '');
      if (digits.length < 8) {
        errs.phone = locale === 'es' ? 'Número demasiado corto. Incluye código de país (+X).' : 'Number too short. Include country code (+X).';
      } else {
        phoneOk = true;
      }
    }
    if (!phoneOk && !errs.phone) {
      errs.phone = locale === 'es' ? 'Número de teléfono no válido' : 'Invalid phone number';
    }
    if (Object.keys(errs).length > 0) {
      setUserInfoErrors(errs);
      setLoading(false);
      if (errs.phone) showToast(errs.phone);
      return;
    }
    setUserInfoErrors({});

    let leadRefId: string | null = null;
    try {
      try {
        const referrerId = localStorage.getItem('referrerId');
        const leadData = {
          ...userInfo,
          quizAnswers: answers,
          productOfInterest: answers.goal || null,
          referrerId: referrerId || null,
          locale,
          leadStatus: 'new',
          createdAt: serverTimestamp(),
        };
        const ref = await addDoc(collection(db, 'leads'), leadData);
        leadRefId = ref.id;
      } catch (dbError) {
        console.error('Could not save lead to database (Permissions issue?):', dbError);
      }

      // Filter catalog by user's biological sex so the AI can never
      // recommend a male-only product to a woman or vice versa.
      const sexAnswer = (answers.sex || '').toLowerCase();
      const userIsFemale = /muje|female|fem/.test(sexAnswer);
      const userIsMale = /homb|male|masc/.test(sexAnswer);
      const filteredProducts = products.filter((p) => {
        const tg = p.targetGender || 'both';
        if (tg === 'both') return true;
        if (tg === 'male') return userIsMale || (!userIsFemale && !userIsMale);
        if (tg === 'female') return userIsFemale || (!userIsFemale && !userIsMale);
        return true;
      });

      const catalogJson = JSON.stringify(
        filteredProducts.map((p) => {
          const lp = getLocalizedProduct(p, locale);
          return {
            id: p.id,
            name: lp.name,
            category: p.category,
            price: p.price,
            stock: p.stock,
            targetGender: p.targetGender || 'both',
            monthsSupplyPerVial: p.monthsSupplyPerVial ?? 1,
            dosageNote: p.dosageNote || '',
            description: (lp.description || '').slice(0, 320),
          };
        })
      );

      const langRule =
        locale === 'es'
          ? '\n\nIMPORTANT: Write in Spanish only. Product names from the catalog may stay as printed.'
          : '\n\nWrite in clear English only.';

      const system = `You are a premium product curator for ILLIUM, a research-grade wellness brand.

You MUST respond with ONLY one valid JSON object (no markdown fences, no text before or after). Shape:
{"stackName":"short 2-4 word selection name","tagline":"one short marketing sentence","benefits":["benefit 1","benefit 2","benefit 3"],"productIds":["id1","id2"]}

STRICT COMPLIANCE RULES — never break these:
- DO NOT mention dosages (mg, mcg, mL, IU), frequency (daily, weekly), time-of-day, injections, cycles, or any medical/clinical instructions.
- DO NOT say "protocolo", "protocol", "tratamiento", "treatment", "dosis", "inyección", "administración" or any medical language.
- DO write like a premium e-commerce stack curation: lifestyle, benefits-focused, aspirational.
- "stackName": 2-4 words, e.g. "Selección Metabólica" / "Performance Stack" / "Vitality Blend". ${locale === 'es' ? 'In Spanish.' : 'In English.'}
- "tagline": ONE short sentence about overall theme — general objective, no instructions.
- "benefits": exactly 3 short bullet phrases (2-4 words each) — e.g. "Enfoque mental", "Energía diaria", "Balance general".
- "productIds": 1-4 strings, each copied exactly from the catalog "id" field. Prefer bundles (3-4 products) when user chose "Complete Option".
- If catalog is empty, return {"stackName":"","tagline":"","benefits":[],"productIds":[]}.
- Language: ${locale === 'es' ? 'Spanish' : 'English'} only.${langRule}`;

      let userContent = `Catalog (JSON array — use only these ids in productIds):
${catalogJson}

Quiz answers:
- Biological sex: ${answers.sex || 'not specified'}
- Goal: ${answers.goal}
- Experience: ${answers.experience}
- Duration: ${answers.duration}
- Preference: ${answers.preference}

IMPORTANT — match compounds to the stated research focus (NOT to personal/human outcomes):
- Recommend compounds purely by their studied mechanism or molecular target pathway (e.g. metabolic & GLP-1 pathway research, tissue repair & regeneration research, neuropeptide & cognitive research, senescence & longevity research). Use each catalog product's "category" and "targetGender" to decide fit — the catalog has already been pre-filtered.
- Do NOT frame anything as a human benefit, treatment, or outcome (no weight loss, muscle gain, libido, anti-aging). Refer to compounds only by catalog name and target pathway. This is laboratory research guidance only.

IMPORTANT — duration-aware messaging (MUST include in tagline):
- If duration is "1 Month" / "1 Mes": recommend a starter selection with fewer products (1-2). Tagline MUST mention it's an initial one-time shipment to get started.
- If duration is "3 Months" / "3 Meses": recommend a complete selection (2-4 products). Tagline MUST say something like "You will receive a monthly shipment for 3 months" or "Recibirás un envío mensual durante 3 meses".
- If duration is "6+ Months" / "6+ Meses": recommend the most comprehensive selection (3-4 products). Tagline MUST mention "Monthly shipments for 6 months" / "Envíos mensuales durante 6 meses" + mention this is the best value option.
- The number of recommended products should increase with duration: 1-2 for 1mo, 2-3 for 3mo, 3-4 for 6+mo.

UI locale: ${locale}

DURATION QUANTITY RULE:
- The user selected "${answers.duration}" as their plan duration.
- For "1 Month" / "1 Mes": recommend normal quantities (1 unit each).
- For "3 Months" / "3 Meses": the cart will automatically add the right number of vials per product to cover 3 months (using each product's monthsSupplyPerVial). Mention in tagline that this is a 3-month supply with monthly shipments.
- For "6+ Months" / "6+ Meses": the cart will add the right number of vials per product to cover 6 months. Mention this is best value.
- Do NOT mention specific unit quantities in your response — the system handles that automatically using each product's "monthsSupplyPerVial" and "dosageNote" from the catalog.

CATALOG METADATA RULES:
- Trust each product's "targetGender", "monthsSupplyPerVial", and "dosageNote" fields verbatim. Do not invent your own protocol or override admin-set values.
- The catalog has already been pre-filtered by the user's biological sex — every product you see is appropriate for them.`;

      // Load extra prompt from admin settings if available
      try {
        const { getDoc: gd, doc: d } = await import('firebase/firestore');
        const { db: fdb } = await import('@/lib/firebase');
        const sSnap = await gd(d(fdb, 'settings', 'general'));
        if (sSnap.exists() && sSnap.data().quizAiExtraPrompt) {
          userContent += '\n\nADMIN EXTRA INSTRUCTIONS:\n' + String(sSnap.data().quizAiExtraPrompt);
        }
      } catch { /* ignore */ }

      void 0; // end of userContent block

      const raw = await groqChatCompletion([
        { role: 'system', content: system },
        { role: 'user', content: userContent },
      ]);

      const parsed = parseQuizAiResponse(raw, products, locale);
      setResult(parsed);
      setCurrentStep(currentStep + 1);
      if (leadRefId) {
        try {
          const recProducts = parsed.productIds
            .map((id) => products.find((p) => p.id === id))
            .filter((p): p is Product => Boolean(p));
          await updateDoc(doc(db, 'leads', leadRefId), {
            productOfInterestIds: recProducts.map((p) => p.id),
            productOfInterestNames: recProducts.map((p) => getLocalizedProduct(p, locale).name),
            recommendedStackName: parsed.stackName || null,
          });
        } catch (e) {
          console.error('Could not update lead with recommended products:', e);
        }
      }
    } catch (error) {
      console.error('Error generating recommendation:', error);
      const fallbackIds = products.slice(0, 3).map((p) => p.id);
      setResult({
        stackName: locale === 'es' ? 'Tu selección' : 'Your Selection',
        tagline: locale === 'es'
          ? 'Productos seleccionados según tus respuestas. Añade los que quieras a tu carrito.'
          : 'Products selected based on your answers. Add the ones you like to your cart.',
        benefits: locale === 'es'
          ? ['Balance general', 'Bienestar diario', 'Apoyo integral']
          : ['Overall balance', 'Daily wellness', 'Integrated support'],
        productIds: fallbackIds,
      });
      setCurrentStep(currentStep + 1);
    } finally {
      setLoading(false);
    }
  };

  const continueLabel = locale === 'es' ? 'Continuar' : 'Continue';

  // ── Results view ──
  if (currentStep >= steps.length + 1 && result) {
    const bundleTotal = recommendedProducts.reduce(
      (sum, p) => sum + getEffectivePrice(p).finalPrice * vialsFor(p),
      0
    );
    const bundleOriginal = recommendedProducts.reduce(
      (sum, p) => sum + getEffectivePrice(p).originalPrice * vialsFor(p),
      0
    );
    const bundleHasDiscount = bundleOriginal > bundleTotal;

    // Product benefits - use product benefits if available, otherwise derive from category
    const getProductBenefits = (p: Product): string[] => {
      const lp = getLocalizedProduct(p, locale);
      const benefits = (lp.benefits || []).slice(0, 3);
      if (benefits.length >= 2) {
        // Use short ones (first few words only)
        return benefits.map((b) => {
          const words = b.split(/\s+/).slice(0, 3).join(' ');
          return words;
        }).slice(0, 3);
      }
      // Fallback by category
      const catMap: Record<string, string[]> = locale === 'es'
        ? {
            metabolic: ['Energía diaria', 'Composición corporal', 'Balance metabólico'],
            recovery: ['Recuperación', 'Bienestar físico', 'Apoyo articular'],
            nootropics: ['Enfoque mental', 'Claridad', 'Energía diaria'],
            nad: ['Vitalidad', 'Energía celular', 'Bienestar general'],
            blends: ['Apoyo integral', 'Balance general', 'Bienestar premium'],
            peptides: ['Apoyo integral', 'Balance general', 'Bienestar diario'],
          }
          : {
            metabolic: ['Daily energy', 'Body composition', 'Metabolic balance'],
            recovery: ['Recovery', 'Physical wellness', 'Joint support'],
            nootropics: ['Mental focus', 'Clarity', 'Daily energy'],
            nad: ['Vitality', 'Cellular energy', 'Overall wellness'],
            blends: ['Integrated support', 'Overall balance', 'Premium wellness'],
            peptides: ['Integrated support', 'Overall balance', 'Daily wellness'],
          };
      return catMap[p.category] || (locale === 'es'
        ? ['Balance general', 'Bienestar diario', 'Apoyo integral']
        : ['Overall balance', 'Daily wellness', 'Integrated support']);
    };

    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
        <div className="container mx-auto max-w-5xl px-4 py-12 md:py-16 animate-fade-in">

          {/* HERO: Stack name + tagline + main CTA */}
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-950 via-slate-900 to-slate-950 p-1 mb-8">
            <div className="absolute inset-0 bg-gradient-to-br from-brand-500/20 via-transparent to-brand-600/10" />
            <div className="relative rounded-[22px] bg-slate-950/80 backdrop-blur-xl p-8 md:p-12">
              <div className="absolute right-0 top-0 p-8 opacity-[0.06]">
                <Sparkles className="h-56 w-56" />
              </div>
              <div className="relative z-10">
                <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-brand-500/15 px-4 py-1.5 text-xs font-semibold tracking-wider uppercase text-brand-300 ring-1 ring-brand-500/20">
                  <Sparkles className="h-3.5 w-3.5" />
                  {locale === 'es' ? 'Recomendado para ti' : 'Recommended for you'}
                </div>
                <p className="text-xs font-bold uppercase tracking-[0.3em] text-brand-400 mb-2">ILLIUM</p>
                <h1 className="mb-4 text-4xl md:text-5xl font-bold text-white tracking-tight">
                  {result.stackName}
                </h1>
                <p className="mb-8 text-lg text-slate-300 max-w-2xl leading-relaxed">
                  {result.tagline}
                </p>

                {/* Benefits bullets */}
                <ul className="mb-10 grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-2xl">
                  {result.benefits.map((benefit, i) => (
                    <li key={i} className="flex items-center gap-2 rounded-xl bg-white/5 border border-white/10 px-4 py-3 backdrop-blur-sm">
                      <Check className="h-4 w-4 text-brand-400 shrink-0" />
                      <span className="text-sm font-medium text-white">{benefit}</span>
                    </li>
                  ))}
                </ul>

                {/* Main CTA: Buy full selection + urgency + strike price */}
                {recommendedProducts.length > 0 && (
                  <div className="space-y-3">
                    {/* Urgency line */}
                    <div className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 border border-amber-400/30 px-3 py-1 text-[11px] font-semibold text-amber-300">
                      ⚡ {locale === 'es' ? 'Recomendado para empezar hoy' : 'Recommended to start today'}
                    </div>

                    {/* Price row: real strike + discounted (only when there's an actual discount) */}
                    {bundleTotal > 0 && (
                      <div className="flex items-baseline gap-3 flex-wrap">
                        {bundleHasDiscount && (
                          <span className="text-lg line-through text-slate-500">${bundleOriginal.toFixed(0)}</span>
                        )}
                        <span className="text-4xl font-black text-white">${bundleTotal.toFixed(0)}</span>
                        {bundleHasDiscount && (
                          <span className="rounded-full bg-emerald-500/20 border border-emerald-500/30 px-2.5 py-1 text-[11px] font-bold text-emerald-300">
                            {locale === 'es' ? 'AHORRAS' : 'SAVE'} ${(bundleOriginal - bundleTotal).toFixed(0)}
                          </span>
                        )}
                      </div>
                    )}

                    <Link to="/cart" className="block w-full sm:w-auto">
                      <Button
                        size="lg"
                        type="button"
                        className="btn-premium bg-gradient-to-r from-brand-500 to-brand-400 text-white hover:from-brand-400 hover:to-brand-300 rounded-full px-8 h-14 text-base font-bold shadow-2xl shadow-brand-500/40 w-full sm:w-auto"
                      >
                        <ShoppingCart className="mr-2 h-5 w-5" />
                        {locale === 'es' ? 'Ir al carrito' : 'Go to cart'}
                        <ArrowRight className="ml-2 h-5 w-5" />
                      </Button>
                    </Link>
                    <p className="text-xs text-slate-400 italic">
                      {durationMonths > 1
                        ? (locale === 'es'
                          ? `✓ ${durationMonths} meses de suministro añadidos. Recibirás un envío mensual.`
                          : `✓ ${durationMonths}-month supply added. You'll receive monthly shipments.`)
                        : (locale === 'es'
                          ? '✓ Productos añadidos automáticamente. Puedes quitar cualquiera abajo.'
                          : '✓ Products added automatically. You can remove any below.')}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Products grid */}
          <div ref={recommendedRef} className="scroll-mt-24 animate-slide-up">
            <div className="flex items-end justify-between mb-6">
              <div>
                <h2 className="text-2xl md:text-3xl font-bold text-white tracking-tight">
                  {locale === 'es' ? 'Tu selección recomendada' : 'Your recommended selection'}
                </h2>
                <p className="mt-2 text-sm text-slate-400 max-w-xl">
                  {locale === 'es'
                    ? 'Productos seleccionados según tus respuestas. Añade los que quieras a tu carrito.'
                    : 'Products selected based on your answers. Add any you like to your cart.'}
                </p>
              </div>
            </div>

            {recommendedProducts.length === 0 ? (
              <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-8 text-center">
                <p className="text-sm text-slate-400">
                  {t('quiz.noMatch')}{' '}
                  <Link to="/shop" className="font-medium text-brand-400 hover:text-brand-300 underline">
                    {t('quiz.browseAll')}
                  </Link>
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {recommendedProducts.map((p, idx) => {
                  const lp = getLocalizedProduct(p, locale);
                  const benefits = getProductBenefits(p);
                  const isTopPick = idx === 0;
                  return (
                    <div
                      key={p.id}
                      className={`group relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-slate-800 to-black border ${isTopPick ? 'border-brand-500 ring-2 ring-brand-500/40 shadow-2xl shadow-brand-500/30' : 'border-slate-800 hover:border-brand-700/50'} transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl hover:shadow-brand-600/20 flex flex-col`}
                    >
                      {isTopPick && (
                        <div className="absolute top-3 left-3 z-10">
                          <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-brand-500 to-emerald-400 text-white text-[10px] font-black uppercase tracking-wider px-2.5 py-1 shadow-lg">
                            ⭐ {locale === 'es' ? 'Más recomendado' : 'Top pick'}
                          </span>
                        </div>
                      )}
                      {/* Product image */}
                      <Link to={`/product/${p.id}`} className="block relative aspect-[4/5] overflow-hidden bg-black">
                        <img
                          src={p.img}
                          alt={lp.name}
                          className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                      </Link>

                      {/* Info */}
                      <div className="p-5 flex-1 flex flex-col">
                        <p className="text-[10px] uppercase tracking-[0.2em] text-brand-400 font-bold mb-1.5">
                          ILLIUM
                        </p>
                        <h3 className="text-lg font-bold text-white mb-2 tracking-tight">{lp.name}</h3>
                        {(() => {
                          const v = vialsFor(p);
                          return (
                            <p className="mb-3 text-[11px] font-semibold text-brand-300">
                              {locale === 'es'
                                ? `Recomendado: ${v} ${v === 1 ? 'vial' : 'viales'} · ${durationMonths} ${durationMonths === 1 ? 'mes' : 'meses'} de suministro`
                                : `Recommended: ${v} ${v === 1 ? 'vial' : 'vials'} · ${durationMonths}-month supply`}
                            </p>
                          );
                        })()}

                        {/* Benefits */}
                        <ul className="space-y-1.5 mb-4 flex-1">
                          {benefits.map((b, i) => (
                            <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
                              <Check className="h-3.5 w-3.5 text-brand-400 shrink-0 mt-0.5" />
                              <span>{b}</span>
                            </li>
                          ))}
                        </ul>

                        {/* Price + toggle */}
                        <ProductToggleButton product={p} locale={locale} showToast={showToast} name={lp.name} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Close the deal — single prominent CTA */}
            {recommendedProducts.length > 0 && (
              <div className="mt-14 rounded-3xl bg-gradient-to-br from-brand-900 via-brand-800 to-slate-900 p-8 md:p-12 text-center relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-brand-500/10 via-transparent to-transparent" />
                <div className="relative">
                  <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-brand-300 ring-1 ring-white/10">
                    <Check className="h-3 w-3" />
                    {locale === 'es' ? 'Listo' : 'Ready'}
                  </div>
                  <h3 className="mb-2 text-2xl md:text-3xl font-bold text-white tracking-tight">
                    {locale === 'es' ? 'Tu selección está lista' : 'Your selection is ready'}
                  </h3>
                  <p className="mb-8 text-sm text-slate-300 max-w-md mx-auto">
                    {locale === 'es'
                      ? 'Puedes modificar tu selección antes de finalizar.'
                      : 'You can adjust your selection before checkout.'}
                  </p>
                  <div className="flex flex-col items-center gap-3">
                    <Link to="/cart" className="w-full sm:w-auto">
                      <Button
                        size="lg"
                        onClick={() => {
                          // Ensure items are in cart with the correct vial count
                          recommendedProducts.forEach((p) => {
                            const { cart } = useAppStore.getState();
                            if (!cart.find((ci) => ci.product.id === p.id)) addToCart(p, vialsFor(p));
                          });
                        }}
                        className="btn-premium w-full sm:w-auto bg-gradient-to-r from-brand-500 to-brand-400 text-white hover:from-brand-400 hover:to-brand-300 rounded-full h-14 px-12 text-base font-bold shadow-2xl shadow-brand-500/50"
                      >
                        <ShoppingCart className="mr-2 h-5 w-5" />
                        {locale === 'es' ? 'Finalizar mi selección' : 'Complete my selection'}
                        <ArrowRight className="ml-2 h-5 w-5" />
                      </Button>
                    </Link>
                    <Link
                      to="/shop"
                      className="text-xs text-slate-400 hover:text-white underline-offset-4 hover:underline transition-colors"
                    >
                      {locale === 'es' ? 'Seguir explorando' : 'Keep exploring'}
                    </Link>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  const stepLabel = t('quiz.stepOf')
    .replace('{n}', String(Math.min(currentStep + 1, steps.length + 1)))
    .replace('{total}', String(steps.length + 1));
  const pct = Math.round(((currentStep + 1) / (steps.length + 1)) * 100);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-50">
      <div className="container mx-auto max-w-2xl px-4 py-8 md:py-16">
        {/* Progress */}
        <div className="mb-10 animate-fade-in">
          <div className="mb-3 flex justify-between text-xs font-medium text-slate-400 uppercase tracking-wider">
            <span>{stepLabel}</span>
            <span>{pct}%</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-slate-200 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-brand-600 to-brand-400 transition-all duration-500 ease-out"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        {currentStep < steps.length ? (
          <div className="animate-scale-in" key={currentStep}>
            <div className="rounded-3xl border border-slate-200/80 bg-white shadow-card p-6 md:p-10">
              {/* Step title */}
              <div className="mb-8">
                <h2 className="text-2xl md:text-3xl font-bold text-slate-900 tracking-tight text-balance">
                  {steps[currentStep].question}
                </h2>
                {steps[currentStep].multiSelect && (
                  <p className="mt-2 text-sm text-slate-500">
                    {locale === 'es' ? 'Selecciona todas las que apliquen a tu investigación' : 'Select all that apply to your research'}
                  </p>
                )}
              </div>

              {/* Options */}
              <div className={`space-y-3 ${steps[currentStep].id === 'duration' ? 'grid grid-cols-1 md:grid-cols-3 gap-4 space-y-0' : ''} ${steps[currentStep].id === 'preference' ? 'grid grid-cols-1 md:grid-cols-2 gap-4 space-y-0' : ''}`}>
                {steps[currentStep].options.map((option) => {
                  const meta = steps[currentStep].optionMeta?.[option];
                  const selected = isOptionSelected(option);
                  const isDuration = steps[currentStep].id === 'duration';
                  const isPreference = steps[currentStep].id === 'preference';
                  const isMulti = steps[currentStep].multiSelect;

                  // Duration cards - special layout
                  if (isDuration) {
                    return (
                      <button
                        key={option}
                        type="button"
                        onClick={() => handleSelect(option)}
                        className={`relative flex flex-col items-center text-center rounded-2xl border-2 p-5 pt-7 transition-all duration-200 ${
                          meta?.highlighted
                            ? selected
                              ? 'border-brand-600 bg-gradient-to-b from-brand-50 to-white shadow-xl ring-4 ring-brand-500/20 scale-[1.05]'
                              : 'border-brand-500 bg-gradient-to-b from-brand-50 to-white shadow-lg hover:shadow-xl hover:scale-[1.03]'
                            : selected
                              ? 'border-brand-500 bg-brand-50 shadow-md'
                              : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm'
                        }`}
                      >
                        {meta?.badge && (
                          <span className={`absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider whitespace-nowrap ${
                            meta.highlighted
                              ? 'bg-gradient-to-r from-brand-700 to-brand-500 text-white shadow-md'
                              : 'bg-slate-900 text-white'
                          }`}>
                            {meta.badge}
                          </span>
                        )}
                        <span className="text-2xl mb-2 mt-1">{meta?.icon}</span>
                        <span className={`font-bold text-slate-900 ${meta?.highlighted ? 'text-xl' : 'text-lg'}`}>{option}</span>
                        {meta?.subtitle && (
                          <span className={`text-slate-500 mt-1 ${meta?.highlighted ? 'text-sm font-medium' : 'text-xs'}`}>{meta.subtitle}</span>
                        )}
                        {meta?.offer && (
                          <span className={`mt-3 font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-2 rounded-xl leading-tight ${
                            meta?.highlighted ? 'text-sm' : 'text-xs'
                          }`}>
                            {meta.offer}
                          </span>
                        )}
                        {selected && (
                          <div className="absolute top-3 right-3">
                            <Check className="h-5 w-5 text-brand-600" />
                          </div>
                        )}
                      </button>
                    );
                  }

                  // Preference cards - two column
                  if (isPreference) {
                    return (
                      <button
                        key={option}
                        type="button"
                        onClick={() => handleSelect(option)}
                        className={`relative flex flex-col items-center text-center rounded-3xl border-2 p-7 pt-9 transition-all duration-200 ${
                          meta?.highlighted
                            ? selected
                              ? 'border-brand-600 bg-gradient-to-b from-brand-50 to-white shadow-2xl ring-4 ring-brand-500/20 scale-[1.04]'
                              : 'border-brand-500 bg-gradient-to-b from-brand-50 to-white shadow-xl hover:shadow-2xl hover:scale-[1.02]'
                            : selected
                              ? 'border-brand-500 bg-brand-50 shadow-md'
                              : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm'
                        }`}
                      >
                        {meta?.badge && (
                          <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider bg-gradient-to-r from-brand-700 to-brand-500 text-white shadow-md whitespace-nowrap">
                            {meta.badge}
                          </span>
                        )}
                        <span className="text-4xl mb-3">{meta?.icon}</span>
                        <span className={`font-bold text-slate-900 ${meta?.highlighted ? 'text-xl' : 'text-lg'}`}>{option}</span>
                        {meta?.subtitle && (
                          <span className="text-sm text-slate-600 mt-2 leading-relaxed">{meta.subtitle}</span>
                        )}
                        {selected && (
                          <div className="absolute top-3 right-3">
                            <Check className="h-5 w-5 text-brand-600" />
                          </div>
                        )}
                      </button>
                    );
                  }

                  // Default options (goals with multi-select, experience, budget)
                  return (
                    <button
                      key={option}
                      type="button"
                      onClick={() => handleSelect(option)}
                      className={`group w-full flex items-center gap-4 rounded-xl border-2 p-4 text-left transition-all duration-200 ${
                        selected
                          ? 'border-brand-500 bg-brand-50 shadow-sm'
                          : 'border-slate-200 text-slate-700 hover:border-brand-200 hover:bg-brand-50/30'
                      }`}
                    >
                      {/* Checkbox/Radio indicator */}
                      <div className={`shrink-0 flex items-center justify-center h-6 w-6 rounded-${isMulti ? 'md' : 'full'} border-2 transition-all ${
                        selected
                          ? 'border-brand-600 bg-brand-600 text-white'
                          : 'border-slate-300 group-hover:border-brand-300'
                      }`}>
                        {selected && <Check className="h-3.5 w-3.5" />}
                      </div>
                      {meta?.icon && (
                        <span className="text-xl shrink-0">{meta.icon}</span>
                      )}
                      <span className={`font-medium ${selected ? 'text-brand-900' : 'text-slate-700'}`}>
                        {option}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Note below options */}
              {steps[currentStep].note && (
                <p className="mt-6 text-center text-sm text-slate-500 bg-slate-50 rounded-xl px-4 py-3 border border-slate-100">
                  {steps[currentStep].note}
                </p>
              )}

              {/* Navigation */}
              <div className="mt-10 flex justify-between items-center">
                <button
                  type="button"
                  onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}
                  disabled={currentStep === 0}
                  className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-900 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ArrowLeft className="h-4 w-4" /> {t('quiz.back')}
                </button>
                <Button
                  type="button"
                  onClick={handleNext}
                  disabled={!canProceed()}
                  className="btn-premium bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-40 rounded-xl h-11 px-8 text-sm font-semibold"
                >
                  {continueLabel} <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        ) : (
          // ── Final step: user info form ──
          <div className="animate-scale-in">
            <div className="rounded-3xl border border-slate-200/80 bg-white shadow-card p-6 md:p-10">
              <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-brand-100 px-3 py-1 text-xs font-semibold text-brand-700">
                <Sparkles className="h-3 w-3" />
                {locale === 'es' ? '\u00daltimo paso' : 'Final Step'}
              </div>
              <h2 className="mb-2 text-2xl md:text-3xl font-bold text-slate-900 tracking-tight">{t('quiz.finalTitle')}</h2>
              <p className="mb-8 text-slate-500">{t('quiz.finalBody')}</p>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">{t('quiz.fullName')}</label>
                  <input
                    required
                    type="text"
                    className="input-premium"
                    placeholder={locale === 'es' ? 'Tu nombre completo' : 'Your full name'}
                    value={userInfo.name}
                    onChange={(e) => setUserInfo({ ...userInfo, name: e.target.value })}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">{t('quiz.email')}</label>
                  <input
                    required
                    type="email"
                    className={`input-premium ${emailVerified ? 'border-emerald-400 focus:border-emerald-500 focus:ring-emerald-500/20' : userInfoErrors.email ? 'border-red-400 focus:border-red-500 focus:ring-red-500/20' : ''}`}
                    placeholder={locale === 'es' ? 'tu@email.com' : 'you@email.com'}
                    value={userInfo.email}
                    onChange={(e) => {
                      setUserInfo({ ...userInfo, email: e.target.value });
                      if (userInfoErrors.email) setUserInfoErrors({ ...userInfoErrors, email: undefined });
                      if (emailVerified) setEmailVerified(false);
                    }}
                  />
                  {userInfoErrors.email && (
                    <p className="mt-1 text-xs text-red-600">{userInfoErrors.email}</p>
                  )}
                  <div className="mt-2">
                    <EmailOTP
                      email={userInfo.email}
                      locale={locale}
                      verified={emailVerified}
                      onVerifiedChange={setEmailVerified}
                      onChangeEmail={() => {
                        setEmailVerified(false);
                        setUserInfo({ ...userInfo, email: '' });
                      }}
                    />
                  </div>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">{t('quiz.phoneLabel')}</label>
                  <input
                    required
                    type="tel"
                    inputMode="numeric"
                    pattern="[0-9\s+()-]*"
                    className={`input-premium ${userInfoErrors.phone ? 'border-red-400 focus:border-red-500 focus:ring-red-500/20' : ''}`}
                    placeholder="15551234567"
                    value={userInfo.phone}
                    onChange={(e) => {
                      // Only allow digits, spaces, +, (, ), -
                      const sanitized = e.target.value.replace(/[^\d\s+()-]/g, '');
                      setUserInfo({ ...userInfo, phone: sanitized });
                      if (userInfoErrors.phone) setUserInfoErrors({ ...userInfoErrors, phone: undefined });
                    }}
                    onKeyDown={(e) => {
                      // Block letter keys
                      if (e.key.length === 1 && !/[\d\s+()-]/.test(e.key) && !e.ctrlKey && !e.metaKey) {
                        e.preventDefault();
                      }
                    }}
                  />
                  {userInfoErrors.phone && (
                    <p className="mt-1 text-xs text-red-600">{userInfoErrors.phone}</p>
                  )}
                </div>

                {/* Privacy */}
                <p className="text-center text-xs text-slate-400 pt-2">
                  🔒 {locale === 'es' ? 'Tu información es privada y nunca se comparte.' : 'Your information is private and never shared.'}
                </p>

                <div className="flex justify-between items-center pt-4">
                  <button
                    type="button"
                    onClick={() => setCurrentStep(currentStep - 1)}
                    className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-900 transition-colors"
                  >
                    <ArrowLeft className="h-4 w-4" /> {t('quiz.back')}
                  </button>
                  <Button
                    type="submit"
                    disabled={loading}
                    className="btn-premium bg-gradient-to-r from-brand-600 to-brand-500 text-white hover:from-brand-700 hover:to-brand-600 rounded-xl h-12 px-8 text-sm font-semibold shadow-lg shadow-brand-600/25 min-w-[180px]"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> {t('quiz.analyzing')}
                      </>
                    ) : (
                      <>
                        <Sparkles className="mr-2 h-4 w-4" /> {t('quiz.generate')}
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Product toggle button used in Quiz results (add/remove) ───
function ProductToggleButton({
  product,
  locale,
  showToast,
  name,
}: {
  product: Product;
  locale: Locale;
  showToast: (m: string) => void;
  name: string;
}) {
  const cart = useAppStore((s) => s.cart);
  const addToCart = useAppStore((s) => s.addToCart);
  const removeFromCart = useAppStore((s) => s.removeFromCart);
  const inCart = cart.find((ci) => ci.product.id === product.id);
  const eff = getEffectivePrice(product);
  return (
    <div className="flex items-center justify-between pt-3 border-t border-slate-800">
      <div className="flex items-baseline gap-2">
        <span className="font-bold text-xl text-white">${eff.finalPrice.toFixed(0)}</span>
        {eff.hasDiscount && (
          <>
            <span className="text-sm text-slate-500 line-through">${eff.originalPrice.toFixed(0)}</span>
            <span className="rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-bold px-2 py-0.5 ring-1 ring-emerald-500/30">-{eff.percentOff}%</span>
          </>
        )}
      </div>
      {inCart ? (
        <Button
          type="button"
          onClick={() => {
            removeFromCart(product.id);
            showToast(locale === 'es' ? `Quitado: ${name}` : `Removed: ${name}`);
          }}
          className="rounded-full bg-slate-800 border border-slate-700 text-slate-300 hover:bg-red-500/20 hover:text-red-300 hover:border-red-500/40 h-9 px-4 text-xs font-semibold"
        >
          <Check className="mr-1.5 h-3.5 w-3.5 text-brand-400" />
          {locale === 'es' ? 'Añadido' : 'Added'}
        </Button>
      ) : (
        <Button
          type="button"
          onClick={() => {
            addToCart(product, 1);
            showToast(locale === 'es' ? `Añadido: ${name}` : `Added: ${name}`);
          }}
          className="rounded-full bg-brand-600 text-white hover:bg-brand-500 h-9 px-4 text-xs font-semibold shadow-lg shadow-brand-700/30"
        >
          <ShoppingCart className="mr-1.5 h-3.5 w-3.5" />
          {locale === 'es' ? 'Añadir' : 'Add'}
        </Button>
      )}
    </div>
  );
}
