import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BookOpen,
  User,
  Users,
  Crown,
  ShoppingBag,
  Package,
  Wallet,
  Settings,
  LayoutDashboard,
  MessageCircle,
  GitBranch,
  HelpCircle,
  CheckCircle2,
  ArrowRight,
  Sparkles,
  Link as LinkIcon,
  Shield,
  DollarSign,
  Image as ImageIcon,
  Bell,
} from 'lucide-react';
import { useI18n } from '@/i18n/I18nContext';

type Section = {
  id: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  title_en: string;
  content: (es: boolean) => React.ReactNode;
};

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4 mb-5">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white text-sm font-bold">
        {n}
      </div>
      <div className="flex-1 pt-0.5">
        <h4 className="font-semibold text-slate-900 mb-1">{title}</h4>
        <div className="text-sm text-slate-600 leading-relaxed">{children}</div>
      </div>
    </div>
  );
}

function GuideLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      className="inline-flex items-center gap-1 text-brand-700 font-semibold hover:text-brand-900 underline decoration-brand-300 underline-offset-2"
    >
      {children} <LinkIcon className="h-3 w-3" />
    </Link>
  );
}

function Tip({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-3 rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900 flex gap-2">
      <Sparkles className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
      <div>{children}</div>
    </div>
  );
}

