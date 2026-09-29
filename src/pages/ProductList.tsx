import { Button } from '@/components/ui/button';
import { Link, useSearchParams } from 'react-router-dom';
import { useAppStore } from '@/store';
import { useI18n } from '@/i18n/I18nContext';
import { getLocalizedProduct } from '@/lib/productLocale';
import { getEffectivePrice } from '@/lib/pricing';
import { groupProductVariants } from '@/lib/productVariants';
import { ArrowRight } from 'lucide-react';
import { CategoryChips } from '@/components/shop/CategoryChips';
import { filterByShopFilter, productCategoryLabel, shopFilterFromParam, shopFilterLabel, type ShopFilter } from '@/lib/catalogCategories';
import { displayImage } from '@/lib/productImage';

export function ProductList() {
  const { t, locale } = useI18n();
  const [searchParams, setSearchParams] = useSearchParams();
  // Solo dos filtros: «Shop All Peptides» y «Wholesale». Slugs viejos → todos.
  const filter = shopFilterFromParam(searchParams.get('category'));
  const products = useAppStore((state) => state.products);

  // Hide out-of-stock products from the storefront entirely (incl. per-variant).
  const inStock = products.filter((p) => (Number(p.stock) || 0) > 0);
  const filtered = filterByShopFilter(inStock, filter);
  const groups = groupProductVariants(filtered);
  const counts = {
    all: groupProductVariants(filterByShopFilter(inStock, 'all')).length,
    wholesale: groupProductVariants(filterByShopFilter(inStock, 'wholesale')).length,
  };
  const setFilter = (f: ShopFilter) => {
    setSearchParams(f === 'wholesale' ? { category: 'wholesale' } : {}, { replace: false });
  };

  const title = shopFilterLabel(filter, locale);
  const es = locale === 'es';

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <div className="bg-slate-50 border-b border-slate-100">
        <div className="container mx-auto px-4 py-10 md:py-14">
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-slate-900">{title}</h1>
          <p className="mt-2 text-slate-500 text-sm">
            {filter === 'wholesale'
              ? (es ? 'Péptidos al por mayor — compra por volumen y ahorra.' : 'Wholesale peptides — buy in bulk and save.')
              : (es ? 'Compuestos de investigación · pureza 99%+ · COA por lote' : 'Research compounds · 99%+ purity · COA per batch')}
            {' · '}
            {groups.length} {es ? 'productos' : 'products'}
          </p>
          <CategoryChips value={filter} onChange={setFilter} locale={locale} counts={counts} className="mt-6 !justify-start" />
        </div>
      </div>

      <div className="container mx-auto px-4 py-10">
        {groups.length === 0 && (
          <div className="max-w-xl mx-auto text-center rounded-3xl border border-slate-200 bg-slate-50 p-10">
            <p className="text-lg font-bold text-slate-900 mb-2">
              {filter === 'wholesale'
                ? (es ? 'Muy pronto: productos al por mayor' : 'Wholesale products coming soon')
                : (es ? 'No hay productos disponibles ahora mismo' : 'No products available right now')}
            </p>
            <p className="text-sm text-slate-500 mb-5">
              {es
                ? 'Para pedidos por volumen escríbenos y te enviamos una cotización.'
                : 'For bulk orders, contact us and we will send you a quote.'}
            </p>
            <Link to="/contact" className="inline-flex items-center gap-2 rounded-full bg-brand-700 text-white px-6 py-2.5 text-sm font-bold hover:bg-brand-600">
              {es ? 'Contactar' : 'Contact us'} <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {groups.map((group) => {
            const product = group.representative;
            const hasMultipleVariants = group.variants.length > 1;
            const lp = getLocalizedProduct(product, locale);
            const catLabel = productCategoryLabel(product, locale);
            const eff = getEffectivePrice(product);
            return (
              <Link key={`${group.category}-${group.baseName}`} to={`/product/${product.id}`} className="group block">
                <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-slate-800 to-black p-3 transition-all duration-500 hover:-translate-y-2 hover:shadow-2xl hover:shadow-brand-600/25">
                  {/* Image */}
                  <div className="relative aspect-[4/5] overflow-hidden rounded-2xl bg-gradient-to-b from-slate-800/50 to-black">
                    <img
                      src={displayImage(product, products)}
                      alt={lp.name}
                      className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700 ease-out"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                    {eff.hasDiscount && (
                      <div className="absolute top-3 left-3 inline-flex items-center rounded-full bg-emerald-500 text-white text-[10px] font-bold tracking-wider px-2.5 py-1 shadow-lg">
                        -{eff.percentOff}%
                      </div>
                    )}
                  </div>
                  {/* Info */}
                  <div className="px-3 pt-5 pb-3">
                    <div className="text-[10px] text-brand-400 mb-2 font-bold tracking-[0.2em] uppercase">
                      ILLIUM · {catLabel}
                    </div>
                    <h3 className="font-bold text-white mb-2 line-clamp-1 text-lg tracking-tight">
                      {hasMultipleVariants ? group.baseName : lp.name}
                    </h3>
                    {hasMultipleVariants && (
                      <div className="flex flex-wrap gap-1.5 mb-3">
                        {group.variants.map((v) => (
                          <span key={v.product.id} className="inline-flex items-center rounded-full bg-brand-500/15 text-brand-300 text-[10px] font-bold tracking-wider px-2 py-0.5 ring-1 ring-brand-400/30">
                            {v.label}
                          </span>
                        ))}
                        <span className="text-[10px] text-slate-500 self-center font-semibold">
                          {locale === 'es' ? `${group.variants.length} presentaciones` : `${group.variants.length} sizes`}
                        </span>
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <div className="flex items-baseline gap-2">
                        <span className="font-bold text-xl text-white">${eff.finalPrice.toFixed(0)}</span>
                        {eff.hasDiscount && (
                          <span className="text-sm text-slate-500 line-through">${eff.originalPrice.toFixed(0)}</span>
                        )}
                      </div>
                      <Button className="rounded-full bg-brand-600 text-white hover:bg-brand-500 h-9 px-5 text-xs font-semibold shadow-lg shadow-brand-700/25">
                        {t('shop.view')} <ArrowRight className="ml-1.5 h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
