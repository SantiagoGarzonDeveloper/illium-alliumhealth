import { useState, useEffect, type ComponentType } from 'react';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ShieldCheck, Zap, Brain, Activity, ArrowRight, Sparkles, Star, Truck, HeadphonesIcon, CheckCircle2 } from 'lucide-react';
import { useAppStore } from '@/store';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useI18n } from '@/i18n/I18nContext';
import type { Locale } from '@/i18n/translations';
import { getLocalizedProduct } from '@/lib/productLocale';
import { getEffectivePrice } from '@/lib/pricing';

type HomeCategory = {
  name: string;
  color: string;
  path: string;
  imageUrl?: string;
  icon?: ComponentType<{ className?: string }>;
};

const DEFAULT_CATEGORIES: HomeCategory[] = [
  { name: 'Peptides', icon: Activity, color: 'bg-emerald-100 text-emerald-700', path: '/shop?category=peptides' },
  { name: 'NAD+', icon: Zap, color: 'bg-amber-100 text-amber-700', path: '/shop?category=nad' },
  { name: 'Nootropics', icon: Brain, color: 'bg-blue-100 text-blue-700', path: '/shop?category=nootropics' },
  { name: 'Recovery', icon: ShieldCheck, color: 'bg-purple-100 text-purple-700', path: '/shop?category=recovery' },
];

const ICON_CYCLE = [Activity, Zap, Brain, ShieldCheck] as const;

function categorySlugFromPath(path: string): string | null {
  try {
    const q = path.split('?')[1];
    if (!q) return null;
    const params = new URLSearchParams(q);
    return params.get('category');
  } catch {
    return null;
  }
}

function localizedCategoryName(path: string, rawName: string, locale: Locale, t: (p: string) => string): string {
  if (locale !== 'es') return rawName;
  const slug = categorySlugFromPath(path)?.toLowerCase();
  if (slug) {
    const key = `shop.cat.${slug}`;
    const tr = t(key);
    if (tr !== key) return tr;
  }
  const r = rawName.trim().toLowerCase().replace(/\s+/g, '');
  const map: Record<string, string> = {
    peptides: 'shop.cat.peptides',
    nad: 'shop.cat.nad',
    'nad+': 'shop.cat.nad',
    nootropics: 'shop.cat.nootropics',
    recovery: 'shop.cat.recovery',
    blends: 'shop.cat.blends',
    customblends: 'shop.cat.blends',
  };
  const key2 = map[r];
  if (key2) {
    const tr = t(key2);
    if (tr !== key2) return tr;
  }
  return rawName;
}

function localizedProductCategory(slug: string, locale: Locale, t: (p: string) => string): string {
  if (locale !== 'es') return slug;
  const key = `shop.cat.${slug.toLowerCase()}`;
  const tr = t(key);
  return tr === key ? slug : tr;
}

