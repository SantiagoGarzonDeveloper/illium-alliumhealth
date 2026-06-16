import { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAppStore, useToastStore } from '@/store';
import { Minus, Plus, ShieldCheck, ShoppingCart, Sparkles, Check, Truck, Lock, Award, ArrowLeft } from 'lucide-react';
import { useI18n } from '@/i18n/I18nContext';
import { getLocalizedProduct } from '@/lib/productLocale';
import { getEffectivePrice } from '@/lib/pricing';
import { findSiblingVariants, parseVariant } from '@/lib/productVariants';

export function ProductDetail() {
  const { t, locale } = useI18n();
  const { id } = useParams();
  const navigate = useNavigate();
  const [quantity, setQuantity] = useState(1);
  const addToCart = useAppStore((state) => state.addToCart);
  const products = useAppStore((state) => state.products);
  const cart = useAppStore((state) => state.cart);
  const showToast = useToastStore((s) => s.showToast);

  const product = products.find((p) => p.id === id);

  if (!product) return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400">{t('product.notFound')}</div>;

  const lp = getLocalizedProduct(product, locale);
  const catKey = `shop.cat.${product.category.toLowerCase()}`;
  const catTr = t(catKey);
  const categoryDisplay = locale === 'es' && catTr !== catKey ? catTr : product.category;

  const stock = Number(product.stock) || 0;
  const inCartQty = cart.find((i) => i.product.id === product.id)?.quantity || 0;
  const isOutOfStock = stock <= 0;

  const handleAddToCart = () => {
    // Always validate live stock (incl. what's already in the cart) before adding.
    if (isOutOfStock) {
      showToast(locale === 'es' ? 'Producto agotado' : 'Out of stock');
      return;
    }
    if (inCartQty + quantity > stock) {
      const left = Math.max(0, stock - inCartQty);
      showToast(
        locale === 'es'
          ? `Solo quedan ${stock} en stock${inCartQty ? ` (ya tienes ${inCartQty} en el carrito)` : ''}.`
          : `Only ${stock} in stock${inCartQty ? ` (you already have ${inCartQty} in the cart)` : ''}.`,
      );
      if (left > 0) {
        addToCart(product, left);
      }
      return;
    }
    addToCart(product, quantity);
    const msg =
      quantity > 1
        ? t('product.addedMulti').replace('{qty}', String(quantity)).replace('{name}', lp.name)
        : t('product.addedOne').replace('{name}', lp.name);
    showToast(msg);
  };

  const eff = getEffectivePrice(product);
  const siblings = findSiblingVariants(product, products);
  const currentVariantLabel = parseVariant(product.name).variantLabel;
  const total = (eff.finalPrice * quantity).toFixed(2);

  const relatedProducts = products
    .filter((p) => p.category === product.category && p.id !== product.id)
    .slice(0, 4);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
      {/* Breadcrumb + prominent back button */}
      <div className="container mx-auto px-4 pt-6">
        <div className="flex flex-wrap items-center gap-3 mb-6">
          <Link
            to="/shop"
            className="inline-flex items-center gap-2 rounded-full bg-brand-500/15 hover:bg-brand-500/25 border-2 border-brand-400/60 hover:border-brand-300 px-4 py-2 text-sm font-bold text-brand-300 hover:text-brand-200 transition-all shadow-lg shadow-brand-500/10"
          >
            <ArrowLeft className="h-4 w-4" />
            {locale === 'es' ? 'Volver a la tienda' : 'Back to shop'}
          </Link>
          <nav className="text-xs sm:text-sm text-slate-400 flex flex-wrap items-center gap-1.5">
            <Link to="/" className="text-brand-400 hover:text-brand-300 font-semibold">
              {locale === 'es' ? 'Inicio' : 'Home'}
            </Link>
            <span className="text-slate-600">/</span>
            <Link to="/shop" className="text-brand-400 hover:text-brand-300 font-semibold">
              {locale === 'es' ? 'Tienda' : 'Shop'}
            </Link>
            <span className="text-slate-600">/</span>
            <span className="text-slate-200 font-semibold truncate max-w-[12rem] sm:max-w-none">{lp.name}</span>
          </nav>
        </div>
      </div>

      <div className="container mx-auto px-4 pb-16 md:pb-24">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-14">
          {/* Image */}
          <div className="relative">
            <div className="sticky top-24 rounded-3xl overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-black border border-slate-800 shadow-2xl shadow-brand-900/20">
              <div className="relative aspect-square overflow-hidden">
                <img
                  src={product.img}
                  alt={lp.name}
                  className="w-full h-full object-cover"
                />
                {/* subtle overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent pointer-events-none" />
                {/* Brand watermark */}
                <div className="absolute top-5 left-5">
                  <span className="inline-flex items-center rounded-full bg-white/10 backdrop-blur-md text-white text-[10px] font-bold tracking-[0.25em] px-3 py-1.5 ring-1 ring-white/20">
                    ILLIUM
                  </span>
                </div>
              </div>
              {/* Trust badges strip */}
              <div className="grid grid-cols-3 border-t border-slate-800">
                <div className="flex flex-col items-center gap-1 p-4 border-r border-slate-800">
                  <ShieldCheck className="h-4 w-4 text-brand-400" />
                  <p className="text-[10px] text-slate-400 text-center">{locale === 'es' ? '99%+ Puro' : '99%+ Pure'}</p>
                </div>
                <div className="flex flex-col items-center gap-1 p-4 border-r border-slate-800">
                  <Award className="h-4 w-4 text-brand-400" />
                  <p className="text-[10px] text-slate-400 text-center">{locale === 'es' ? 'HPLC & MS' : 'HPLC & MS'}</p>
                </div>
                <div className="flex flex-col items-center gap-1 p-4">
                  <Truck className="h-4 w-4 text-brand-400" />
                  <p className="text-[10px] text-slate-400 text-center">{locale === 'es' ? 'Envío seguro' : 'Secure Ship'}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Info */}
          <div className="flex flex-col py-2 text-white">
            <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-brand-400 mb-2">
              ILLIUM · {categoryDisplay}
            </p>
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">{lp.name}</h1>

            <div className="flex items-baseline gap-3 mb-6">
              <span className="text-4xl font-bold">${eff.finalPrice.toFixed(2)}</span>
              {eff.hasDiscount && (
                <>
                  <span className="text-lg text-slate-500 line-through">${eff.originalPrice.toFixed(2)}</span>
                  <span className="inline-flex items-center rounded-full bg-emerald-500/15 text-emerald-400 text-xs font-bold px-2.5 py-1 ring-1 ring-emerald-500/30">
                    -{eff.percentOff}%
                  </span>
                </>
              )}
            </div>

            {(siblings.length > 0 || currentVariantLabel) && (
              <div className="mb-6">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 mb-2">
                  {locale === 'es' ? 'Presentación' : 'Size'}
                </p>
                <div className="flex flex-wrap gap-2">
                  {currentVariantLabel && (
                    <button
                      type="button"
                      className="rounded-xl px-4 py-2 text-sm font-bold ring-2 ring-brand-400 bg-brand-500/20 text-white"
                    >
                      {currentVariantLabel}
                    </button>
                  )}
                  {siblings.map((s) => (
                    <button
                      key={s.product.id}
                      type="button"
                      onClick={() => navigate(`/product/${s.product.id}`)}
                      className="rounded-xl px-4 py-2 text-sm font-bold ring-1 ring-slate-700 bg-slate-800/50 text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <p className="text-slate-400 mb-5 leading-relaxed text-base">{lp.description}</p>

            {/* Trust bar near price */}
            <div className="mb-8 flex flex-wrap gap-x-4 gap-y-2 text-[11px] text-slate-300 font-semibold">
              <span className="flex items-center gap-1.5">
                <span className="text-base">🇺🇸</span> Manufactured in the U.S.
              </span>
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5 text-brand-400" /> Double Lab Tested
              </span>
              <span className="flex items-center gap-1.5">
                <Check className="h-3.5 w-3.5 text-brand-400" /> 99%+ Purity
              </span>
              <span className="flex items-center gap-1.5">
                <Award className="h-3.5 w-3.5 text-brand-400" /> Batch COA Available
              </span>
            </div>

            {/* Benefits */}
            {lp.benefits && lp.benefits.length > 0 && (
              <div className="mb-8 rounded-2xl bg-gradient-to-br from-slate-900/50 to-slate-800/30 border border-slate-800 p-5">
                <h3 className="font-bold text-white mb-4 flex items-center gap-2 text-sm uppercase tracking-[0.2em]">
                  <ShieldCheck className="w-4 h-4 text-brand-400" />
                  {t('product.keyBenefits')}
                </h3>
                <ul className="space-y-3">
                  {lp.benefits.map((benefit, i) => (
                    <li key={i} className="flex items-start gap-3 text-slate-300 text-sm">
                      <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-500/15 ring-1 ring-brand-500/30">
                        <Check className="w-3 h-3 text-brand-400" />
                      </div>
                      <span className="flex-1">{benefit}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Quantity + Add to Cart */}
            <div className="flex items-center gap-3 mb-5">
              <div className="flex items-center rounded-full bg-slate-900/60 border border-slate-700 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  className="w-11 h-11 flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                >
                  <Minus className="w-4 h-4" />
                </button>
                <div className="w-12 text-center font-semibold text-sm text-white">{quantity}</div>
                <button
                  type="button"
                  onClick={() => setQuantity((q) => (stock > 0 ? Math.min(stock, q + 1) : q))}
                  disabled={isOutOfStock || quantity >= stock}
                  className="w-11 h-11 flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 transition-colors disabled:opacity-40 disabled:hover:bg-transparent"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
              <Button
                size="lg"
                disabled={isOutOfStock}
                className="btn-premium flex-1 bg-gradient-to-r from-brand-500 to-brand-400 text-white hover:from-brand-400 hover:to-brand-300 rounded-full h-12 text-sm font-bold shadow-xl shadow-brand-500/40 disabled:opacity-50 disabled:cursor-not-allowed disabled:from-slate-600 disabled:to-slate-600"
                onClick={handleAddToCart}
              >
                <ShoppingCart className="mr-2 h-4 w-4" />
                {isOutOfStock
                  ? (locale === 'es' ? 'Agotado' : 'Out of stock')
                  : `${locale === 'es' ? 'Añadir al carrito' : 'Add to Cart'} · $${total}`}
              </Button>
            </div>

            {/* Security line */}
            <p className="text-xs text-slate-500 text-center mb-6 flex items-center justify-center gap-1.5">
              <Lock className="h-3 w-3" /> {locale === 'es' ? 'Pago seguro · Soporte 24/7' : 'Secure checkout · 24/7 support'}
            </p>

            {/* COA expandable section */}
            <CoaSection locale={locale} productName={lp.name} />

            {/* Quiz CTA */}
            <div className="rounded-2xl bg-gradient-to-br from-brand-900/40 to-slate-900/50 border border-brand-700/30 p-6 mt-8">
              <h4 className="font-bold text-white mb-2 flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-brand-400" />
                {t('product.unsureTitle')}
              </h4>
              <p className="text-sm text-slate-400 mb-4">{t('product.unsureBody')}</p>
              <Link to="/quiz">
                <Button className="w-full rounded-full border border-brand-500/30 bg-brand-500/10 text-brand-300 hover:bg-brand-500/20 h-10 text-sm font-semibold">
                  {t('product.startQuiz')}
                </Button>
              </Link>
            </div>
          </div>
        </div>

        {/* Related products */}
        {relatedProducts.length > 0 && (
          <div className="mt-20">
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-8 tracking-tight">
              {locale === 'es' ? 'Productos relacionados' : 'Related products'}
            </h2>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {relatedProducts.map((p) => {
                const rp = getLocalizedProduct(p, locale);
                const rEff = getEffectivePrice(p);
                return (
                  <Link key={p.id} to={`/product/${p.id}`} className="group block">
                    <div className="overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 to-black border border-slate-800 hover:border-brand-700/50 transition-all duration-300 hover:-translate-y-1">
                      <div className="relative aspect-[4/5] overflow-hidden bg-black">
                        <img src={p.img} alt={rp.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                        {rEff.hasDiscount && (
                          <div className="absolute top-2 left-2 inline-flex items-center rounded-full bg-emerald-500 text-white text-[10px] font-bold px-2 py-0.5">
                            -{rEff.percentOff}%
                          </div>
                        )}
                      </div>
                      <div className="p-4">
                        <p className="text-[10px] uppercase tracking-[0.2em] text-brand-400 font-bold mb-1">ILLIUM</p>
                        <h3 className="text-sm font-bold text-white truncate">{rp.name}</h3>
                        <p className="text-sm font-bold text-white mt-2">
                          ${rEff.finalPrice.toFixed(0)}
                          {rEff.hasDiscount && (
                            <span className="ml-2 text-xs font-normal text-slate-500 line-through">${rEff.originalPrice.toFixed(0)}</span>
                          )}
                        </p>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── COA expandable section ───
function CoaSection({ locale, productName }: { locale: string; productName: string }) {
  const [open, setOpen] = useState(false);
  const es = locale === 'es';
  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between gap-2 rounded-xl border border-slate-700 bg-slate-900/60 hover:bg-slate-800 text-slate-300 hover:text-white px-4 py-3 text-sm font-semibold transition-colors"
      >
        <span className="flex items-center gap-2">
          <Award className="h-4 w-4 text-brand-400" />
          {es ? 'Certificado de Análisis (COA)' : 'Certificate of Analysis (COA)'}
        </span>
        <svg className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
      </button>
      {open && (
        <div className="mt-3 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800 border border-slate-700 p-5 animate-slide-down space-y-4">
          <div className="flex items-start gap-3">
            <div className="h-12 w-12 rounded-xl bg-brand-500/15 flex items-center justify-center shrink-0">
              <ShieldCheck className="h-6 w-6 text-brand-400" />
            </div>
            <div>
              <h4 className="font-bold text-white text-sm mb-1">
                {es ? 'Pruebas de laboratorio independientes' : 'Independent Laboratory Testing'}
              </h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                {es
                  ? `Cada lote de ${productName} es analizado por laboratorios externos independientes utilizando HPLC (cromatografía líquida de alta resolución) y espectrometría de masas (MS) para confirmar la identidad, pureza y concentración del compuesto.`
                  : `Every batch of ${productName} is analyzed by independent third-party laboratories using HPLC (high-performance liquid chromatography) and mass spectrometry (MS) to confirm compound identity, purity, and concentration.`}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl bg-slate-950/60 border border-slate-700 p-3 text-center">
              <p className="text-2xl font-black text-brand-400">99%+</p>
              <p className="text-[10px] text-slate-400 mt-1 uppercase tracking-wider font-bold">{es ? 'Pureza' : 'Purity'}</p>
            </div>
            <div className="rounded-xl bg-slate-950/60 border border-slate-700 p-3 text-center">
              <p className="text-2xl font-black text-white">HPLC</p>
              <p className="text-[10px] text-slate-400 mt-1 uppercase tracking-wider font-bold">{es ? 'Método 1' : 'Method 1'}</p>
            </div>
            <div className="rounded-xl bg-slate-950/60 border border-slate-700 p-3 text-center">
              <p className="text-2xl font-black text-white">MS</p>
              <p className="text-[10px] text-slate-400 mt-1 uppercase tracking-wider font-bold">{es ? 'Método 2' : 'Method 2'}</p>
            </div>
          </div>

          <div className="rounded-xl bg-brand-500/10 border border-brand-500/30 p-4">
            <p className="text-xs text-brand-200 leading-relaxed">
              <span className="font-bold text-brand-300">
                {es ? '📋 Solicita tu COA: ' : '📋 Request your COA: '}
              </span>
              {es
                ? 'El Certificado de Análisis completo de este lote está disponible bajo solicitud. Contáctanos por WhatsApp o correo y te lo enviamos en formato PDF.'
                : 'The full Certificate of Analysis for this batch is available on request. Contact us via WhatsApp or email and we will send it to you in PDF format.'}
            </p>
          </div>

          <a
            href="/contact"
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white py-2.5 text-xs font-bold transition-colors"
          >
            {es ? 'Solicitar COA' : 'Request COA'}
          </a>
        </div>
      )}
    </div>
  );
}
