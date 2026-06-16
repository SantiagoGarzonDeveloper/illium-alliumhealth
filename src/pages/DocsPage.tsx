import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BookOpen,
  Video,
  PlayCircle,
  Download,
  CheckCircle2,
  Clock,
  Sparkles,
  Users,
  Crown,
  ShoppingBag,
  Package,
  Wallet,
  Settings,
  MessageSquare,
  GitBranch,
  DollarSign,
  Bell,
  Image as ImageIcon,
  Globe,
  Shield,
  CreditCard,
  AlertTriangle,
  Rocket,
  Zap,
  FileText,
  Code,
} from 'lucide-react';
import { useI18n } from '@/i18n/I18nContext';

const TUTORIAL_ES = 'https://storage.googleapis.com/monaco-community.firebasestorage.app/tutorials/illium-tutorial-es.mp4';
const TUTORIAL_EN = 'https://storage.googleapis.com/monaco-community.firebasestorage.app/tutorials/illium-tutorial-en.mp4';

function Section({
  id,
  icon: Icon,
  title,
  children,
}: {
  id: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24 rounded-3xl border border-slate-200 bg-white shadow-sm p-6 md:p-8">
      <div className="flex items-start gap-4 mb-5 pb-4 border-b border-slate-100">
        <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center shrink-0">
          <Icon className="h-5 w-5 text-white" />
        </div>
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-slate-900 tracking-tight">{title}</h2>
          <p className="text-[11px] font-mono text-slate-400 mt-0.5">#{id}</p>
        </div>
      </div>
      <div className="prose prose-slate max-w-none text-slate-700 leading-relaxed [&_a]:text-brand-700 [&_a]:font-semibold [&_a:hover]:text-brand-900 [&_strong]:text-slate-900 [&_h3]:text-slate-900 [&_h3]:font-bold [&_h3]:text-base [&_h3]:mt-5 [&_h3]:mb-2 [&_code]:bg-slate-100 [&_code]:text-slate-800 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-xs [&_ul]:space-y-1.5 [&_ol]:space-y-1.5">
        {children}
      </div>
    </section>
  );
}

function VideoCard({ lang, url, duration }: { lang: 'es' | 'en'; url: string; duration: string }) {
  const es = lang === 'es';
  return (
    <div className="rounded-2xl overflow-hidden bg-gradient-to-br from-slate-900 to-black border border-slate-800">
      <div className="relative aspect-video bg-black">
        <video src={url} controls preload="metadata" className="absolute inset-0 w-full h-full" poster="/illium-logo-dark.png" />
      </div>
      <div className="p-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-brand-400 font-bold mb-1">
            {es ? '🇪🇸 Español' : '🇺🇸 English'}
          </p>
          <p className="text-sm text-white font-semibold">ILLIUM Admin Tutorial</p>
          <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
            <Clock className="h-3 w-3" /> {duration} · 5 {es ? 'capítulos' : 'chapters'}
          </p>
        </div>
        <a
          href={url}
          download
          className="inline-flex items-center gap-1.5 rounded-full bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold px-4 py-2 transition"
        >
          <Download className="h-3.5 w-3.5" />
          MP4
        </a>
      </div>
    </div>
  );
}

const TOC_ITEMS = [
  { id: 'overview', icon: Sparkles, es: 'Descripción general', en: 'Overview' },
  { id: 'videos', icon: Video, es: 'Video tutoriales', en: 'Video tutorials' },
  { id: 'features', icon: CheckCircle2, es: 'Funcionalidades', en: 'Features' },
  { id: 'roles', icon: Users, es: 'Roles de usuario', en: 'User roles' },
  { id: 'commissions', icon: DollarSign, es: 'Comisiones', en: 'Commissions' },
  { id: 'whatsapp', icon: Bell, es: 'Notificaciones', en: 'Notifications' },
  { id: 'payments', icon: CreditCard, es: 'Pagos (pendiente)', en: 'Payments (pending)' },
  { id: 'admin', icon: Settings, es: 'Panel admin', en: 'Admin panel' },
  { id: 'stack', icon: Code, es: 'Stack técnico', en: 'Tech stack' },
  { id: 'roadmap', icon: Rocket, es: 'Roadmap', en: 'Roadmap' },
];

