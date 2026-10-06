import { useEffect, useRef, useState } from 'react';
import { useParams, Link, useNavigate, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAppStore, useToastStore } from '@/store';
import { Minus, Plus, ShieldCheck, ShoppingCart, Sparkles, Check, Truck, Lock, Award, ArrowLeft } from 'lucide-react';
import { useI18n } from '@/i18n/I18nContext';
import { getLocalizedProduct } from '@/lib/productLocale';
import { getEffectivePrice } from '@/lib/pricing';
import { findSiblingVariants, parseVariant } from '@/lib/productVariants';
import { isWholesale, productCategoryLabel } from '@/lib/catalogCategories';
import { CoaBatchSummary, CoaFullscreen, CoaPreview, CoaUnavailable } from '@/components/coa/CoaViewer';
import { displayImage } from '@/lib/productImage';
import { resolveProductCoa, sameCompoundProducts, useBatchCoa } from '@/lib/coa';
import { BUNDLE_TIERS, isBundleEligible, minQtyOf } from '@/lib/bundleOffer';
import type { Product } from '@/store';

export function ProductDetail() {
  const { t, locale } = useI18n();
  const { id } = useParams();
  const navigate = useNavigate();
  // La cantidad va ligada al producto: al cambiar de presentación arranca en su
  // compra mínima.
  const [qtyState, setQtyState] = useState<{ id?: string; q: number }>({ q: 1 });
  const addToCart = useAppStore((state) => state.addToCart);
  const products = useAppStore((state) => state.products);
  const cart = useAppStore((state) => state.cart);
  const showToast = useToastStore((s) => s.showToast);

  const product = products.find((p) => p.id === id);
  const minQty = minQtyOf(product);
  const quantity = qtyState.id === id ? qtyState.q : minQty;
  const setQuantity = (next: number | ((q: number) => number)) =>
    setQtyState({ id, q: typeof next === 'function' ? next(quantity) : next });

  if (!product) return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400">{t('product.notFound')}</div>;

  const lp = getLocalizedProduct(product, locale);
  const categoryDisplay = productCategoryLabel(product, locale);

  const stock = Number(product.stock) || 0;
  const inCartQty = cart.find((i) => i.product.id === product.id)?.quantity || 0;
  // Si no alcanza el stock para la compra mínima, se trata como agotado.
  const isOutOfStock = stock <= 0 || stock < minQty;
  /** Lo mínimo que se puede añadir ahora (si ya hay en el carrito, basta con 1). */
  const minAdd = Math.max(1, minQty - inCartQty);

  const handleAddToCart = () => {
    // Always validate live stock (incl. what's already in the cart) before adding.
    if (isOutOfStock) {
      showToast(locale === 'es' ? 'Producto agotado' : 'Out of stock');
      return;
    }
    if (quantity < minAdd) {
      showToast(
        locale === 'es'
          ? `La compra mínima de este producto es de ${minQty} unidades.`
          : `The minimum order for this product is ${minQty} units.`,
      );
      setQuantity(minAdd);
      return;
    }
    if (inCartQty + quantity > stock) {
      const left = Math.max(0, stock - inCartQty);
      showToast(
        locale === 'es'
          ? `Solo quedan ${stock} en stock${inCartQty ? ` (ya tienes ${inCartQty} en el carrito)` : ''}.`
          : `Only ${stock} in stock${inCartQty ? ` (you already have ${inCartQty} in the cart)` : ''}.`,
      );
      if (left > 0 && inCartQty + left >= minQty) {
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
    .filter((p) => isWholesale(p) === isWholesale(product) && p.id !== product.id && (Number(p.stock) || 0) > 0)
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
                  src={displayImage(product, products)}
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
                  onClick={() => setQuantity(Math.max(minAdd, quantity - 1))}
                  disabled={quantity <= minAdd}
                  aria-label={locale === 'es' ? 'Quitar uno' : 'Remove one'}
                  className="w-11 h-11 flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 transition-colors disabled:opacity-40 disabled:hover:bg-transparent"
                >
                  <Minus className="w-4 h-4" />
                </button>
                <div className="w-12 text-center font-semibold text-sm text-white">{quantity}</div>
                <button
                  type="button"
                  onClick={() => setQuantity((q) => (stock > 0 ? Math.min(stock, q + 1) : q))}
                  disabled={isOutOfStock || quantity >= stock}
                  aria-label={locale === 'es' ? 'Añadir uno' : 'Add one'}
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

            {minQty > 1 && (
              <p className="-mt-2 mb-4 text-xs font-semibold text-brand-300 flex items-center gap-1.5" data-min-qty={minQty}>
                <Check className="h-3.5 w-3.5" />
                {locale === 'es'
                  ? `Compra mínima: ${minQty} ${isWholesale(product) ? 'paquetes' : 'unidades'}${inCartQty ? ` · ya tienes ${inCartQty} en el carrito` : ''}`
                  : `Minimum order: ${minQty} ${isWholesale(product) ? 'packs' : 'units'}${inCartQty ? ` · ${inCartQty} already in your cart` : ''}`}
              </p>
            )}

            {isBundleEligible(product) && <BundleStrip locale={locale} />}

            {/* Security line */}
            <p className="text-xs text-slate-500 text-center mb-5 flex items-center justify-center gap-1.5">
              <Lock className="h-3 w-3" /> {locale === 'es' ? 'Pago seguro · Soporte 24/7' : 'Secure checkout · 24/7 support'}
            </p>

            {/* RESEARCH USE NOTICE — debajo de «Add to cart» (pedido del cliente, 29-sep) */}
            <ResearchUseNotice locale={locale} />

            {/* COA expandable section — muestra el COA real del producto */}
            <CoaSection key={product.id} locale={locale} productName={lp.name} product={product} products={products} />

            {/* Catálogo completo */}
            <div className="rounded-2xl bg-gradient-to-br from-brand-900/40 to-slate-900/50 border border-brand-700/30 p-6 mt-8">
              <h4 className="font-bold text-white mb-2 flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-brand-400" />
                {locale === 'es' ? 'Explora todo el catálogo' : 'Explore the full catalog'}
              </h4>
              <p className="text-sm text-slate-400 mb-4">
                {locale === 'es'
                  ? 'Todos nuestros compuestos de investigación, con pureza certificada por lote.'
                  : 'All our research compounds, with certified purity per batch.'}
              </p>
              <Link to="/shop">
                <Button className="w-full rounded-full border border-brand-500/30 bg-brand-500/10 text-brand-300 hover:bg-brand-500/20 h-10 text-sm font-semibold">
                  {locale === 'es' ? 'Ver catálogo' : 'View catalog'}
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
                        <img src={displayImage(p, products)} alt={rp.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
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

// ─── RESEARCH USE NOTICE ───
function ResearchUseNotice({ locale }: { locale: string }) {
  const es = locale === 'es';
  return (
    <div
      data-research-notice
      className="mb-4 flex gap-4 rounded-2xl border border-brand-700/50 border-l-4 border-l-brand-500 bg-gradient-to-br from-brand-950/80 to-slate-900/70 p-5"
    >
      <div className="h-10 w-10 shrink-0 rounded-xl bg-brand-500/15 ring-1 ring-brand-500/30 flex items-center justify-center">
        <span className="text-lg font-black text-brand-400 leading-none">i</span>
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-black uppercase tracking-[0.22em] text-brand-400 mb-1.5">
          {es ? 'Aviso de uso en investigación' : 'Research Use Notice'}
        </p>
        <p className="text-sm font-semibold text-white leading-snug">
          {es
            ? 'Todos los viales de péptidos vienen en polvo y no están reconstituidos.'
            : 'All peptide vials are in powder form and are not reconstituted.'}
        </p>
        <p className="text-sm text-slate-300 leading-relaxed mt-1">
          {es
            ? 'Ningún producto ni material vendido en este sitio es para consumo humano, y todos están sujetos a nuestros '
            : 'All products and materials sold on this site are not for human consumption and subject to our '}
          <Link to="/terms" className="font-semibold text-brand-300 underline underline-offset-2 hover:text-brand-200">
            {es ? 'Términos y Condiciones' : 'Terms and Conditions'}
          </Link>
          .
        </p>
        <Link
          to="/lab-results"
          className="inline-block mt-2.5 text-sm font-bold text-brand-300 underline underline-offset-2 hover:text-brand-200"
        >
          {es ? 'Ver nuestra biblioteca de COA' : 'View Our COA Library'}
        </Link>
      </div>
    </div>
  );
}

// ─── COA expandable section ───
function CoaSection({ locale, productName, product, products }: { locale: string; productName: string; product: Product; products: Product[] }) {
  const location = useLocation();
  const wantsCoa = location.hash === '#coa';
  // COA subido en Admin → Productos (o el de su caja / frasco gemelo) y, si no,
  // el certificado del último lote registrado con los QR (Admin → Autenticidad).
  const uploadedCoa = resolveProductCoa(product, products);
  const batch = useBatchCoa(sameCompoundProducts(product, products).map((p) => p.id));
  const coaUrl = uploadedCoa || batch?.coaUrl || undefined;
  const [open, setOpen] = useState(true);
  const [full, setFull] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const es = locale === 'es';

  // Desde «Ver compuesto →» / «Ver COA» de /lab-results se llega con #coa:
  // se abre el acordeón y se baja hasta él (después del ScrollToTop).
  useEffect(() => {
    if (!wantsCoa) return;
    const id = window.setTimeout(() => ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 350);
    return () => window.clearTimeout(id);
  }, [wantsCoa]);

  return (
    <div className="mt-4 scroll-mt-24" id="coa" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        data-coa-toggle
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
          {coaUrl && <CoaPreview url={coaUrl} productName={productName} locale={locale} onExpand={() => setFull(true)} />}
          {batch && <CoaBatchSummary batch={batch} locale={locale} />}
          {!coaUrl && !batch && <CoaUnavailable productName={productName} locale={locale} />}

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
        </div>
      )}
      {full && coaUrl && (
        <CoaFullscreen url={coaUrl} productName={productName} locale={locale} onClose={() => setFull(false)} />
      )}
    </div>
  );
}

// ─── Oferta por cantidad (combo) — recordatorio en la ficha ───
function BundleStrip({ locale }: { locale: string }) {
  const es = locale === 'es';
  return (
    <Link
      to="/#bundle"
      className="mb-5 grid grid-cols-3 gap-2 rounded-2xl border border-brand-500/30 bg-brand-500/10 p-2 hover:border-brand-400/60 transition-colors"
      data-bundle-strip
    >
      {[...BUNDLE_TIERS].reverse().map((t) => (
        <div key={t.units} className="rounded-xl bg-slate-950/50 px-2 py-2 text-center">
          <p className="text-sm font-black text-brand-300 leading-tight">
            {t.percent >= 100 ? (es ? 'GRATIS' : 'FREE') : `${t.percent}% OFF`}
          </p>
          <p className="text-[10px] font-semibold text-slate-300 leading-tight mt-0.5">
            {es ? `Compra ${t.units - 1} · el ${t.units}.º` : `Buy ${t.units - 1} · ${t.units}${t.units === 3 ? 'rd' : 'th'} peptide`}
          </p>
        </div>
      ))}
    </Link>
  );
}