// ── Flow visual — 3 user types ─────────────────────
function FlowCard({
  role,
  icon: Icon,
  color,
  title,
  subtitle,
  steps,
}: {
  role: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  title: string;
  subtitle: string;
  steps: string[];
}) {
  return (
    <div className={`rounded-2xl border-2 ${color} bg-white p-6 shadow-sm`}>
      <div className="flex items-center gap-3 mb-3">
        <div className={`h-10 w-10 rounded-xl bg-gradient-to-br ${role === 'admin' ? 'from-amber-500 to-amber-700' : role === 'partner' ? 'from-brand-500 to-brand-700' : 'from-slate-600 to-slate-800'} flex items-center justify-center text-white`}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">{role}</p>
          <h3 className="font-bold text-slate-900">{title}</h3>
        </div>
      </div>
      <p className="text-sm text-slate-500 mb-4">{subtitle}</p>
      <ol className="space-y-2">
        {steps.map((s, i) => (
          <li key={i} className="flex gap-2.5 text-sm text-slate-700">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600 text-xs font-bold">
              {i + 1}
            </span>
            <span>{s}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function AdminGuide() {
  const { locale } = useI18n();
  const es = locale === 'es';
  const [search, setSearch] = useState('');

  const sections: Section[] = [
    {
      id: 'dashboard',
      icon: LayoutDashboard,
      title: 'Dashboard',
      title_en: 'Dashboard',
      content: (es) => (
        <>
          <p className="mb-4">
            {es
              ? 'La pantalla principal del admin muestra los KPIs del negocio en tiempo real.'
              : 'The main admin screen shows business KPIs in real time.'}
          </p>
          <Step n={1} title={es ? 'Abrir el dashboard' : 'Open the dashboard'}>
            <GuideLink to="/admin">/admin</GuideLink>
          </Step>
          <Step n={2} title={es ? 'Leer las 4 tarjetas principales' : 'Read the 4 main cards'}>
            {es
              ? 'Ingresos totales · Leads · Pedidos · Tasa de conversión. Se actualizan en vivo conforme llegan datos.'
              : 'Total Revenue · Leads · Orders · Conversion Rate. Updated live as data flows in.'}
          </Step>
          <Step n={3} title={es ? 'Comisiones por producto' : 'Commission breakdown by product'}>
            {es
              ? 'Tabla debajo muestra ingresos, cantidad vendida y comisiones acumuladas por cada producto.'
              : 'Table below shows revenue, quantity sold and accrued commissions per product.'}
          </Step>
          <Tip>
            {es
              ? 'Los valores se calculan del total de pedidos vigentes en la base de datos. Usa el filtro de fechas en Finance para ver rangos específicos.'
              : 'Values are calculated from all current orders in the database. Use the date filter in Finance for specific ranges.'}
          </Tip>
        </>
      ),
    },
    {
      id: 'products',
      icon: Package,
      title: 'Productos e inventario',
      title_en: 'Products & Inventory',
      content: (es) => (
        <>
          <Step n={1} title={es ? 'Crear un producto nuevo' : 'Create a new product'}>
            {es ? (
              <>
                Ve a <GuideLink to="/admin/products">/admin/products</GuideLink> → click <strong>"Add product"</strong> → llena campos:
                <ul className="mt-2 space-y-1 list-disc list-inside">
                  <li><strong>Name (EN)</strong> y <strong>Name (ES)</strong> — título bilingüe</li>
                  <li><strong>Category</strong> — elige del combobox (Metabolic, Recovery, Nootropics, NAD+, Peptides, Blends)</li>
                  <li><strong>Price</strong> (USD) y <strong>Stock</strong></li>
                  <li><strong>Image</strong> — sube drag &amp; drop o pega URL</li>
                  <li><strong>Description</strong> (EN/ES) — texto corto</li>
                  <li><strong>Benefits</strong> (EN/ES) — separados por coma</li>
                </ul>
              </>
            ) : (
              <>
                Go to <GuideLink to="/admin/products">/admin/products</GuideLink> → click <strong>"Add product"</strong> → fill fields:
                <ul className="mt-2 space-y-1 list-disc list-inside">
                  <li><strong>Name (EN)</strong> and <strong>Name (ES)</strong> — bilingual title</li>
                  <li><strong>Category</strong> — choose from combobox</li>
                  <li><strong>Price</strong> (USD) and <strong>Stock</strong></li>
                  <li><strong>Image</strong> — drag &amp; drop or paste URL</li>
                  <li><strong>Description</strong> (EN/ES) — short text</li>
                  <li><strong>Benefits</strong> (EN/ES) — comma separated</li>
                </ul>
              </>
            )}
          </Step>
          <Step n={2} title={es ? 'Editar un producto existente' : 'Edit existing product'}>
            {es ? 'Click el ícono de lápiz ✏️ en la fila del producto.' : 'Click the pencil icon ✏️ on the product row.'}
          </Step>
          <Step n={3} title={es ? 'Eliminar un producto' : 'Delete a product'}>
            {es ? 'Click el ícono de bote de basura 🗑️ — pedirá confirmación.' : 'Click the trash icon 🗑️ — it asks for confirmation.'}
          </Step>
          <Tip>
            {es
              ? 'Los productos aparecen en vivo en la tienda pública. Si bajas el stock a 0, seguirá visible pero sin poder añadir al carrito. Borra el producto para quitarlo por completo.'
              : "Products appear live on the public store. Lowering stock to 0 keeps it visible but can't be added to cart. Delete the product to remove it entirely."}
          </Tip>
        </>
      ),
    },
    {
      id: 'finance',
      icon: Wallet,
      title: 'Finanzas, pedidos y red',
      title_en: 'Finance, orders & network',
      content: (es) => (
        <>
          <p className="mb-4">
            {es
              ? 'La sección Finance es el centro de operaciones. Tiene 3 pestañas:'
              : 'Finance is the operations hub. 3 tabs:'}
          </p>
          <Step n={1} title={es ? 'Pestaña "Orders" — gestionar pedidos' : 'Orders tab — manage orders'}>
            {es
              ? 'Cambia el estado del pedido (pending, processing, fulfilled, shipped) y agrega tracking number. Al pasar a "shipped" el cliente recibe WhatsApp automático.'
              : 'Change order status (pending, processing, fulfilled, shipped) and add tracking number. When set to "shipped", customer gets automatic WhatsApp.'}
          </Step>
          <Step n={2} title={es ? 'Marcar comisiones como pagadas' : 'Mark commissions as paid'}>
            {es
              ? 'Cada pedido con referrer tiene 2 toggles: "Referrer payout status" (40%) y "Upline payout status" (10%). Cámbialos a "paid" cuando pagues al partner. Se envía WhatsApp de confirmación.'
              : 'Each order with referrer has 2 toggles: "Referrer payout status" (40%) and "Upline payout status" (10%). Switch to "paid" when you pay the partner. Confirmation WhatsApp is sent.'}
          </Step>
          <Step n={3} title={es ? 'Pestaña "Users" — gestionar usuarios' : 'Users tab — manage users'}>
            {es
              ? 'Lista todos los usuarios (clientes, partners, admins). Puedes eliminar usuarios (borra cuenta en Auth y datos en Firestore).'
              : 'Lists all users (clients, partners, admins). You can delete users (removes Auth account and Firestore data).'}
          </Step>
          <Step n={4} title={es ? 'Pestaña "🌳 Árbol / Tree" — ver la red completa' : 'Tree tab — view full network'}>
            {es
              ? 'Visualiza la jerarquía multi-nivel de todos los afiliados. Las coronas doradas marcan las raíces. Cada nodo muestra cuántos descendientes tiene. Expande/colapsa ramas con la flecha.'
              : 'Visualizes multi-level hierarchy of all affiliates. Gold crowns mark roots. Each node shows descendant count. Expand/collapse branches with the arrow.'}
          </Step>
          <Tip>
            {es
              ? 'Abre Finance en otra pestaña mientras atiendes pedidos: todo se sincroniza en tiempo real con Firestore.'
              : 'Open Finance in another tab while handling orders: everything syncs in real time with Firestore.'}
          </Tip>
        </>
      ),
    },
    {
      id: 'leads',
      icon: Users,
      title: 'Leads y ventas',
      title_en: 'Leads & sales',
      content: (es) => (
        <>
          <p className="mb-4">
            {es
              ? 'Cada vez que alguien completa el quiz se guarda un "lead".'
              : 'Every time someone completes the quiz, a "lead" is saved.'}
          </p>
          <Step n={1} title={es ? 'Ver leads' : 'View leads'}>
            <GuideLink to="/admin/leads">/admin/leads</GuideLink>
            {es ? ' — lista ordenada por fecha (más recientes arriba).' : ' — list sorted by date (newest first).'}
          </Step>
          <Step n={2} title={es ? 'Editar un lead' : 'Edit a lead'}>
            {es ? 'Click en la fila para editar: nombre, email, teléfono, estado, notas internas.' : 'Click the row to edit: name, email, phone, status, internal notes.'}
          </Step>
          <Step n={3} title={es ? 'Eliminar' : 'Delete'}>
            {es ? 'Botón rojo de basura en cada fila.' : 'Red trash button on each row.'}
          </Step>
        </>
      ),
    },
    {
      id: 'settings',
      icon: Settings,
      title: 'Configuración',
      title_en: 'Settings',
      content: (es) => (
        <>
          <p className="mb-4">
            <GuideLink to="/admin/settings">/admin/settings</GuideLink>
            {es ? ' — aquí controlas todo lo global de la plataforma.' : ' — here you control everything global.'}
          </p>
          <Step n={1} title={es ? 'Admin emails' : 'Admin emails'}>
            {es
              ? 'Lista (uno por línea) de correos que pueden acceder a /admin. Solo estos ven la consola.'
              : 'List (one per line) of emails allowed to access /admin. Only these see the console.'}
          </Step>
          <Step n={2} title={es ? 'WhatsApp del propietario (multi-número)' : 'Owner WhatsApp (multi-number)'}>
            {es
              ? 'Agrega tantos números como quieras. TODOS reciben notificaciones de nuevos registros, ventas y eventos importantes. Botón "+ Agregar número".'
              : 'Add as many as you want. ALL receive notifications of new registrations, sales, and important events. "+ Add number" button.'}
          </Step>
          <Step n={3} title={es ? 'Porcentajes de comisión' : 'Commission rates'}>
            {es
              ? 'Ajusta el % directo (40% por defecto) y upline (10% por defecto). Valores entre 0 y 1.'
              : 'Adjust direct % (40% default) and upline % (10% default). Values between 0 and 1.'}
          </Step>
          <Step n={4} title={es ? 'Logo, Hero, categorías' : 'Logo, Hero, categories'}>
            {es
              ? 'Campo "Brand Logo URL" · Hero título/subtítulo bilingüe · lista de categorías con imágenes.'
              : '"Brand Logo URL" field · Hero title/subtitle bilingual · category list with images.'}
          </Step>
          <Step n={5} title={es ? 'Meta WhatsApp templates' : 'Meta WhatsApp templates'}>
            {es
              ? 'Meta WhatsApp Phone Number ID · Template name · Template language. Las Cloud Functions usan estas plantillas para enviar.'
              : 'Meta WhatsApp Phone Number ID · Template name · Template language. Cloud Functions use these to send.'}
          </Step>
          <Step n={6} title={es ? 'Métodos de pago' : 'Payment methods'}>
            {es
              ? 'Texto libre (EN y ES) que aparece en el checkout y en el email de confirmación del pedido.'
              : 'Free text (EN and ES) shown at checkout and in order confirmation.'}
          </Step>
          <Step n={7} title={es ? 'Prompt del asistente IA' : 'AI assistant prompt'}>
            {es
              ? 'Personaliza la personalidad del chatbot público (el que flota abajo a la derecha).'
              : 'Customize the public chatbot personality (the one floating bottom-right).'}
          </Step>
          <Tip>
            {es
              ? 'Todos los cambios se guardan con un solo botón "Save" al final de la página.'
              : 'All changes save with a single "Save" button at the end of the page.'}
          </Tip>
        </>
      ),
    },
    {
      id: 'notifications',
      icon: Bell,
      title: 'Notificaciones WhatsApp',
      title_en: 'WhatsApp notifications',
      content: (es) => (
        <>
          <p className="mb-4">
            {es
              ? 'El sistema dispara WhatsApps automáticos vía Meta Business API:'
              : 'The system fires automatic WhatsApps via Meta Business API:'}
          </p>
          <ul className="space-y-3 mb-4">
            <li className="flex gap-3 text-sm">
              <CheckCircle2 className="h-4 w-4 text-brand-600 shrink-0 mt-0.5" />
              <div>
                <strong>illium_new_affiliate</strong>
                {es ? ' — al nuevo partner con su link de referido.' : ' — to the new partner with their referral link.'}
              </div>
            </li>
            <li className="flex gap-3 text-sm">
              <CheckCircle2 className="h-4 w-4 text-brand-600 shrink-0 mt-0.5" />
              <div>
                <strong>illium_new_referral</strong>
                {es ? ' — al partner que lo refirió.' : ' — to the partner who referred them.'}
              </div>
            </li>
            <li className="flex gap-3 text-sm">
              <CheckCircle2 className="h-4 w-4 text-brand-600 shrink-0 mt-0.5" />
              <div>
                <strong>illium_admin_new_user</strong>
                {es ? ' — a TODOS tus números owner.' : ' — to ALL your owner numbers.'}
              </div>
            </li>
            <li className="flex gap-3 text-sm">
              <CheckCircle2 className="h-4 w-4 text-brand-600 shrink-0 mt-0.5" />
              <div>
                <strong>illium_new_sale</strong>
                {es ? ' — al partner directo (40%) y upline (10%).' : ' — to direct partner (40%) and upline (10%).'}
              </div>
            </li>
            <li className="flex gap-3 text-sm">
              <CheckCircle2 className="h-4 w-4 text-brand-600 shrink-0 mt-0.5" />
              <div>
                <strong>illium_order_shipped</strong>
                {es ? ' — al cliente cuando marcas el pedido como enviado.' : ' — to the customer when you mark the order shipped.'}
              </div>
            </li>
          </ul>
          <Tip>
            {es
              ? 'Las plantillas requieren aprobación de Meta (1-24h). Verifica el estado en business.facebook.com.'
              : 'Templates require Meta approval (1-24h). Check status at business.facebook.com.'}
          </Tip>
        </>
      ),
    },
    {
      id: 'commissions',
      icon: DollarSign,
      title: 'Sistema de comisiones',
      title_en: 'Commission system',
      content: (es) => (
        <>
          <div className="rounded-2xl bg-gradient-to-br from-brand-50 to-white border border-brand-200 p-5 mb-4">
            <h4 className="font-bold text-slate-900 mb-3 flex items-center gap-2">
              <GitBranch className="h-4 w-4 text-brand-600" />
              {es ? 'Modelo de dos niveles' : 'Two-tier model'}
            </h4>
            <ul className="space-y-2 text-sm text-slate-700">
              <li>
                <strong className="text-brand-700">40% directo</strong>
                {es
                  ? ' — el partner cuyo link de referido (?ref=) se usó en el checkout recibe 40% del total del pedido.'
                  : ' — the partner whose referral link (?ref=) was used at checkout gets 40% of the order total.'}
              </li>
              <li>
                <strong className="text-brand-700">10% upline</strong>
                {es
                  ? ' — el partner que refirió a ESE partner recibe 10% del total.'
                  : " — the partner who referred THAT partner gets 10% of the total."}
              </li>
            </ul>
          </div>
          <p className="text-sm text-slate-600 mb-3">
            {es
              ? 'Ejemplo: Juan refiere a María. María refiere a un cliente que compra $100. María gana $40 (directo). Juan gana $10 (upline). Total comisiones: $50.'
              : 'Example: Juan refers Maria. Maria refers a customer who buys $100. Maria earns $40 (direct). Juan earns $10 (upline). Total commissions: $50.'}
          </p>
          <Step n={1} title={es ? 'Cambiar los porcentajes' : 'Change rates'}>
            <GuideLink to="/admin/settings">/admin/settings</GuideLink>
            {es ? ' → sección "💰 Porcentajes de comisión".' : ' → section "💰 Commission rates".'}
          </Step>
          <Step n={2} title={es ? 'Ver comisiones pendientes/pagadas' : 'View pending/paid commissions'}>
            <GuideLink to="/admin/finance">/admin/finance</GuideLink>
            {es ? ' → pestaña Orders.' : ' → Orders tab.'}
          </Step>
        </>
      ),
    },
    {
      id: 'flows',
      icon: GitBranch,
      title: 'Flujos por rol',
      title_en: 'User flows by role',
      content: (es) => (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <FlowCard
            role="admin"
            icon={Crown}
            color="border-amber-200"
            title={es ? 'Super Admin (tú)' : 'Super Admin (you)'}
            subtitle={es ? 'Control total del sistema' : 'Full system control'}
            steps={
              es
                ? [
                    'Login con email admin@illium.health',
                    'Redirigido automáticamente a /admin',
                    'Gestionar productos, pedidos, usuarios, ajustes',
                    'Marcar comisiones como pagadas',
                    'Editar logos, WhatsApp numbers, tasas',
                    'Usar el Asistente IA para consultas rápidas',
                  ]
                : [
                    'Login with email admin@illium.health',
                    'Auto-redirected to /admin',
                    'Manage products, orders, users, settings',
                    'Mark commissions as paid',
                    'Edit logos, WhatsApp numbers, rates',
                    'Use AI Assistant for quick queries',
                  ]
            }
          />
          <FlowCard
            role="partner"
            icon={Users}
            color="border-brand-200"
            title={es ? 'Partner / Afiliado' : 'Partner / Affiliate'}
            subtitle={es ? 'Vende y gana 40% + 10%' : 'Sells and earns 40% + 10%'}
            steps={
              es
                ? [
                    'Registrarse en /login como Partner',
                    'Recibe WhatsApp de bienvenida con su link',
                    'Comparte su link de referido (?ref=su-uid)',
                    'Cada venta con su link → gana 40%',
                    'Cada venta de alguien de su red → gana 10%',
                    'Ve su árbol + comisiones en /panel',
                  ]
                : [
                    'Sign up at /login as Partner',
                    'Receives welcome WhatsApp with their link',
                    'Shares their referral link (?ref=their-uid)',
                    'Every sale with their link → earns 40%',
                    'Every sale from their network → earns 10%',
                    'Sees tree + commissions at /panel',
                  ]
            }
          />
          <FlowCard
            role="client"
            icon={ShoppingBag}
            color="border-slate-200"
            title={es ? 'Cliente' : 'Customer'}
            subtitle={es ? 'Compra productos' : 'Buys products'}
            steps={
              es
                ? [
                    'Entra al sitio (con o sin link de partner)',
                    'Hace el quiz o explora productos',
                    'Añade al carrito y finaliza compra',
                    'Si entró con ?ref=, se atribuye la comisión',
                    'Registro opcional para ver /orders',
                    'Recibe WhatsApp cuando el pedido se envía',
                  ]
                : [
                    'Enters the site (with or without partner link)',
                    'Takes the quiz or browses products',
                    'Adds to cart and checks out',
                    'If entered with ?ref=, commission is attributed',
                    'Optional signup to see /orders',
                    'Receives WhatsApp when the order ships',
                  ]
            }
          />
        </div>
      ),
    },
    {
      id: 'sub-affiliate',
      icon: GitBranch,
      title: 'Sub-afiliado (entró con link)',
      title_en: 'Sub-affiliate (joined via link)',
      content: (es) => (
        <>
          <p className="mb-4">
            {es
              ? 'Cuando alguien entra a https://illium.health/?ref=ABC123 y se registra como Partner:'
              : 'When someone enters https://illium.health/?ref=ABC123 and registers as Partner:'}
          </p>
          <ol className="space-y-3 text-sm text-slate-700">
            <li className="flex gap-3">
              <span className="h-6 w-6 rounded-full bg-brand-600 text-white text-xs font-bold flex items-center justify-center shrink-0">1</span>
              <div>
                <strong>{es ? 'Se guarda el referrerId' : 'referrerId is saved'}</strong>
                {es
                  ? ' en localStorage. Al registrarse, el partner queda "bajo" el link origen.'
                  : ' in localStorage. When registering, the partner becomes "under" the originating link.'}
              </div>
            </li>
            <li className="flex gap-3">
              <span className="h-6 w-6 rounded-full bg-brand-600 text-white text-xs font-bold flex items-center justify-center shrink-0">2</span>
              <div>
                <strong>{es ? 'Se construye la cadena de ancestros' : 'Ancestor chain is built'}</strong>
                {es
                  ? ' — todos sus superiores (upline) quedan registrados en publicReferralMeta.'
                  : ' — all uplines are registered in publicReferralMeta.'}
              </div>
            </li>
            <li className="flex gap-3">
              <span className="h-6 w-6 rounded-full bg-brand-600 text-white text-xs font-bold flex items-center justify-center shrink-0">3</span>
              <div>
                <strong>{es ? 'El referrer recibe notificación' : 'The referrer gets notified'}</strong>
                {es
                  ? ' por WhatsApp (illium_new_referral) de que tiene un nuevo sub-afiliado.'
                  : ' by WhatsApp (illium_new_referral) of their new sub-affiliate.'}
              </div>
            </li>
            <li className="flex gap-3">
              <span className="h-6 w-6 rounded-full bg-brand-600 text-white text-xs font-bold flex items-center justify-center shrink-0">4</span>
              <div>
                <strong>{es ? 'Cuando el sub-afiliado vende' : 'When the sub-affiliate sells'}</strong>
                {es
                  ? ' — el sub-afiliado gana 40%, el referrer original gana 10% upline.'
                  : ' — sub-affiliate earns 40%, the original referrer earns 10% upline.'}
              </div>
            </li>
          </ol>
          <Tip>
            {es
              ? 'El admin ve TODA la jerarquía en /admin/finance → tab Árbol. Cada nodo indica cuántos descendientes tiene.'
              : 'Admin sees THE ENTIRE hierarchy at /admin/finance → Tree tab. Each node shows descendant count.'}
          </Tip>
        </>
      ),
    },
    {
      id: 'assistant',
      icon: MessageCircle,
      title: 'Asistente IA',
      title_en: 'AI Assistant',
      content: (es) => (
        <>
          <p className="mb-4">
            {es
              ? 'Chatbot inteligente conectado a tu base de datos (solo lectura). Pregúntale lo que quieras.'
              : 'Smart chatbot connected to your database (read-only). Ask anything.'}
          </p>
          <Step n={1} title={es ? 'Abrirlo' : 'Open it'}>
            {es
              ? 'Click el botón "Asistente" arriba a la derecha del panel, o el botón verde grande en la sidebar.'
              : 'Click "Assistant" button top-right of the panel, or the big green button in the sidebar.'}
          </Step>
          <Step n={2} title={es ? 'Lo que puede hacer' : 'What it can do'}>
            <ul className="mt-2 list-disc list-inside space-y-1">
              <li>{es ? 'Consultar cuántos usuarios, ventas, leads tienes' : 'Tell you how many users, sales, leads you have'}</li>
              <li>{es ? 'Explicarte paso a paso cómo hacer cualquier acción' : 'Walk you through any action step by step'}</li>
              <li>{es ? 'Darte enlaces directos (/admin/products, etc.)' : 'Give you direct links (/admin/products, etc.)'}</li>
              <li>{es ? 'Mostrarte tus pedidos/leads recientes' : 'Show your recent orders/leads'}</li>
              <li>{es ? 'Explicar el modelo de comisiones con ejemplos' : 'Explain the commission model with examples'}</li>
            </ul>
          </Step>
          <Step n={3} title={es ? 'Lo que NO hace' : "What it does NOT do"}>
            {es
              ? 'No modifica datos. Solo lee y explica. Los cambios los haces tú manualmente.'
              : 'Does not modify data. Only reads and explains. You make changes manually.'}
          </Step>
        </>
      ),
    },
  ];

  const filtered = search.trim()
    ? sections.filter((s) => {
        const q = search.toLowerCase();
        const title = (es ? s.title : s.title_en).toLowerCase();
        return title.includes(q) || s.id.includes(q);
      })
    : sections;

  return (
    <div className="space-y-8">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-900 via-slate-900 to-slate-950 p-8 md:p-10 text-white">
        <div className="absolute inset-0 bg-gradient-to-br from-brand-500/10 via-transparent to-transparent" />
        <div className="relative">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.25em] mb-4 ring-1 ring-white/20">
            <BookOpen className="h-3 w-3" />
            {es ? 'Guía de uso' : 'User guide'}
          </div>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-3">
            {es ? 'Todo lo que necesitas saber sobre ILLIUM' : 'Everything you need to know about ILLIUM'}
          </h1>
          <p className="text-slate-300 max-w-2xl">
            {es
              ? 'Guía completa del panel admin, los flujos de cada tipo de usuario, y cómo hacer cualquier cosa paso a paso.'
              : 'Complete guide for the admin panel, user flows, and step-by-step how-to for everything.'}
          </p>
          {/* Search */}
          <div className="mt-6 max-w-md">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={es ? 'Buscar una sección...' : 'Search a section...'}
              className="w-full rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-white placeholder:text-slate-400 px-5 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-400/50"
            />
          </div>
        </div>
      </div>

      {/* Table of contents */}
      <nav className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {sections.map((s) => {
          const Icon = s.icon;
          return (
            <a
              key={s.id}
              href={`#${s.id}`}
              className="group rounded-2xl border border-slate-200 bg-white p-4 hover:border-brand-300 hover:shadow-md transition-all"
            >
              <Icon className="h-5 w-5 text-brand-600 mb-2 group-hover:scale-110 transition-transform" />
              <p className="text-xs font-semibold text-slate-900 leading-tight">
                {es ? s.title : s.title_en}
              </p>
            </a>
          );
        })}
      </nav>

      {/* Sections */}
      <div className="space-y-6">
        {filtered.map((s) => {
          const Icon = s.icon;
          return (
            <section
              key={s.id}
              id={s.id}
              className="scroll-mt-20 rounded-3xl border border-slate-200 bg-white shadow-sm p-6 md:p-8"
            >
              <div className="flex items-start gap-4 mb-5 pb-4 border-b border-slate-100">
                <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center shrink-0">
                  <Icon className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h2 className="text-xl md:text-2xl font-bold text-slate-900 tracking-tight">
                    {es ? s.title : s.title_en}
                  </h2>
                  <p className="text-[11px] font-mono text-slate-400 mt-0.5">#{s.id}</p>
                </div>
              </div>
              <div className="pl-0 md:pl-15">{s.content(es)}</div>
            </section>
          );
        })}
        {filtered.length === 0 && (
          <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center">
            <HelpCircle className="h-8 w-8 text-slate-300 mx-auto mb-3" />
            <p className="text-sm text-slate-500">
              {es ? 'No encontré esa sección. Intenta otro término.' : 'No section found. Try another term.'}
            </p>
          </div>
        )}
      </div>

      {/* Bottom CTA */}
      <div className="rounded-3xl bg-gradient-to-br from-slate-900 to-slate-800 text-white p-8 text-center">
        <Sparkles className="h-8 w-8 text-brand-400 mx-auto mb-3" />
        <h3 className="text-xl font-bold mb-2">
          {es ? '¿Aún tienes dudas?' : 'Still have questions?'}
        </h3>
        <p className="text-sm text-slate-400 mb-5">
          {es
            ? 'Usa el Asistente IA — responde en segundos y ya conoce todo el sistema.'
            : 'Use the AI Assistant — it replies in seconds and knows the whole system.'}
        </p>
        <p className="text-xs text-slate-500">
          {es ? 'Haz clic en "Asistente" arriba a la derecha.' : 'Click "Assistant" at the top right.'}
        </p>
      </div>
    </div>
  );
}

// Silence unused imports kept for future:
void User;
void Shield;
void ImageIcon;
void ArrowRight;