export function DocsPage() {
  const { locale } = useI18n();
  const es = locale === 'es';
  const [search, setSearch] = useState('');

  const filtered = search.trim()
    ? TOC_ITEMS.filter((i) => (es ? i.es : i.en).toLowerCase().includes(search.toLowerCase()))
    : TOC_ITEMS;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Hero */}
      <div className="bg-gradient-to-br from-slate-950 via-brand-900 to-slate-950 text-white">
        <div className="container mx-auto max-w-6xl px-4 py-16 md:py-20">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/10 backdrop-blur-md border border-white/20 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.3em] mb-5">
            <BookOpen className="h-3 w-3" />
            {es ? 'Documentación oficial' : 'Official documentation'}
          </div>
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-4">
            {es ? 'Todo sobre ILLIUM' : 'Everything about ILLIUM'}
          </h1>
          <p className="text-lg text-slate-300 max-w-2xl mb-8">
            {es
              ? 'Plataforma completa con tutoriales en video, guía del panel admin, sistema de afiliados, notificaciones automáticas y roadmap.'
              : 'Complete platform with video tutorials, admin panel guide, affiliate system, automatic notifications and roadmap.'}
          </p>
          <div className="flex flex-wrap gap-2">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={es ? 'Buscar sección...' : 'Search section...'}
              className="rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-white placeholder:text-slate-400 px-5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-brand-400/50 flex-1 min-w-[250px] max-w-md"
            />
            <a href="#videos">
              <button className="rounded-full bg-brand-500 hover:bg-brand-400 text-white text-sm font-bold px-6 py-2.5 flex items-center gap-2 shadow-lg shadow-brand-500/30">
                <PlayCircle className="h-4 w-4" />
                {es ? 'Ver tutoriales' : 'Watch tutorials'}
              </button>
            </a>
          </div>
        </div>
      </div>

      <div className="container mx-auto max-w-6xl px-4 py-12">
        {/* Table of contents */}
        <div className="mb-10 grid grid-cols-2 md:grid-cols-5 gap-3">
          {filtered.map((t) => {
            const Icon = t.icon;
            return (
              <a
                key={t.id}
                href={`#${t.id}`}
                className="group rounded-2xl border border-slate-200 bg-white p-4 hover:border-brand-300 hover:shadow-md transition-all"
              >
                <Icon className="h-5 w-5 text-brand-600 mb-2 group-hover:scale-110 transition-transform" />
                <p className="text-xs font-semibold text-slate-900 leading-tight">{es ? t.es : t.en}</p>
              </a>
            );
          })}
        </div>

        <div className="space-y-6">
          {/* OVERVIEW */}
          <Section id="overview" icon={Sparkles} title={es ? 'Descripción general' : 'Overview'}>
            <p>
              {es
                ? 'ILLIUM es un e-commerce premium de péptidos de investigación con un sistema completo de afiliados multinivel, AI shopping assistant, notificaciones automáticas por WhatsApp y panel administrativo total.'
                : 'ILLIUM is a premium research peptides e-commerce with a full multi-level affiliate system, AI shopping assistant, automatic WhatsApp notifications and complete admin panel.'}
            </p>

            <h3>{es ? 'URLs principales' : 'Main URLs'}</h3>
            <ul>
              <li><strong>{es ? 'Sitio público' : 'Public site'}:</strong> <a href="https://alliumhealth.net">https://alliumhealth.net</a></li>
              <li><strong>Admin:</strong> <a href="https://alliumhealth.net/admin">/admin</a> — <code>admin@illium.health</code></li>
              <li><strong>{es ? 'Guía admin' : 'Admin guide'}:</strong> <Link to="/admin/guide">/admin/guide</Link></li>
              <li><strong>Firebase Console:</strong> <a href="https://console.firebase.google.com/project/monaco-community/overview">monaco-community</a></li>
            </ul>

            <h3>{es ? 'Cifras del proyecto' : 'Project numbers'}</h3>
            <div className="not-prose grid grid-cols-2 md:grid-cols-4 gap-3 my-4">
              <div className="rounded-xl bg-brand-50 border border-brand-200 p-3 text-center">
                <p className="text-2xl font-bold text-brand-900">13</p>
                <p className="text-xs text-slate-600">{es ? 'Productos en catálogo' : 'Products'}</p>
              </div>
              <div className="rounded-xl bg-brand-50 border border-brand-200 p-3 text-center">
                <p className="text-2xl font-bold text-brand-900">5</p>
                <p className="text-xs text-slate-600">Cloud Functions</p>
              </div>
              <div className="rounded-xl bg-brand-50 border border-brand-200 p-3 text-center">
                <p className="text-2xl font-bold text-brand-900">10</p>
                <p className="text-xs text-slate-600">WhatsApp templates</p>
              </div>
              <div className="rounded-xl bg-brand-50 border border-brand-200 p-3 text-center">
                <p className="text-2xl font-bold text-brand-900">2</p>
                <p className="text-xs text-slate-600">{es ? 'Idiomas (ES/EN)' : 'Languages'}</p>
              </div>
            </div>
          </Section>

          {/* VIDEOS */}
          <Section id="videos" icon={Video} title={es ? 'Video tutoriales' : 'Video tutorials'}>
            <p>
              {es
                ? 'Tutorial completo del panel admin narrado con IA en ambos idiomas. 5 capítulos cubriendo todo el flujo.'
                : 'Complete admin panel tutorial narrated with AI in both languages. 5 chapters covering the full flow.'}
            </p>
            <div className="not-prose grid grid-cols-1 md:grid-cols-2 gap-5 my-5">
              <VideoCard lang="es" url={TUTORIAL_ES} duration="2:07" />
              <VideoCard lang="en" url={TUTORIAL_EN} duration="1:54" />
            </div>
            <h3>{es ? 'Capítulos incluidos' : 'Chapters included'}</h3>
            <ol>
              <li>
                <strong>{es ? 'Dashboard y Asistente IA' : 'Dashboard & AI Assistant'}</strong> — {es ? 'KPIs, quick actions, AI chat' : 'KPIs, quick actions, AI chat'}
              </li>
              <li>
                <strong>{es ? 'Productos' : 'Products'}</strong> — {es ? 'Crear, editar, eliminar, subir imágenes' : 'Create, edit, delete, upload images'}
              </li>
              <li>
                <strong>{es ? 'Finanzas y Red de Afiliados' : 'Finance & Affiliate Network'}</strong> — {es ? 'Pedidos, comisiones, árbol' : 'Orders, commissions, tree'}
              </li>
              <li>
                <strong>{es ? 'Configuración' : 'Settings'}</strong> — {es ? 'Logo, WhatsApp, porcentajes, admin emails' : 'Logo, WhatsApp, rates, admin emails'}
              </li>
              <li>
                <strong>{es ? 'Flujos de Usuario' : 'User Flows'}</strong> — {es ? 'Cliente, partner, super admin' : 'Customer, partner, super admin'}
              </li>
            </ol>
          </Section>

          {/* FEATURES */}
          <Section id="features" icon={CheckCircle2} title={es ? 'Funcionalidades activas' : 'Active features'}>
            <div className="not-prose grid grid-cols-1 md:grid-cols-2 gap-3">
              {[
                { k: 'AI Quiz', d: es ? 'Quiz con IA que genera selección personalizada sin lenguaje médico' : 'AI quiz that generates personalized selection without medical language' },
                { k: es ? 'Carrito y checkout' : 'Cart & checkout', d: es ? 'Validaciones en vivo, resumen de pedido, soporte multimoneda' : 'Live validations, order summary, multi-currency support' },
                { k: es ? 'Sistema de afiliados' : 'Affiliate system', d: es ? '40% directo + 10% upline, tracking por ?ref=' : '40% direct + 10% upline, tracked via ?ref=' },
                { k: es ? 'Árbol jerárquico' : 'Hierarchical tree', d: es ? 'Visualización completa de la red en admin' : 'Complete network visualization in admin' },
                { k: 'AI Admin Assistant', d: es ? 'Chatbot conectado a Firestore, responde consultas específicas' : 'Chatbot connected to Firestore, answers specific queries' },
                { k: 'Chatbot público', d: es ? 'Asistente en home para ayudar a elegir productos' : 'Home assistant to help choose products' },
                { k: 'WhatsApp automático', d: es ? '5 plantillas bilingües para nuevos usuarios, ventas, envíos' : '5 bilingual templates for new users, sales, shipments' },
                { k: es ? 'Multi-idioma' : 'Multi-language', d: es ? 'ES/EN completo, auto-detect, persistido en localStorage' : 'Full ES/EN, auto-detect, persisted in localStorage' },
                { k: es ? 'Gate de edad 18+' : 'Age gate 18+', d: es ? 'Verificación requerida antes de ver productos' : 'Required verification before viewing products' },
                { k: es ? 'Panel super admin' : 'Super admin panel', d: es ? 'CRUD completo, configuración global, métricas live' : 'Full CRUD, global config, live metrics' },
                { k: es ? 'Panel partner' : 'Partner panel', d: es ? 'Dashboard con comisiones, árbol, link de referido' : 'Dashboard with commissions, tree, referral link' },
                { k: es ? 'Página "Mis pedidos"' : '"My orders" page', d: es ? 'Cliente ve estado con tracking' : 'Customer sees status with tracking' },
              ].map((f) => (
                <div key={f.k} className="rounded-xl border border-slate-200 bg-slate-50/50 p-3">
                  <p className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5 text-brand-600" /> {f.k}
                  </p>
                  <p className="text-xs text-slate-600 mt-1">{f.d}</p>
                </div>
              ))}
            </div>
          </Section>

          {/* ROLES */}
          <Section id="roles" icon={Users} title={es ? 'Roles de usuario' : 'User roles'}>
            <div className="not-prose grid grid-cols-1 md:grid-cols-3 gap-4 my-3">
              <div className="rounded-2xl border-2 border-amber-200 bg-amber-50/50 p-5">
                <Crown className="h-6 w-6 text-amber-600 mb-2" />
                <h3 className="font-bold text-slate-900 mb-1">Super Admin</h3>
                <p className="text-xs text-slate-500 mb-3">{es ? 'Control total' : 'Full control'}</p>
                <ul className="text-sm text-slate-700 space-y-1">
                  <li>• {es ? 'Acceso a /admin' : 'Access to /admin'}</li>
                  <li>• {es ? 'Edita todo' : 'Edits everything'}</li>
                  <li>• {es ? 'Ve toda la red' : 'Sees all network'}</li>
                  <li>• {es ? 'Marca comisiones pagadas' : 'Marks commissions paid'}</li>
                </ul>
              </div>
              <div className="rounded-2xl border-2 border-brand-200 bg-brand-50/50 p-5">
                <Users className="h-6 w-6 text-brand-600 mb-2" />
                <h3 className="font-bold text-slate-900 mb-1">Partner</h3>
                <p className="text-xs text-slate-500 mb-3">{es ? '40% + 10%' : '40% + 10%'}</p>
                <ul className="text-sm text-slate-700 space-y-1">
                  <li>• {es ? 'Link único ?ref=' : 'Unique ?ref= link'}</li>
                  <li>• {es ? '40% ventas directas' : '40% direct sales'}</li>
                  <li>• {es ? '10% de su red' : '10% of network'}</li>
                  <li>• /panel</li>
                </ul>
              </div>
              <div className="rounded-2xl border-2 border-slate-200 bg-slate-50/50 p-5">
                <ShoppingBag className="h-6 w-6 text-slate-600 mb-2" />
                <h3 className="font-bold text-slate-900 mb-1">{es ? 'Cliente' : 'Customer'}</h3>
                <p className="text-xs text-slate-500 mb-3">{es ? 'Comprador final' : 'End buyer'}</p>
                <ul className="text-sm text-slate-700 space-y-1">
                  <li>• {es ? 'Compra productos' : 'Buys products'}</li>
                  <li>• {es ? 'Hace el quiz' : 'Takes the quiz'}</li>
                  <li>• {es ? 'Ve sus pedidos' : 'Sees their orders'}</li>
                  <li>• /orders</li>
                </ul>
              </div>
            </div>
          </Section>

          {/* COMMISSIONS */}
          <Section id="commissions" icon={DollarSign} title={es ? 'Sistema de comisiones' : 'Commission system'}>
            <p>
              {es
                ? 'Modelo de 2 niveles editable desde /admin/settings.'
                : '2-tier model editable from /admin/settings.'}
            </p>
            <div className="not-prose rounded-2xl bg-gradient-to-br from-brand-50 to-white border border-brand-200 p-5 my-4">
              <div className="flex gap-6 flex-wrap">
                <div className="flex-1 min-w-[200px]">
                  <p className="text-[10px] uppercase tracking-widest text-brand-700 font-bold mb-1">{es ? 'Directo' : 'Direct'}</p>
                  <p className="text-4xl font-black text-slate-900">40%</p>
                  <p className="text-xs text-slate-600 mt-1">{es ? 'Partner del link' : 'Link partner'}</p>
                </div>
                <div className="flex-1 min-w-[200px]">
                  <p className="text-[10px] uppercase tracking-widest text-brand-700 font-bold mb-1">Upline</p>
                  <p className="text-4xl font-black text-slate-900">10%</p>
                  <p className="text-xs text-slate-600 mt-1">{es ? 'Quien refirió al partner' : 'Who referred the partner'}</p>
                </div>
                <div className="flex-1 min-w-[200px]">
                  <p className="text-[10px] uppercase tracking-widest text-slate-600 font-bold mb-1">{es ? 'Tu margen' : 'Your margin'}</p>
                  <p className="text-4xl font-black text-slate-900">50%</p>
                  <p className="text-xs text-slate-600 mt-1">{es ? 'Después de comisiones' : 'After commissions'}</p>
                </div>
              </div>
            </div>
            <h3>{es ? 'Ejemplo' : 'Example'}</h3>
            <p>
              {es
                ? 'María es partner. Juan es partner bajo María (entró con su link). Juan comparte SU link. Un cliente compra $100. Juan gana $40. María gana $10. Tú (admin) te quedas con $50.'
                : 'Maria is a partner. Juan is a partner under Maria (joined via her link). Juan shares HIS link. A customer buys $100. Juan earns $40. Maria earns $10. You (admin) keep $50.'}
            </p>
          </Section>

          {/* WHATSAPP NOTIFICATIONS */}
          <Section id="whatsapp" icon={Bell} title={es ? 'Notificaciones WhatsApp' : 'WhatsApp notifications'}>
            <p>
              {es
                ? '5 plantillas × 2 idiomas = 10 templates creadas en Meta Business (WABA 104990149152559). Requieren aprobación de Meta (1-24h después de enviadas).'
                : '5 templates × 2 languages = 10 templates created in Meta Business (WABA 104990149152559). Require Meta approval (1-24h after submission).'}
            </p>
            <div className="not-prose space-y-2 my-3">
              {[
                { t: 'illium_new_affiliate', d: es ? 'Bienvenida al partner con su link' : 'Welcome partner with their link' },
                { t: 'illium_new_referral', d: es ? 'Al partner cuando alguien entra con su link' : 'To partner when someone joins via their link' },
                { t: 'illium_admin_new_user', d: es ? 'A todos tus números owner' : 'To all your owner numbers' },
                { t: 'illium_new_sale', d: es ? 'Al partner directo (40%) y upline (10%)' : 'To direct partner (40%) and upline (10%)' },
                { t: 'illium_order_shipped', d: es ? 'Al cliente con tracking cuando marcas enviado' : 'To customer with tracking when marked shipped' },
              ].map((tmpl) => (
                <div key={tmpl.t} className="flex gap-3 items-start rounded-xl border border-slate-200 bg-white p-3">
                  <CheckCircle2 className="h-4 w-4 text-brand-600 mt-0.5 shrink-0" />
                  <div className="flex-1">
                    <code className="text-xs font-mono font-bold text-slate-900">{tmpl.t}</code>
                    <p className="text-xs text-slate-600 mt-0.5">{tmpl.d}</p>
                  </div>
                </div>
              ))}
            </div>
          </Section>

          {/* PAYMENTS - IMPORTANT NOTICE */}
          <Section id="payments" icon={CreditCard} title={es ? 'Pagos · Integración pendiente' : 'Payments · Integration pending'}>
            <div className="not-prose rounded-2xl border-2 border-amber-300 bg-amber-50 p-5 mb-4">
              <div className="flex gap-3">
                <AlertTriangle className="h-6 w-6 text-amber-600 shrink-0" />
                <div>
                  <h3 className="font-bold text-amber-900 mb-1">
                    {es ? 'Pasarela de pago aún no integrada' : 'Payment gateway not yet integrated'}
                  </h3>
                  <p className="text-sm text-amber-900 leading-relaxed">
                    {es
                      ? 'El flujo de pago actual guarda el pedido en Firestore con estado "pending" y muestra instrucciones manuales (Zelle / transferencia). La integración con Stripe u otra pasarela se completará en la próxima fase.'
                      : 'The current payment flow saves the order to Firestore with "pending" status and shows manual instructions (Zelle / wire). Integration with Stripe or another gateway will be completed in the next phase.'}
                  </p>
                </div>
              </div>
            </div>

            <h3>{es ? 'Flujo actual (temporal)' : 'Current flow (temporary)'}</h3>
            <ol>
              <li>{es ? 'Cliente completa el checkout (nombre, dirección, WhatsApp, etc.)' : 'Customer completes checkout (name, address, WhatsApp, etc.)'}</li>
              <li>{es ? 'Pedido se guarda en Firestore con status="pending"' : 'Order is saved to Firestore with status="pending"'}</li>
              <li>{es ? 'Cliente recibe instrucciones manuales (Zelle) en pantalla + email' : 'Customer receives manual instructions (Zelle) on screen + email'}</li>
              <li>{es ? 'Admin verifica pago recibido y actualiza estado manualmente en /admin/finance' : 'Admin verifies payment received and updates status manually in /admin/finance'}</li>
              <li>{es ? 'Al marcar enviado → dispara WhatsApp automático al cliente' : 'On shipped mark → fires automatic WhatsApp to customer'}</li>
            </ol>

            <h3>{es ? 'Lo que viene en la siguiente fase' : 'What is coming in the next phase'}</h3>
            <ul>
              <li>
                <strong>Stripe Checkout</strong>: {es
                  ? 'integración de pagos con tarjeta, Apple/Google Pay, link de pago. Soporte para payment intents, webhooks, reembolsos desde admin.'
                  : 'card payments, Apple/Google Pay, payment links. Support for payment intents, webhooks, refunds from admin.'}
              </li>
              <li>
                <strong>Multi-moneda</strong>: {es
                  ? 'precios automáticos según país del cliente.'
                  : 'automatic pricing by customer country.'}
              </li>
              <li>
                <strong>{es ? 'Pago automático de comisiones' : 'Automatic commission payouts'}</strong>: {es
                  ? 'Stripe Connect para transferencias a los partners (opcional).'
                  : 'Stripe Connect for partner transfers (optional).'}
              </li>
              <li>
                <strong>{es ? 'Suscripciones' : 'Subscriptions'}</strong>: {es
                  ? 'planes mensuales automáticos para Stack fijos (Fat Loss, Performance, Recovery).'
                  : 'automatic monthly plans for fixed Stacks (Fat Loss, Performance, Recovery).'}
              </li>
              <li>
                <strong>{es ? 'Pasarelas alternativas' : 'Alternative gateways'}</strong>: {es
                  ? 'Zelle API, cripto (USDT/USDC), PayPal como fallback.'
                  : 'Zelle API, crypto (USDT/USDC), PayPal as fallback.'}
              </li>
            </ul>
            <p className="mt-4 text-sm text-slate-600">
              {es
                ? 'Cuando se integre la pasarela, el flujo del cliente no cambiará en UX — solo se agregará el paso de procesamiento del pago antes de confirmar el pedido.'
                : 'When the gateway is integrated, the customer UX flow will not change — only the payment processing step will be added before order confirmation.'}
            </p>
          </Section>

          {/* ADMIN */}
          <Section id="admin" icon={Settings} title={es ? 'Panel admin' : 'Admin panel'}>
            <p>
              {es ? 'Acceso exclusivo del super admin. Credenciales:' : 'Super admin exclusive access. Credentials:'}
            </p>
            <div className="not-prose rounded-xl bg-slate-900 text-white p-4 my-3 font-mono text-sm space-y-1">
              <div>URL: <span className="text-brand-400">https://alliumhealth.net/login</span></div>
              <div>Email: <span className="text-brand-400">admin@illium.health</span></div>
              <div>{es ? 'Password' : 'Password'}: <span className="text-amber-300">solicítala al owner</span></div>
            </div>
            <h3>{es ? 'Rutas principales' : 'Main routes'}</h3>
            <ul>
              <li><Link to="/admin">/admin</Link> — Dashboard con KPIs y quick actions</li>
              <li><Link to="/admin/products">/admin/products</Link> — CRUD de productos</li>
              <li><Link to="/admin/finance">/admin/finance</Link> — Pedidos, usuarios, árbol de afiliados</li>
              <li><Link to="/admin/leads">/admin/leads</Link> — Leads del quiz</li>
              <li><Link to="/admin/settings">/admin/settings</Link> — {es ? 'Configuración global' : 'Global config'}</li>
              <li><Link to="/admin/guide">/admin/guide</Link> — {es ? 'Guía interna paso a paso' : 'Internal step-by-step guide'}</li>
            </ul>
          </Section>

          {/* STACK */}
          <Section id="stack" icon={Code} title={es ? 'Stack técnico' : 'Tech stack'}>
            <div className="not-prose grid grid-cols-2 md:grid-cols-3 gap-3 my-3">
              {[
                { label: 'Frontend', value: 'React 19 + TypeScript + Vite' },
                { label: 'UI', value: 'Tailwind CSS + shadcn/ui + framer-motion' },
                { label: 'Backend', value: 'Firebase (Firestore + Auth + Storage + Functions)' },
                { label: 'AI', value: 'Gemini 2.5 Flash (TTS + chat), Veo 3 (video), Gemini 3.1 Flash Image (imágenes)' },
                { label: 'Hosting', value: 'Firebase Hosting' },
                { label: 'Mensajería', value: 'WhatsApp Business API (Meta)' },
                { label: 'Routing', value: 'React Router v7' },
                { label: 'State', value: 'Zustand' },
                { label: 'i18n', value: es ? 'Custom ES/EN' : 'Custom ES/EN' },
              ].map((s) => (
                <div key={s.label} className="rounded-xl bg-slate-50 border border-slate-200 p-3">
                  <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">{s.label}</p>
                  <p className="text-xs text-slate-800 mt-1 font-medium">{s.value}</p>
                </div>
              ))}
            </div>
          </Section>

          {/* ROADMAP */}
          <Section id="roadmap" icon={Rocket} title={es ? 'Roadmap' : 'Roadmap'}>
            <h3>✅ {es ? 'Completado' : 'Completed'}</h3>
            <ul>
              <li>Catálogo de 13 productos ILLIUM con imágenes AI</li>
              <li>{es ? 'Quiz AI sin lenguaje médico' : 'AI quiz without medical language'}</li>
              <li>{es ? 'Sistema de afiliados multinivel (40% + 10%)' : 'Multi-level affiliate system (40% + 10%)'}</li>
              <li>{es ? 'Admin panel completo con asistente IA' : 'Full admin panel with AI assistant'}</li>
              <li>{es ? 'Video tutoriales bilingües' : 'Bilingual video tutorials'}</li>
              <li>{es ? '10 plantillas WhatsApp en Meta' : '10 WhatsApp templates in Meta'}</li>
              <li>{es ? 'Cloud Functions desplegadas' : 'Cloud Functions deployed'}</li>
              <li>Hero video con Veo 3</li>
              <li>{es ? 'Meta tags y SEO' : 'Meta tags and SEO'}</li>
            </ul>

            <h3>🚧 {es ? 'En progreso / próximo' : 'In progress / next'}</h3>
            <ul>
              <li>
                <strong>Stripe Checkout</strong> — {es ? 'integración de pagos reales' : 'real payments integration'} (<a href="#payments">{es ? 'ver detalles' : 'see details'}</a>)
              </li>
              <li>{es ? 'Meta aprobará las 10 plantillas WhatsApp (pending review)' : 'Meta will approve the 10 WhatsApp templates (pending review)'}</li>
              <li>{es ? 'Analytics / métricas por fuente de tráfico' : 'Analytics / metrics by traffic source'}</li>
            </ul>

            <h3>💡 {es ? 'Ideas futuras' : 'Future ideas'}</h3>
            <ul>
              <li>{es ? 'Suscripciones mensuales de stacks' : 'Monthly stack subscriptions'}</li>
              <li>{es ? 'App móvil (React Native)' : 'Mobile app (React Native)'}</li>
              <li>{es ? 'Cupones y códigos de descuento' : 'Coupons and discount codes'}</li>
              <li>{es ? 'Reviews de productos' : 'Product reviews'}</li>
              <li>{es ? 'Blog / contenido educativo' : 'Blog / educational content'}</li>
              <li>{es ? 'Pago automático de comisiones a partners' : 'Automatic commission payouts to partners'}</li>
            </ul>
          </Section>
        </div>

        {/* Footer */}
        <div className="mt-10 rounded-3xl bg-gradient-to-br from-slate-900 to-brand-950 text-white p-8 text-center">
          <Sparkles className="h-8 w-8 text-brand-400 mx-auto mb-3" />
          <h3 className="text-xl font-bold mb-2">
            {es ? '¿Necesitas ayuda?' : 'Need help?'}
          </h3>
          <p className="text-sm text-slate-400 mb-4">
            {es
              ? 'Usa el Asistente IA en el panel admin o contáctanos.'
              : 'Use the AI Assistant in the admin panel or contact us.'}
          </p>
          <div className="flex flex-wrap gap-2 justify-center">
            <Link to="/admin/guide" className="rounded-full bg-white/10 hover:bg-white/20 border border-white/20 px-5 py-2 text-sm font-semibold">
              {es ? 'Guía admin' : 'Admin guide'}
            </Link>
            <Link to="/contact" className="rounded-full bg-brand-500 hover:bg-brand-400 px-5 py-2 text-sm font-bold">
              {es ? 'Contactar' : 'Contact'}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

// unused imports silencer
void ImageIcon;
void Globe;
void Shield;
void Zap;
void Package;
void Wallet;
void MessageSquare;
void GitBranch;
void FileText;
