import { Link } from 'react-router-dom';
import { useI18n } from '@/i18n/I18nContext';

export function Footer() {
  const { t, locale } = useI18n();
  const es = locale === 'es';
  return (
    <footer className="bg-slate-950 text-slate-400">
      {/* Main footer */}
      <div className="container mx-auto px-4 py-16">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10 lg:gap-8">
          {/* Brand */}
          <div className="sm:col-span-2 lg:col-span-1">
            <Link to="/" className="flex items-center text-white mb-5 group">
              <img src="/illium-logo-dark.png" alt="ILLIUM" className="h-12 w-auto" />
            </Link>
            <p className="text-sm leading-relaxed text-slate-500 max-w-xs">{t('footer.tagline')}</p>
          </div>

          {/* Shop */}
          <div>
            <h4 className="text-white font-bold text-base uppercase tracking-[0.2em] mb-5">{t('footer.shop')}</h4>
            <ul className="space-y-3 text-sm">
              <li>
                <Link to="/shop" className="hover:text-white transition-colors duration-200">
                  {t('footer.allProducts')}
                </Link>
              </li>
              <li>
                <Link to="/shop?category=peptides" className="hover:text-white transition-colors duration-200">
                  {t('footer.peptides')}
                </Link>
              </li>
              <li>
                <Link to="/shop?category=nad" className="hover:text-white transition-colors duration-200">
                  {t('footer.nadTherapy')}
                </Link>
              </li>
              <li>
                <Link to="/shop?category=blends" className="hover:text-white transition-colors duration-200">
                  {t('footer.customBlends')}
                </Link>
              </li>
            </ul>
          </div>

          {/* Support */}
          <div>
            <h4 className="text-white font-bold text-base uppercase tracking-[0.2em] mb-5">{t('footer.support')}</h4>
            <ul className="space-y-3 text-sm">
              <li>
                <Link to="/faq" className="hover:text-white transition-colors duration-200">
                  {t('footer.faq')}
                </Link>
              </li>
              <li>
                <Link to="/shipping" className="hover:text-white transition-colors duration-200">
                  {t('footer.shipping')}
                </Link>
              </li>
              <li>
                <Link to="/contact" className="hover:text-white transition-colors duration-200">
                  {t('footer.contact')}
                </Link>
              </li>
              <li>
                <Link to="/quiz" className="hover:text-white transition-colors duration-200">
                  {t('footer.protocolFinder')}
                </Link>
              </li>
              <li>
                <Link to="/docs" className="hover:text-white transition-colors duration-200">
                  Docs
                </Link>
              </li>
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h4 className="text-white font-bold text-base uppercase tracking-[0.2em] mb-5">{t('footer.legal')}</h4>
            <ul className="space-y-3 text-sm">
              <li className="text-slate-500">{t('footer.researchOnly')}</li>
              <li className="text-slate-500">{t('footer.notHuman')}</li>
              <li className="pt-2">
                <Link to="/terms" className="hover:text-white transition-colors duration-200">
                  {t('footer.terms')}
                </Link>
              </li>
              <li>
                <Link to="/terms-of-sale" className="hover:text-white transition-colors duration-200">
                  {es ? 'Condiciones de venta' : 'Terms of Sale'}
                </Link>
              </li>
              <li>
                <Link to="/lab-results" className="hover:text-white transition-colors duration-200">
                  {es ? 'Certificados de análisis (CoA)' : 'Certificates of Analysis (CoA)'}
                </Link>
              </li>
              <li>
                <Link to="/privacy" className="hover:text-white transition-colors duration-200">
                  {t('footer.privacy')}
                </Link>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Legal disclaimer — research use only (shown site-wide via the footer) */}
      <div className="border-t border-slate-800/60 bg-black/40">
        <div className="container mx-auto px-4 py-6 text-center text-[11px] leading-relaxed text-slate-500 max-w-4xl space-y-2">
          <p className="font-bold uppercase tracking-wider text-slate-400">
            {es
              ? 'SOLO PARA USO DE INVESTIGACIÓN — NO PARA CONSUMO HUMANO O ANIMAL'
              : 'RESEARCH USE ONLY — NOT FOR HUMAN OR ANIMAL CONSUMPTION'}
          </p>
          <p>
            {es
              ? 'Todos los productos vendidos por ILLIUM están destinados exclusivamente a investigación de laboratorio in vitro y estudio científico por parte de investigadores calificados y profesionales con licencia. Estos compuestos no están aprobados por la FDA ni por ninguna autoridad regulatoria para uso humano o veterinario, y no son suplementos dietéticos, medicamentos ni dispositivos médicos. ILLIUM no hace ninguna afirmación sobre uso terapéutico, diagnóstico o preventivo en humanos o animales. Al comprar en este sitio, confirmas que eres un investigador o científico con licencia y que usarás estos compuestos únicamente con fines de investigación lícitos. Debes tener 21 años o más para comprar. ILLIUM no asume responsabilidad alguna por el mal uso de cualquier producto.'
              : 'All products sold by ILLIUM are intended exclusively for in vitro laboratory research and scientific study by qualified researchers and licensed professionals. These compounds are not approved by the FDA or any regulatory authority for human or veterinary use, and are not dietary supplements, drugs, or medical devices. ILLIUM makes no claims regarding therapeutic, diagnostic, or preventive use in humans or animals. By purchasing from this site, you confirm that you are a licensed researcher or scientist and that you will use these compounds solely for lawful research purposes. You must be 21 years of age or older to purchase. ILLIUM assumes no liability for misuse of any product.'}
          </p>
        </div>
      </div>

      {/* Payment methods strip */}
      <div className="border-t border-slate-800/50">
        <div className="container mx-auto px-4 py-6 flex flex-wrap items-center justify-center gap-4 md:gap-6">
          {[
            { name: 'Visa', bg: '#1a1f71', color: '#ffffff' },
            { name: 'MC', bg: '#eb001b', color: '#ffffff', full: 'Mastercard' },
            { name: 'AMEX', bg: '#006fcf', color: '#ffffff' },
            { name: 'Apple Pay', bg: '#000000', color: '#ffffff' },
            { name: 'G Pay', bg: '#ffffff', color: '#1a1f71' },
            { name: 'Shop Pay', bg: '#5a31f4', color: '#ffffff' },
            { name: 'Zelle', bg: '#6d1ed4', color: '#ffffff' },
          ].map((p) => (
            <div
              key={p.name}
              className="inline-flex items-center justify-center rounded-md px-3 py-1.5 text-[10px] font-black tracking-wider"
              style={{ background: p.bg, color: p.color, minWidth: '56px', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.15)' }}
              title={p.full || p.name}
            >
              {p.name.toUpperCase()}
            </div>
          ))}
        </div>
      </div>

      {/* Bottom bar */}
      <div className="border-t border-slate-800/50">
        <div className="container mx-auto px-4 py-6 flex flex-col sm:flex-row justify-between items-center gap-3 text-xs text-slate-600">
          <p>&copy; {new Date().getFullYear()} ILLIUM. {t('footer.copyright')}</p>
          <p>{t('footer.qualityLine')}</p>
        </div>
      </div>
    </footer>
  );
}
