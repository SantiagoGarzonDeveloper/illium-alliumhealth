import { Sparkles, Package } from 'lucide-react';
import { type ShopFilter, shopFilterLabel } from '@/lib/catalogCategories';

/**
 * Los dos únicos filtros del catálogo (pedido del cliente, 29-sep):
 * «Shop All Peptides» y «Wholesale». Estilo de píldoras como la referencia.
 */
export function CategoryChips({
  value,
  onChange,
  locale,
  counts,
  className = '',
}: {
  value: ShopFilter;
  onChange: (v: ShopFilter) => void;
  locale: string;
  counts?: Partial<Record<ShopFilter, number>>;
  className?: string;
}) {
  const items: { key: ShopFilter; Icon: typeof Sparkles }[] = [
    { key: 'all', Icon: Sparkles },
    { key: 'wholesale', Icon: Package },
  ];
  return (
    <div className={`flex flex-wrap justify-center gap-3 ${className}`} role="tablist" aria-label={locale === 'es' ? 'Categorías' : 'Categories'}>
      {items.map(({ key, Icon }) => {
        const active = value === key;
        const n = counts?.[key];
        return (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={active}
            data-chip={key}
            onClick={() => onChange(key)}
            className={`inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold transition-all ${
              active
                ? 'bg-brand-700 text-white shadow-lg shadow-brand-700/30 ring-2 ring-brand-500/40'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <Icon className="h-4 w-4" />
            {shopFilterLabel(key, locale)}
            {typeof n === 'number' && (
              <span className={`ml-0.5 rounded-full px-2 py-0.5 text-[10px] ${active ? 'bg-white/20' : 'bg-white text-slate-500'}`}>{n}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