export function Home() {
  const { t, locale } = useI18n();
  const products = useAppStore((state) => state.products);
  const bestsellers = products.slice(0, 4);
  const [, setHeroTitle] = useState(() => t('home.defaultHeroTitle'));
  const [, setHeroSubtitle] = useState(() => t('home.defaultHeroSubtitle'));
  const [heroVideoUrl, setHeroVideoUrl] = useState<string>('');
  const [freeShipMin, setFreeShipMin] = useState(300);
  const [, setCategoriesSectionTitle] = useState(() => t('home.defaultCategoriesSection'));
  const [categories, setCategories] = useState<HomeCategory[]>(DEFAULT_CATEGORIES);

  useEffect(() => {
    setHeroTitle(t('home.defaultHeroTitle'));
    setHeroSubtitle(t('home.defaultHeroSubtitle'));
    setCategoriesSectionTitle(t('home.defaultCategoriesSection'));
    setCategories(
      DEFAULT_CATEGORIES.map((c) => ({
        ...c,
        name: localizedCategoryName(c.path, c.name, locale, t),
      }))
    );
  }, [locale, t]);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'settings', 'general'), (docSnap) => {
      if (!docSnap.exists()) return;
      const data = docSnap.data();
      if (locale === 'es') {
        setHeroTitle((data.heroTitleEs as string) || t('home.defaultHeroTitle'));
        setHeroSubtitle((data.heroSubtitleEs as string) || t('home.defaultHeroSubtitle'));
        setCategoriesSectionTitle((data.categoriesSectionTitleEs as string) || t('home.defaultCategoriesSection'));
      } else {
        setHeroTitle((data.heroTitle as string) || t('home.defaultHeroTitle'));
        setHeroSubtitle((data.heroSubtitle as string) || t('home.defaultHeroSubtitle'));
        setCategoriesSectionTitle((data.categoriesSectionTitle as string) || t('home.defaultCategoriesSection'));
      }
      if (typeof data.heroVideoUrl === 'string') {
        setHeroVideoUrl(data.heroVideoUrl);
      }
      if (typeof data.freeShippingThreshold === 'number') {
        setFreeShipMin(data.freeShippingThreshold);
      }
      if (data.categories && Array.isArray(data.categories) && data.categories.length > 0) {
        const mapped: HomeCategory[] = data.categories.map((c: Record<string, unknown>, i: number) => {
          const path = String(c.path ?? '/shop');
          const rawName = String(c.name ?? '');
          return {
            name: localizedCategoryName(path, rawName, locale, t),
            color: String(c.color ?? 'bg-slate-100 text-slate-700'),
            path,
            imageUrl: c.imageUrl ? String(c.imageUrl) : undefined,
            icon: ICON_CYCLE[i % ICON_CYCLE.length],
          };
        });
        setCategories(mapped);
      }
    });
    return () => unsub();
  }, [locale, t]);

  return (
    <div className="flex flex-col min-h-screen">
      {/* Top announcement bar — premium, taller */}
      <div className="bg-gradient-to-r from-brand-800 via-brand-600 to-brand-800 text-white py-3.5 px-4 overflow-hidden shadow-sm">
        <div className="container mx-auto flex items-center justify-center gap-5 md:gap-10 text-xs md:text-sm font-semibold flex-wrap tracking-wide">
          <span className="flex items-center gap-2">🇺🇸 <span>{locale === 'es' ? 'Sintetizado en EE.UU.' : 'Synthesized in USA'}</span></span>
          <span className="hidden md:inline text-white/40">·</span>
          <span className="flex items-center gap-2">🧪 <span>{locale === 'es' ? 'Verificado por HPLC y MS independiente' : 'Independent HPLC & MS verified'}</span></span>
          <span className="hidden md:inline text-white/40">·</span>
          <span className="flex items-center gap-2">✅ <span>{locale === 'es' ? 'Pureza 99%+ certificada' : '99%+ purity certified'}</span></span>
          <span className="hidden md:inline text-white/40">·</span>
          <span className="flex items-center gap-2">⚡ <span>{locale === 'es' ? 'Stock de investigación limitado' : 'Limited research stock'}</span></span>
          <span className="hidden lg:inline text-white/40">·</span>
          <span className="hidden lg:flex items-center gap-2">🚚 <span>{locale === 'es' ? `Envío gratis +$${freeShipMin}` : `Free shipping $${freeShipMin}+`}</span></span>
          <span className="hidden lg:inline text-white/40">·</span>
          <span className="hidden lg:flex items-center gap-2">🔒 <span>{locale === 'es' ? 'Compra segura' : 'Secure checkout'}</span></span>
        </div>
      </div>

      {/* Cinematic HERO with video background */}
      <section className="relative overflow-hidden bg-black">
        {/* Background video or animated fallback */}
        <div className="absolute inset-0 z-0">
          {heroVideoUrl ? (
            <video
              autoPlay
              muted
              loop
              playsInline
              className="absolute inset-0 w-full h-full object-cover"
              poster="/illium-logo-dark.png"
              style={{ filter: 'brightness(1.5) contrast(1.15) saturate(1.2)' }}
            >
              <source src={heroVideoUrl} type="video/mp4" />
            </video>
          ) : (
            // Fallback: animated gradient background
            <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-brand-950 to-black">
              <motion.div
                className="absolute top-0 right-0 h-[600px] w-[600px] rounded-full bg-brand-500/20 blur-[120px]"
                animate={{ scale: [1, 1.25, 1], x: [0, 40, 0], y: [0, -30, 0] }}
                transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
              />
              <motion.div
                className="absolute bottom-0 left-0 h-[500px] w-[500px] rounded-full bg-brand-700/20 blur-[100px]"
                animate={{ scale: [1, 1.3, 1], x: [0, -35, 0], y: [0, 30, 0] }}
                transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
              />
              {/* Floating glowing particles */}
              {Array.from({ length: 24 }).map((_, i) => (
                <motion.div
                  key={i}
                  className="absolute h-1.5 w-1.5 rounded-full bg-brand-400 shadow-[0_0_12px_rgba(74,222,128,0.8)]"
                  style={{ left: `${(i * 47) % 100}%`, top: `${(i * 71) % 100}%` }}
                  animate={{
                    y: [0, -80, 0],
                    opacity: [0, 1, 0],
                    scale: [0.5, 1.2, 0.5],
                  }}
                  transition={{
                    duration: 4 + (i % 4),
                    repeat: Infinity,
                    delay: i * 0.2,
                    ease: 'easeInOut',
                  }}
                />
              ))}
            </div>
          )}

          {/* Lighter overlay — let the vial shine through more */}
          <div className="absolute inset-0 bg-gradient-to-b from-black/45 via-black/20 to-black/70" />
          <div className="absolute inset-0 bg-gradient-to-r from-black/60 via-transparent to-transparent" />
          {/* Subtle brand glow */}
          <div className="absolute inset-0 bg-gradient-radial-subtle pointer-events-none" style={{ background: 'radial-gradient(ellipse at center, transparent 0%, rgba(0,0,0,0.3) 100%)' }} />
        </div>

        <div className="container mx-auto px-4 py-24 md:py-36 lg:py-44 relative z-10 min-h-[600px] flex items-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, ease: 'easeOut' }}
            className="max-w-3xl"
          >
            {/* Kicker badge */}
            <motion.div
              className="inline-flex items-center gap-2 rounded-full bg-white/5 backdrop-blur-md border border-white/10 px-4 py-1.5 text-[10px] font-bold uppercase tracking-[0.25em] text-brand-300 mb-6"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.1, duration: 0.8 }}
            >
              <Sparkles className="h-3 w-3" />
              ILLIUM · {locale === 'es' ? 'Pureza 99%+' : '99%+ Purity'}
            </motion.div>

            {/* Main title */}
            <motion.h1
              className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight text-white mb-6 leading-[1.1]"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 1 }}
            >
              {locale === 'es' ? (
                <>
                  <span className="block">Péptidos avanzados de investigación</span>
                  <span className="block bg-gradient-to-r from-brand-300 via-brand-400 to-emerald-300 bg-clip-text text-transparent mt-2">
                    para estudio metabólico, neurológico
                  </span>
                  <span className="block text-slate-100 mt-1">
                    &amp; regenerativo
                  </span>
                </>
              ) : (
                <>
                  <span className="block">Advanced research peptides</span>
                  <span className="block bg-gradient-to-r from-brand-300 via-brand-400 to-emerald-300 bg-clip-text text-transparent mt-2">
                    for metabolic, neurological
                  </span>
                  <span className="block text-slate-100 mt-1">
                    &amp; regenerative study
                  </span>
                </>
              )}
            </motion.h1>

            {/* Subtitle */}
            <motion.p
              className="text-base md:text-lg text-slate-300 mb-8 max-w-2xl leading-relaxed"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5, duration: 0.8 }}
            >
              {locale === 'es'
                ? 'Vías metabólicas, reparación de tejidos, investigación cognitiva y más — compuestos de grado laboratorio, pureza 99%+.'
                : 'Metabolic pathways, tissue repair, cognitive research and more — lab-grade compounds, 99%+ purity.'}
            </motion.p>

            {/* CTAs */}
            <motion.div
              className="flex flex-col sm:flex-row gap-3 mb-10"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.7, duration: 0.8 }}
            >
              <Link to="/quiz">
                <Button
                  size="lg"
                  className="btn-premium w-full sm:w-auto bg-gradient-to-r from-brand-500 to-brand-400 text-white hover:from-brand-400 hover:to-brand-300 rounded-full h-14 px-12 text-base font-bold shadow-2xl shadow-brand-500/50"
                >
                  {locale === 'es' ? 'Encuentra tus compuestos' : 'Find your compounds'}
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
              <Link to="/shop">
                <Button
                  size="lg"
                  className="btn-premium w-full sm:w-auto bg-white/10 backdrop-blur-md border-2 border-white/20 text-white hover:bg-white/20 rounded-full h-14 px-10 text-base font-semibold"
                >
                  {locale === 'es' ? 'Ver productos' : 'View products'}
                </Button>
              </Link>
            </motion.div>

            {/* Trust badges - floating on video */}
            <motion.div
              className="flex flex-wrap gap-2.5 md:gap-3 text-[11px] md:text-xs text-slate-300"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1, duration: 1 }}
            >
              <div className="flex items-center gap-1.5 rounded-full bg-white/5 backdrop-blur-sm border border-white/10 px-3 py-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-brand-400" />
                <span>{locale === 'es' ? 'Verificado por terceros' : '3rd-party tested'}</span>
              </div>
              <div className="flex items-center gap-1.5 rounded-full bg-white/5 backdrop-blur-sm border border-white/10 px-3 py-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-brand-400" />
                <span>99%+ {locale === 'es' ? 'pureza' : 'purity'}</span>
              </div>
              <div className="flex items-center gap-1.5 rounded-full bg-white/5 backdrop-blur-sm border border-white/10 px-3 py-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-brand-400" />
                <span>{locale === 'es' ? 'Envío rápido en EE.UU.' : 'Fast US shipping'}</span>
              </div>
              <div className="flex items-center gap-1.5 rounded-full bg-white/5 backdrop-blur-sm border border-white/10 px-3 py-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-brand-400" />
                <span>{locale === 'es' ? 'Compra segura' : 'Secure checkout'}</span>
              </div>
            </motion.div>
          </motion.div>
        </div>

        {/* Scroll indicator */}
        <motion.div
          className="absolute bottom-8 left-1/2 -translate-x-1/2 text-white/60 text-[10px] uppercase tracking-[0.3em] hidden md:block"
          animate={{ y: [0, 6, 0] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        >
          {locale === 'es' ? '↓ Desplázate' : '↓ Scroll'}
        </motion.div>
      </section>

      {/* unused var suppressor */}
      {false && <span>{bestsellers[0]?.id}{HeadphonesIcon.name}{Zap.name}{Brain.name}</span>}

      {/* Quiz CTA — high above the fold to drive conversion */}
      <section className="py-14 bg-white border-b border-slate-100">
        <div className="container mx-auto px-4">
          <div className="max-w-5xl mx-auto rounded-3xl bg-gradient-to-br from-slate-950 via-brand-900 to-slate-950 p-8 md:p-12 text-white relative overflow-hidden">
            <div className="absolute -right-20 -top-20 h-80 w-80 rounded-full bg-brand-500/10 blur-3xl" />
            <div className="absolute -left-20 -bottom-20 h-80 w-80 rounded-full bg-brand-600/10 blur-3xl" />
            <div className="relative grid lg:grid-cols-[1fr_auto] gap-6 items-center">
              <div>
                <div className="inline-flex items-center gap-1.5 rounded-full bg-brand-500/20 border border-brand-400/30 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.25em] text-brand-300 mb-4">
                  <Sparkles className="h-3 w-3" />
                  {locale === 'es' ? 'Quiz IA' : 'AI Quiz'}
                </div>
                <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-3">
                  {locale === 'es' ? 'No adivines. Descubre exactamente qué necesitas' : "Don't guess. Discover exactly what you need"}
                </h2>
                <p className="text-base text-slate-300 mb-6 max-w-xl">
                  {locale === 'es'
                    ? 'Responde 5 preguntas y obtén un protocolo personalizado en segundos.'
                    : 'Answer 5 questions and get a personalized protocol in seconds.'}
                </p>
                <Link to="/quiz">
                  <Button
                    size="lg"
                    className="btn-premium bg-gradient-to-r from-brand-500 to-brand-400 text-white hover:from-brand-400 hover:to-brand-300 rounded-full h-13 px-10 text-base font-bold shadow-2xl shadow-brand-500/40"
                  >
                    {locale === 'es' ? 'Empieza ahora' : 'Start now'}
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                </Link>
              </div>
              <div className="hidden lg:flex flex-col gap-4">
                <div className="flex items-center gap-3 rounded-xl bg-white/5 backdrop-blur-sm border border-white/10 p-4">
                  <div className="h-10 w-10 rounded-lg bg-brand-500/20 flex items-center justify-center shrink-0">
                    <Zap className="h-5 w-5 text-brand-400" />
                  </div>
                  <div>
                    <p className="font-bold text-white text-sm">60 {locale === 'es' ? 'segundos' : 'seconds'}</p>
                    <p className="text-xs text-slate-400">{locale === 'es' ? 'Rápido y simple' : 'Quick & simple'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 rounded-xl bg-white/5 backdrop-blur-sm border border-white/10 p-4">
                  <div className="h-10 w-10 rounded-lg bg-brand-500/20 flex items-center justify-center shrink-0">
                    <Sparkles className="h-5 w-5 text-brand-400" />
                  </div>
                  <div>
                    <p className="font-bold text-white text-sm">{locale === 'es' ? 'Personalizado' : 'Fully personalized'}</p>
                    <p className="text-xs text-slate-400">{locale === 'es' ? 'Según tu perfil' : 'Based on your profile'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 rounded-xl bg-white/5 backdrop-blur-sm border border-white/10 p-4">
                  <div className="h-10 w-10 rounded-lg bg-brand-500/20 flex items-center justify-center shrink-0">
                    <ShieldCheck className="h-5 w-5 text-brand-400" />
                  </div>
                  <div>
                    <p className="font-bold text-white text-sm">{locale === 'es' ? 'Sin compromiso' : 'No commitment'}</p>
                    <p className="text-xs text-slate-400">{locale === 'es' ? '100% gratis' : '100% free'}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Categories */}
      <section className="py-20 bg-slate-50/50">
        <div className="container mx-auto px-4">
          <div className="text-center mb-14">
            <p className="text-xs font-bold uppercase tracking-[0.3em] text-brand-700 mb-3">
              {locale === 'es' ? 'Categorías' : 'Categories'}
            </p>
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-3 tracking-tight">
              {locale === 'es' ? 'Elige tu objetivo' : 'Choose Your Goal'}
            </h2>
            <div className="section-divider mt-4" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-5">
            {categories.map((cat, idx) => {
              const Icon = cat.icon ?? Activity;
              return (
                <Link key={`${cat.path}-${idx}`} to={cat.path || '/shop'} className="group">
                  {(() => {
                    const slug = categorySlugFromPath(cat.path)?.toLowerCase() || '';
                    const tones: Record<string, { grad: string; glow: string }> = {
                      metabolic: { grad: 'from-orange-900/60 via-red-900/30 to-black', glow: 'hover:shadow-orange-500/30' },
                      recovery: { grad: 'from-blue-900/60 via-cyan-900/30 to-black', glow: 'hover:shadow-blue-500/30' },
                      nootropics: { grad: 'from-purple-900/70 via-slate-900 to-black', glow: 'hover:shadow-purple-500/30' },
                      nad: { grad: 'from-yellow-800/40 via-slate-800 to-black', glow: 'hover:shadow-amber-500/30' },
                      blends: { grad: 'from-brand-900/70 via-emerald-900/40 to-black', glow: 'hover:shadow-brand-600/30' },
                      peptides: { grad: 'from-brand-900/60 via-slate-900 to-black', glow: 'hover:shadow-brand-600/30' },
                    };
                    const tone = tones[slug] || tones.blends;
                    return (
                      <div className={`relative overflow-hidden rounded-3xl bg-gradient-to-br ${tone.grad} aspect-[3/4] cursor-pointer transition-all duration-500 hover:-translate-y-2 hover:shadow-2xl ${tone.glow}`}>
                    {cat.imageUrl ? (
                      <>
                        <img
                          src={cat.imageUrl}
                          alt={cat.name}
                          className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-black/20" />
                      </>
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-brand-900 to-slate-900">
                        <Icon className="w-16 h-16 text-brand-400 opacity-60" />
                      </div>
                    )}

                    {/* Content overlay */}
                    <div className="relative z-10 h-full flex flex-col justify-end p-6">
                      <p className="text-[10px] uppercase tracking-[0.2em] text-brand-400 font-bold mb-2">ILLIUM</p>
                      <h3 className="text-xl font-bold text-white mb-1 tracking-tight">{cat.name}</h3>
                      <p className="text-xs text-slate-300 mb-3 leading-tight">
                        {(() => {
                          const slug = categorySlugFromPath(cat.path)?.toLowerCase() || '';
                          const subs: Record<string, { es: string; en: string }> = {
                            metabolic: { es: 'Pérdida de grasa y metabolismo', en: 'Fat loss & metabolism' },
                            recovery: { es: 'Recuperación muscular y anti-fatiga', en: 'Muscle recovery & anti-fatigue' },
                            nootropics: { es: 'Enfoque, memoria y claridad mental', en: 'Focus, memory & mental clarity' },
                            nad: { es: 'Energía celular y vitalidad', en: 'Cellular energy & vitality' },
                            blends: { es: 'Combinaciones premium', en: 'Premium combinations' },
                            peptides: { es: 'Péptidos de investigación', en: 'Research peptides' },
                          };
                          const s = subs[slug];
                          return s ? (locale === 'es' ? s.es : s.en) : '';
                        })()}
                      </p>
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-white/70 group-hover:text-brand-400 transition-colors">
                        <span>{locale === 'es' ? 'Explorar' : 'Explore'}</span>
                        <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
                      </div>
                    </div>
                  </div>
                    );
                  })()}
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* Bestsellers */}
      <section className="py-20 bg-slate-50/50">
        <div className="container mx-auto px-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end mb-12 gap-4">
            <div>
              <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-2 tracking-tight">{t('home.bestsellersTitle')}</h2>
              <p className="text-slate-500">{t('home.bestsellersSubtitle')}</p>
            </div>
            <Link to="/shop">
              <Button className="bg-brand-600 hover:bg-brand-500 text-white rounded-full h-10 px-6 text-sm font-bold shadow-md">
                {t('home.viewAll')} <ArrowRight className="ml-1.5 h-4 w-4" />
              </Button>
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {bestsellers.map((product, idx) => {
              const lp = getLocalizedProduct(product, locale);
              const eff = getEffectivePrice(product);
              const rating = (4.6 + ((idx * 0.1) % 0.4)).toFixed(1);
              const reviews = 120 + idx * 37;
              const isLowStock = (product.stock ?? 100) < 30;
              return (
              <Link key={product.id} to={`/product/${product.id}`} className="group block">
                <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-slate-800 to-black p-3 transition-all duration-500 hover:-translate-y-2 hover:shadow-2xl hover:shadow-brand-600/25">
                  {/* Top badges — varied per product */}
                  <div className="absolute top-5 left-5 right-5 z-20 flex justify-between items-start gap-2">
                    {(() => {
                      const badges = [
                        { label: locale === 'es' ? 'Más vendido' : 'Best Seller', icon: '🔥', bg: 'bg-brand-900/95' },
                        { label: locale === 'es' ? 'Más popular' : 'Most Popular', icon: '⭐', bg: 'bg-brand-900/95' },
                        { label: locale === 'es' ? 'Tendencia' : 'Trending', icon: '📈', bg: 'bg-brand-900/95' },
                        { label: locale === 'es' ? 'Nuevo' : 'New', icon: '✨', bg: 'bg-brand-900/95' },
                      ];
                      const b = badges[idx % badges.length];
                      return (
                        <span className={`inline-flex items-center gap-1 rounded-full ${b.bg} backdrop-blur-md text-white text-[10px] font-bold px-2.5 py-1`}>
                          {b.icon} {b.label}
                        </span>
                      );
                    })()}
                    <div className="flex flex-col items-end gap-1.5">
                      {eff.hasDiscount && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500 text-white text-[10px] font-bold px-2.5 py-1 shadow-lg">
                          -{eff.percentOff}%
                        </span>
                      )}
                      {isLowStock && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-brand-900/95 backdrop-blur-md text-white text-[10px] font-bold px-2.5 py-1">
                          ⚡ {locale === 'es' ? 'Poco stock' : 'Low stock'}
                        </span>
                      )}
                    </div>
                  </div>
                  {/* Image section */}
                  <div className="relative aspect-[4/5] overflow-hidden rounded-2xl bg-gradient-to-b from-slate-800/50 to-black">
                    <img
                      src={product.img}
                      alt={lp.name}
                      className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700 ease-out"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                  </div>
                  {/* Info section */}
                  <div className="px-3 pt-5 pb-3">
                    <div className="text-[10px] text-brand-400 mb-2 font-bold tracking-[0.2em] uppercase">
                      ILLIUM · {localizedProductCategory(product.category, locale, t)}
                    </div>
                    <h3 className="font-bold text-white mb-2 line-clamp-1 text-lg tracking-tight">{lp.name}</h3>
                    <div className="flex items-center gap-1.5 mb-3 text-xs text-slate-400">
                      <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                      <span className="font-semibold text-white">{rating}</span>
                      <span>({reviews})</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-baseline gap-2">
                        <span className="font-bold text-2xl text-white">${eff.finalPrice.toFixed(0)}</span>
                        {eff.hasDiscount && (
                          <span className="text-sm text-slate-500 line-through">${eff.originalPrice.toFixed(0)}</span>
                        )}
                      </div>
                      <span className="inline-flex items-center gap-1 rounded-full bg-brand-600 hover:bg-brand-500 text-white text-[11px] font-bold px-3 py-1.5 transition-colors shadow-md">
                        {locale === 'es' ? 'Ver' : 'View'} <ArrowRight className="h-3 w-3" />
                      </span>
                    </div>
                  </div>
                </div>
              </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* Trust section — build confidence */}
      <section className="py-20 bg-white border-t border-slate-100">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 max-w-6xl mx-auto">
            <div className="text-center">
              <div className="h-20 w-20 rounded-3xl bg-brand-100 flex items-center justify-center mx-auto mb-4 shadow-sm">
                <Star className="h-9 w-9 text-brand-700 fill-brand-700" />
              </div>
              <p className="text-4xl font-black text-slate-900 tracking-tight">2,000+</p>
              <p className="text-sm text-slate-500 font-semibold mt-2">{locale === 'es' ? 'Clientes satisfechos' : 'Happy customers'}</p>
              <p className="text-[11px] text-slate-400 mt-1">{locale === 'es' ? 'Recomendación verificada' : 'Verified reviews'}</p>
            </div>
            <div className="text-center">
              <div className="h-20 w-20 rounded-3xl bg-emerald-100 flex items-center justify-center mx-auto mb-4 shadow-sm">
                <ShieldCheck className="h-9 w-9 text-emerald-700" />
              </div>
              <p className="text-4xl font-black text-slate-900 tracking-tight">🇺🇸 USA</p>
              <p className="text-sm text-slate-500 font-semibold mt-2">{locale === 'es' ? 'Fabricado en EE.UU.' : 'Made in the U.S.'}</p>
              <p className="text-[11px] text-slate-400 mt-1">{locale === 'es' ? 'Laboratorios certificados' : 'Certified facilities'}</p>
            </div>
            <div className="text-center">
              <div className="h-20 w-20 rounded-3xl bg-blue-100 flex items-center justify-center mx-auto mb-4 shadow-sm">
                <Truck className="h-9 w-9 text-blue-700" />
              </div>
              <p className="text-4xl font-black text-slate-900 tracking-tight">2–5d</p>
              <p className="text-sm text-slate-500 font-semibold mt-2">{locale === 'es' ? 'Envío rápido EE.UU.' : 'Fast U.S. shipping'}</p>
              <p className="text-[11px] text-slate-400 mt-1">{locale === 'es' ? 'Con tracking' : 'With tracking'}</p>
            </div>
            <div className="text-center">
              <div className="h-20 w-20 rounded-3xl bg-amber-100 flex items-center justify-center mx-auto mb-4 shadow-sm">
                <CheckCircle2 className="h-9 w-9 text-amber-700" />
              </div>
              <p className="text-4xl font-black text-slate-900 tracking-tight">SSL</p>
              <p className="text-sm text-slate-500 font-semibold mt-2">{locale === 'es' ? 'Compra 100% segura' : '100% secure checkout'}</p>
              <p className="text-[11px] text-slate-400 mt-1">TLS 1.3</p>
            </div>
          </div>
        </div>
      </section>

      {/* Our Company */}
      <section className="py-20 bg-gradient-to-b from-slate-50 to-white border-t border-slate-100">
        <div className="container mx-auto px-4 max-w-6xl">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Left: text */}
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.3em] text-brand-700 mb-3">
                {locale === 'es' ? 'Nuestra Empresa' : 'Our Company'}
              </p>
              <h2 className="text-3xl md:text-4xl font-bold text-slate-900 tracking-tight mb-6 leading-tight">
                {locale === 'es'
                  ? 'Donde la ciencia se encuentra con el potencial'
                  : 'Where Science Meets Potential'}
              </h2>
              <p className="text-slate-600 leading-relaxed mb-6">
                {locale === 'es'
                  ? 'ILLIUM fue fundada por un colectivo de investigadores y científicos de laboratorio comprometidos con ampliar la disponibilidad de compuestos de investigación de alta pureza para la comunidad científica.'
                  : 'ILLIUM was founded by a collective of researchers and laboratory scientists committed to advancing the availability of high-purity research compounds for the scientific community.'}
              </p>
              <p className="text-slate-600 leading-relaxed mb-8">
                {locale === 'es'
                  ? 'Cada producto que ofrecemos está destinado estrictamente para fines de investigación en laboratorio. Al combinar ciencia avanzada con pasión por el potencial humano, garantizamos que cada compuesto cumple con los estándares más exigentes.'
                  : 'Every product we offer is intended strictly for laboratory research purposes only. By combining advanced science with a passion for human potential, we ensure that every compound we deliver meets the most uncompromising standards your work demands.'}
              </p>
              <div className="grid grid-cols-2 gap-4 mb-8">
                <div className="flex items-start gap-3">
                  <div className="h-10 w-10 rounded-xl bg-brand-100 flex items-center justify-center shrink-0">
                    <ShieldCheck className="h-5 w-5 text-brand-700" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-900">{locale === 'es' ? 'Servicio confiable' : 'Service You Can Trust'}</p>
                    <p className="text-xs text-slate-500">{locale === 'es' ? 'Soporte dedicado 24/7' : 'Dedicated 24/7 support'}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="h-10 w-10 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0">
                    <CheckCircle2 className="h-5 w-5 text-emerald-700" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-900">{locale === 'es' ? 'Calidad sin compromiso' : 'Uncompromising Quality'}</p>
                    <p className="text-xs text-slate-500">HPLC & MS</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="h-10 w-10 rounded-xl bg-blue-100 flex items-center justify-center shrink-0">
                    <Truck className="h-5 w-5 text-blue-700" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-900">{locale === 'es' ? 'Envío rápido y discreto' : 'Fast / Discreet Shipping'}</p>
                    <p className="text-xs text-slate-500">{locale === 'es' ? 'Empaque sin marca' : 'Unbranded packaging'}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="h-10 w-10 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
                    <Star className="h-5 w-5 text-amber-700" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-900">{locale === 'es' ? 'Reportes de laboratorio' : 'Up-to-Date Lab Reports'}</p>
                    <p className="text-xs text-slate-500">COA {locale === 'es' ? 'por lote' : 'per batch'}</p>
                  </div>
                </div>
              </div>
              <Link to="/shop">
                <Button className="bg-slate-900 hover:bg-brand-700 text-white rounded-full h-11 px-8 text-sm font-bold transition-colors">
                  {locale === 'es' ? 'Ver productos' : 'Shop Now'} <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </div>

            {/* Right: visual cards */}
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-3xl bg-gradient-to-br from-brand-50 to-emerald-50 border border-brand-200 p-6 text-center">
                <div className="text-5xl font-black text-brand-900 mb-2">99%+</div>
                <p className="text-sm font-bold text-slate-900">{locale === 'es' ? 'Pureza garantizada' : 'Purity Without Exception'}</p>
                <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                  {locale === 'es'
                    ? 'Los compuestos de mayor calidad del mercado, sintetizados para mantener una pureza del 99%+ en cada producto.'
                    : 'Secure the highest-tier peptides available, synthesized to maintain a 99%+ purity profile for every experiment.'}
                </p>
              </div>
              <div className="rounded-3xl bg-gradient-to-br from-slate-900 to-brand-950 text-white p-6 text-center row-span-2">
                <div className="h-16 w-16 rounded-2xl bg-brand-500/20 flex items-center justify-center mx-auto mb-4">
                  <ShieldCheck className="h-8 w-8 text-brand-400" />
                </div>
                <p className="text-lg font-bold mb-2">COA</p>
                <p className="text-sm font-bold text-brand-300 mb-3">
                  {locale === 'es' ? 'Certificado de Análisis' : 'Certificate of Analysis'}
                </p>
                <p className="text-xs text-slate-400 leading-relaxed">
                  {locale === 'es'
                    ? 'Cada lote incluye documentación completa de pruebas de laboratorio independientes.'
                    : 'Every batch includes full documentation from independent laboratory testing.'}
                </p>
              </div>
              <div className="rounded-3xl bg-gradient-to-br from-amber-50 to-white border border-amber-200 p-6 text-center">
                <p className="text-lg font-bold text-slate-900 mb-2">🇺🇸</p>
                <p className="text-sm font-bold text-slate-900">{locale === 'es' ? 'Hecho en EE.UU.' : 'Manufactured in the U.S.'}</p>
                <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                  {locale === 'es'
                    ? 'Todos nuestros productos son fabricados en laboratorios certificados en Estados Unidos.'
                    : 'All our products are manufactured in certified laboratories in the United States.'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Bundles — combos de alto valor */}
      <section className="py-20 bg-gradient-to-b from-slate-50 to-white">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <p className="text-xs font-bold uppercase tracking-[0.3em] text-brand-700 mb-3">
              {locale === 'es' ? 'Combos' : 'Bundles'}
            </p>
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-3 tracking-tight">
              {locale === 'es' ? 'Stacks completos · Ahorra hasta 25%' : 'Complete stacks · Save up to 25%'}
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {[
              {
                key: 'fat-loss',
                title: locale === 'es' ? 'Metabolic Research Stack' : 'Metabolic Research Stack',
                sub: locale === 'es' ? 'Vía GLP · Señalización del apetito · Metabolismo energético' : 'GLP pathway · Appetite signaling · Energy metabolism',
                orig: 397,
                price: 299,
                ctaCat: 'metabolic',
                color: 'from-red-500 to-orange-600',
                icon: '🔥',
              },
              {
                key: 'performance',
                title: locale === 'es' ? 'Anabolic Research Stack' : 'Anabolic Research Stack',
                sub: locale === 'es' ? 'Miogénesis · Señalización muscular · Reparación de tejidos' : 'Myogenesis · Muscle signaling · Tissue repair',
                orig: 427,
                price: 319,
                ctaCat: 'metabolic',
                color: 'from-brand-500 to-brand-800',
                icon: '💪',
                badge: locale === 'es' ? 'MÁS POPULAR' : 'MOST POPULAR',
              },
              {
                key: 'recovery',
                title: locale === 'es' ? 'Regenerative Research Stack' : 'Regenerative Research Stack',
                sub: locale === 'es' ? 'Reparación de tejidos · Vías antiinflamatorias · Investigación dérmica' : 'Tissue repair · Anti-inflammatory pathways · Dermal research',
                orig: 277,
                price: 209,
                ctaCat: 'recovery',
                color: 'from-blue-500 to-cyan-600',
                icon: '🩹',
              },
            ].map((b) => (
              <Link key={b.key} to={`/shop?category=${b.ctaCat}`} className="group block">
                {/* Extra wrapper adds top padding so the absolute badge has space (no more clipping) */}
                <div className={`relative ${b.badge ? 'pt-5' : ''}`}>
                  {b.badge && (
                    <div className="absolute -top-0 left-0 right-0 flex justify-center z-10">
                      <span className="inline-flex items-center gap-1.5 px-5 py-1.5 rounded-full text-[11px] font-black uppercase tracking-widest bg-gradient-to-r from-brand-700 via-brand-500 to-brand-700 text-white shadow-xl shadow-brand-500/50 whitespace-nowrap">
                        <span>⭐</span> {b.badge}
                      </span>
                    </div>
                  )}
                  <div className={`relative overflow-hidden rounded-3xl border-2 ${b.badge ? 'border-brand-500 ring-4 ring-brand-500/30 shadow-2xl shadow-brand-500/30 md:scale-[1.03]' : 'border-slate-200'} bg-white p-7 transition-all hover:-translate-y-2 hover:shadow-2xl`}>
                    {b.badge && <div className="pointer-events-none absolute inset-0 rounded-3xl bg-gradient-to-b from-brand-500/5 via-transparent to-transparent" />}
                    <div className={`h-16 w-16 rounded-2xl bg-gradient-to-br ${b.color} flex items-center justify-center text-3xl mb-5 shadow-lg`}>
                      {b.icon}
                    </div>
                    <h3 className="text-xl font-bold text-slate-900 mb-1">{b.title}</h3>
                    <p className="text-sm text-slate-500 mb-5 leading-relaxed">{b.sub}</p>
                    <div className="flex items-baseline gap-2 mb-1">
                      <span className="text-4xl font-black text-slate-900">${b.price}</span>
                      <span className="text-sm text-slate-400 line-through">${b.orig}</span>
                    </div>
                    <p className="text-xs font-bold text-emerald-700 mb-5">
                      {locale === 'es' ? 'Ahorras' : 'Save'} ${b.orig - b.price}
                    </p>
                    <Button className={`w-full ${b.badge ? 'bg-gradient-to-r from-brand-600 to-brand-500 shadow-lg shadow-brand-600/30 hover:from-brand-500 hover:to-brand-400' : 'bg-slate-900 hover:bg-brand-700'} text-white rounded-full h-12 text-sm font-bold transition-all`}>
                      {locale === 'es' ? 'Ver stack' : 'View stack'} <ArrowRight className="ml-1.5 h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA — premium split panel with glow */}
      <section className="py-24 bg-white">
        <div className="container mx-auto px-4">
          <div className="relative overflow-hidden rounded-[32px] bg-gradient-to-br from-slate-950 via-emerald-950 to-slate-950 shadow-2xl">
            {/* Animated backdrop */}
            <div className="absolute inset-0 pointer-events-none">
              <motion.div
                className="absolute -top-20 -right-20 w-[500px] h-[500px] bg-brand-500/20 rounded-full blur-[120px]"
                animate={{ scale: [1, 1.15, 1], opacity: [0.6, 1, 0.6] }}
                transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
              />
              <motion.div
                className="absolute -bottom-20 -left-20 w-[400px] h-[400px] bg-brand-700/25 rounded-full blur-[100px]"
                animate={{ scale: [1, 1.2, 1], opacity: [0.4, 0.8, 0.4] }}
                transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
              />
              {/* Subtle particles */}
              {Array.from({ length: 8 }).map((_, i) => (
                <motion.div
                  key={i}
                  className="absolute h-1 w-1 rounded-full bg-brand-400/60"
                  style={{ left: `${10 + i * 12}%`, top: `${20 + (i % 3) * 25}%` }}
                  animate={{ y: [0, -40, 0], opacity: [0, 1, 0] }}
                  transition={{ duration: 4 + (i % 3), repeat: Infinity, delay: i * 0.4, ease: 'easeInOut' }}
                />
              ))}
            </div>

            <div className="relative grid lg:grid-cols-[1.1fr_1fr] gap-8 items-center p-8 md:p-14 lg:p-16">
              {/* Left — Copy */}
              <div>
                <div className="inline-flex items-center gap-2 rounded-full bg-brand-500/15 border border-brand-400/30 px-4 py-1.5 text-[10px] font-bold uppercase tracking-[0.3em] text-brand-300 mb-5">
                  <Sparkles className="h-3 w-3" />
                  {locale === 'es' ? 'Quiz IA · 60 segundos' : 'AI Quiz · 60 seconds'}
                </div>
                <h2 className="text-3xl md:text-5xl font-bold text-white tracking-tight leading-[1.05] mb-4">
                  {locale === 'es' ? (
                    <>
                      ¿No sabes por dónde <span className="bg-gradient-to-r from-brand-300 to-emerald-300 bg-clip-text text-transparent">empezar?</span>
                    </>
                  ) : (
                    <>
                      Not sure where to <span className="bg-gradient-to-r from-brand-300 to-emerald-300 bg-clip-text text-transparent">start?</span>
                    </>
                  )}
                </h2>
                <p className="text-slate-300 mb-8 text-base md:text-lg leading-relaxed">
                  {locale === 'es'
                    ? 'Nuestro asistente de investigación analiza tu área de estudio y vías objetivo — e identifica compuestos relevantes en 60 segundos.'
                    : 'Our research assistant analyzes your study area and target pathways — and identifies relevant compounds in 60 seconds.'}
                </p>
                <div className="flex flex-col sm:flex-row gap-3">
                  <Link to="/quiz">
                    <Button
                      size="lg"
                      className="btn-premium w-full sm:w-auto bg-gradient-to-r from-brand-500 to-brand-400 text-white hover:from-brand-400 hover:to-brand-300 rounded-full h-14 px-10 text-base font-bold shadow-2xl shadow-brand-500/40"
                    >
                      <Sparkles className="mr-2 h-5 w-5" />
                      {locale === 'es' ? 'Empieza ahora' : 'Start now'}
                      <ArrowRight className="ml-2 h-5 w-5" />
                    </Button>
                  </Link>
                  <Link to="/consulta">
                    <Button
                      size="lg"
                      className="btn-premium w-full sm:w-auto bg-white/10 backdrop-blur-md border-2 border-white/20 text-white hover:bg-white/20 rounded-full h-14 px-8 text-sm font-semibold"
                    >
                      {locale === 'es' ? 'Chat con asistente' : 'Chat with assistant'}
                    </Button>
                  </Link>
                </div>
              </div>

              {/* Right — Stats / reassurance */}
              <div className="grid grid-cols-2 gap-3">
                {[
                  { n: '2K+', l: locale === 'es' ? 'Investigadores' : 'Researchers' },
                  { n: '60s', l: locale === 'es' ? 'Quiz rápido' : 'Quick quiz' },
                  { n: '99%+', l: locale === 'es' ? 'Pureza' : 'Purity' },
                  { n: '24/7', l: locale === 'es' ? 'Soporte' : 'Support' },
                ].map((s, i) => (
                  <motion.div
                    key={s.l}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.1 * i, duration: 0.5 }}
                    className="rounded-2xl bg-white/5 backdrop-blur-md border border-white/10 p-5 text-center"
                  >
                    <p className="text-3xl md:text-4xl font-black text-white tracking-tight">{s.n}</p>
                    <p className="text-[10px] uppercase tracking-[0.25em] text-brand-300 mt-2 font-bold">{s.l}</p>
                  </motion.div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
