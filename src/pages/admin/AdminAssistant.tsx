import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { X, Send, Sparkles, Loader2, Database, BookOpen, ExternalLink } from 'lucide-react';
import { collection, getCountFromServer, getDocs, limit as fLimit, query, orderBy, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { groqChatCompletion } from '@/lib/groq';
import { MarkdownMessage } from '@/components/chatbot/MarkdownMessage';
import { useI18n } from '@/i18n/I18nContext';

type Message = { role: 'user' | 'assistant'; content: string };

/** Read-only snapshot of counters + recent data the assistant can reason over. */
type DataSnapshot = {
  users: { total: number; admins: number; workers: number; clients: number };
  products: { total: number; lowStock: number };
  orders: { total: number; pending: number; shipped: number; gross: number };
  leads: { total: number };
  commissions: { direct: number; upline: number };
  recentOrders: Array<{ id: string; total: number; status: string; customer: string }>;
  topProducts: Array<{ name: string; stock: number; price: number; category: string }>;
  recentLeads: Array<{ name: string; email: string; phone: string }>;
};

async function fetchSnapshot(): Promise<DataSnapshot> {
  // Parallel queries for speed
  const [usersSnap, productsSnap, ordersSnap, leadsSnap] = await Promise.all([
    getDocs(collection(db, 'users')),
    getDocs(collection(db, 'products')),
    getDocs(query(collection(db, 'orders'), fLimit(500))),
    getDocs(query(collection(db, 'leads'), fLimit(100))),
  ]);

  const users = usersSnap.docs.map((d) => d.data());
  const products = productsSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Record<string, unknown>));
  const orders = ordersSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Record<string, unknown>));
  const leads = leadsSnap.docs.map((d) => d.data());

  // Settings for rates
  let direct = 0.4;
  let upline = 0.1;
  try {
    const ss = await getDocs(query(collection(db, 'settings'), fLimit(1)));
    ss.forEach((s) => {
      if (s.id === 'general') {
        const d = s.data();
        if (typeof d.commissionDirectRate === 'number') direct = d.commissionDirectRate;
        if (typeof d.commissionUplineRate === 'number') upline = d.commissionUplineRate;
      }
    });
  } catch {
    /* noop */
  }

  const byRole = (r: string) => users.filter((u) => (u.role as string) === r).length;
  const gross = orders.reduce((s, o) => s + (Number(o.total) || 0), 0);
  const pending = orders.filter((o) => String(o.status || 'pending') === 'pending').length;
  const shipped = orders.filter((o) => String(o.fulfillmentStatus || '') === 'shipped').length;
  const lowStock = products.filter((p) => Number(p.stock) < 20).length;

  const recentOrders = orders
    .sort((a, b) => {
      const ta = (a.createdAt as { seconds?: number } | undefined)?.seconds || 0;
      const tb = (b.createdAt as { seconds?: number } | undefined)?.seconds || 0;
      return tb - ta;
    })
    .slice(0, 5)
    .map((o) => {
      const c = (o.customer || {}) as Record<string, string>;
      return {
        id: String(o.id).slice(0, 8),
        total: Number(o.total) || 0,
        status: String(o.status || 'pending'),
        customer: c.name || c.email || '—',
      };
    });

  const topProducts = products.slice(0, 10).map((p) => ({
    name: String(p.name || ''),
    stock: Number(p.stock) || 0,
    price: Number(p.price) || 0,
    category: String(p.category || ''),
  }));

  const recentLeads = leads.slice(0, 5).map((l) => ({
    name: String(l.name || '—'),
    email: String(l.email || '—'),
    phone: String(l.phone || '—'),
  }));

  return {
    users: {
      total: users.length,
      admins: byRole('admin'),
      workers: byRole('worker'),
      clients: byRole('client'),
    },
    products: { total: products.length, lowStock },
    orders: { total: orders.length, pending, shipped, gross },
    leads: { total: leads.length },
    commissions: { direct, upline },
    recentOrders,
    topProducts,
    recentLeads,
  };
}

const QUICK_PROMPTS_ES = [
  '¿Cuántos usuarios tengo?',
  '¿Cómo edito un producto?',
  'Muestra mis ventas recientes',
  '¿Cómo cambio los porcentajes de comisión?',
  '¿Cómo agrego a alguien a la red?',
  'Ver árbol de afiliados',
];
const QUICK_PROMPTS_EN = [
  'How many users do I have?',
  'How do I edit a product?',
  'Show me recent sales',
  'How do I change commission rates?',
  'How do I add someone to the network?',
  'View affiliate tree',
];

interface AdminAssistantProps {
  open: boolean;
  onClose: () => void;
}

export function AdminAssistant({ open, onClose }: AdminAssistantProps) {
  const { locale } = useI18n();
  const es = locale === 'es';
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [snapshot, setSnapshot] = useState<DataSnapshot | null>(null);
  const [refreshingData, setRefreshingData] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  // Fetch data snapshot when opened
  const refreshData = useCallback(async () => {
    setRefreshingData(true);
    try {
      const s = await fetchSnapshot();
      setSnapshot(s);
    } catch (e) {
      console.error('snapshot', e);
    } finally {
      setRefreshingData(false);
    }
  }, []);

  useEffect(() => {
    if (open && !snapshot) {
      void refreshData();
    }
  }, [open, snapshot, refreshData]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // Initial welcome
  useEffect(() => {
    if (messages.length === 0) {
      setMessages([
        {
          role: 'assistant',
          content: es
            ? `👋 **Hola, soy el Asistente IA de ILLIUM.**\n\nPuedo ayudarte con todo el panel: consultar datos, explicarte cómo hacer cualquier cosa, darte enlaces directos a las secciones. Pregúntame lo que quieras.\n\n_Escribe abajo o usa los atajos._`
            : `👋 **Hi, I'm the ILLIUM AI Assistant.**\n\nI can help you with everything in the admin panel: query data, explain how to do anything, give you direct links to sections. Ask me anything.\n\n_Type below or use the shortcuts._`,
        },
      ]);
    }
  }, [es, messages.length]);

  const systemPrompt = useMemo(() => {
    const data = snapshot
      ? `
═══════════════════ LIVE DATA SNAPSHOT (Firestore, read-only) ═══════════════════
USERS:
- Total: ${snapshot.users.total}
- Admins: ${snapshot.users.admins}
- Partners (workers): ${snapshot.users.workers}
- Clients: ${snapshot.users.clients}

PRODUCTS:
- Total in catalog: ${snapshot.products.total}
- Low stock (<20 units): ${snapshot.products.lowStock}
- Top 10 products: ${JSON.stringify(snapshot.topProducts)}

ORDERS:
- Total orders: ${snapshot.orders.total}
- Pending: ${snapshot.orders.pending}
- Shipped: ${snapshot.orders.shipped}
- Gross revenue: $${snapshot.orders.gross.toFixed(2)}
- Recent 5 orders: ${JSON.stringify(snapshot.recentOrders)}

LEADS (quiz responses):
- Total: ${snapshot.leads.total}
- Recent 5: ${JSON.stringify(snapshot.recentLeads)}

COMMISSION RATES (live):
- Direct: ${(snapshot.commissions.direct * 100).toFixed(1)}%
- Upline: ${(snapshot.commissions.upline * 100).toFixed(1)}%
═══════════════════════════════════════════════════════════════════════════════
`
      : '(snapshot loading...)';

    return `You are the ILLIUM Super Admin Copilot. You're the right-hand assistant of the ILLIUM founder who owns this platform. You're warm, direct, and extremely knowledgeable about every corner of the system.

ROLE AND TONE:
- Write like a trusted colleague, not a manual. Use ${es ? 'Spanish (tuteo, informal-pro)' : 'clear professional English'}.
- Be BRIEF by default (80-150 words). Use numbers from the snapshot — cite them specifically.
- Use Markdown: **bold**, bullet lists, numbered steps, and RELATIVE links like [/admin/products](/admin/products).
- When the user asks vague things, clarify with a specific follow-up instead of rambling.
- NEVER make up data. If the snapshot doesn't have it, say so and offer what you can show.

${data}

═══════════════════ PLATFORM COMPLETE KNOWLEDGE BASE ═══════════════════

▼ ADMIN ROUTES (use these as links)
- [/admin](/admin) — Dashboard with KPIs, recent orders, recent leads, products revenue breakdown
- [/admin/finance](/admin/finance) — 3 tabs:
  - Orders: list + edit order status (pending/processing/fulfilled/shipped), tracking number, mark commissions as paid (toggle referrerPayoutStatus and uplinePayoutStatus)
  - Users: list all users + delete
  -🌳 Tree: full affiliate hierarchy with corrected visuals, coronas for roots, descendant counters
- [/admin/products](/admin/products) — Products CRUD. Fields: name (EN), nameEs, description, descriptionEs, benefits (comma-separated EN), benefitsEs, category, price, stock, img URL, image upload drag&drop
- [/admin/leads](/admin/leads) — Quiz leads: edit name/email/phone/status/notes, delete
- [/admin/settings](/admin/settings) — Global config (below)
- [/admin/vendors](/admin/vendors) — Vendors & Customers: search, filter, configure per-vendor commission (3 modes)
- [/admin/inventory](/admin/inventory) — Inventory & Profits: costs, stock adjustments, profit margins, free shipping threshold
- [/admin/sales](/admin/sales) — Sales Register: all sales (online + manual), register direct sales, export CSV
- [/admin/guide](/admin/guide) — Full user guide

▼ /admin/settings SECTIONS (exact order on the page)
1. Owner WhatsApp numbers (multi — array, all receive notifications). "+ Add number" button.
2. Meta WhatsApp API config: phoneNumberId, templateName, templateLang, templateBodyVariables count.
3. 💰 Commission rates: commissionDirectRate (0..1), commissionUplineRate (0..1). Currently ${snapshot ? (snapshot.commissions.direct * 100).toFixed(0) : 40}% / ${snapshot ? (snapshot.commissions.upline * 100).toFixed(0) : 10}%.
4. Brand Logo URL (PNG with transparency).
5. AI prompt (for the PUBLIC chatbot — different from this admin assistant).
6. Hero title/subtitle (EN + ES).
7. Categories section (title + image per category).
8. Payment methods (EN + ES free text).
9. Admin emails (one per line — who can access /admin).

▼ USER ROLES
- "admin": full access to /admin/*. Only super admin (you) should have this.
- "worker": partner/affiliate, has /panel dashboard for their referrals, commissions, sales, referral link.
- "client": regular customer, has /orders to see their purchases and tracking.

Role is stored in users/{uid}.role. Setting /admin access:
- users/{uid}.role === "admin", OR
- user.email in settings/general.adminEmails array.

▼ COMMISSION MODEL (flexible per vendor)
- Global default: Direct ${snapshot ? Math.round(snapshot.commissions.direct * 100) : 40}% / Upline ${snapshot ? Math.round(snapshot.commissions.upline * 100) : 10}%.
- EACH VENDOR can have a CUSTOM commission config at [/admin/vendors](/admin/vendors):
  - Mode "Percentage": vendor earns X% of sale total (e.g. 40%, 30%)
  - Mode "Fixed per unit": vendor earns $X for EACH product sold regardless of which (e.g. $40/unit)
  - Mode "Fixed per product": specific $ amount per product (e.g. BPC-157=$20, NAD+=$30)
- Upline always uses the global upline % — never changes per vendor.
- Example: Maria (40%) refers Juan. Customer uses Maria's link, spends $100. Maria earns $40. Juan earns $10 (upline). You keep $50.
- Example2: Pedro is set to "fixed $25/unit". He sells 3 products. Pedro earns $75 regardless of which products.
- Configure at: [/admin/vendors](/admin/vendors) → click vendor → choose mode → set values → Save.
- Global rates editable at [/admin/settings](/admin/settings).

▼ WHATSAPP AUTOMATION
Cloud Functions (deployed, us-central1):
- waOnUserCreated → illium_new_affiliate (welcomes new partner) + illium_new_referral (notifies their referrer) + illium_admin_new_user (notifies ALL owner numbers)
- waOnOrderCreated → illium_new_sale (direct partner + upline) + illium_admin_new_user (owner)
- waOnOrderUpdated → illium_order_shipped (customer, when fulfillmentStatus='shipped')
- waOnLeadCreated → illium_new_referral (partner if lead used their link)

Templates are created in Meta WABA 104990149152559 and must be APPROVED before sending real messages. Check status: https://business.facebook.com/wa/manage/message-templates/?business_id=104990149152559

The Meta token is stored as Firebase Secret: META_WHATSAPP_TOKEN.

▼ USER FLOWS
1. CLIENT: land on site → (optional quiz) → browse /shop → add to /cart → /checkout → order saved to Firestore (status=pending). Optional register → view /orders. On status=shipped they get WhatsApp.
2. PARTNER: register at /login choosing "Partner" → gets illium_new_affiliate welcome → shares their unique link https://illium.health/?ref={their-uid} → /panel dashboard shows referrals, sales, commissions (40% + 10%), referral tree.
3. SUB-AFFILIATE: enters site with someone else's ?ref= link → localStorage saves referrerId → registers as Partner → referralAncestors chain built (upline all the way up) → their referrer gets illium_new_referral notification. When sub-affiliate sells, they earn 40% AND their immediate referrer earns 10% upline.

▼ PRODUCT CATALOG (13 ILLIUM products)
Categories: metabolic, recovery, nootropics, nad, peptides, blends.
Brand prefix is "ILLIUM" in every display.

▼ COMMON TASKS CHEAT SHEET
- Edit a product → /admin/products → pencil icon → change fields → Save
- Create product → /admin/products → "Add product" → fill → Save
- Change commission rate → /admin/settings → "💰 Porcentajes de comisión" → input values 0..1 (0.40 = 40%) → Save
- Change logo → /admin/settings → "Brand Logo URL" field → paste PNG URL → Save
- Add owner WhatsApp → /admin/settings → "+ Agregar número" → label/country/number → Save
- View full affiliate hierarchy → /admin/finance → tab 🌳 Árbol
- Mark order shipped → /admin/finance → Orders tab → open order → set fulfillmentStatus=shipped + shippingTracking → Save (auto-sends illium_order_shipped)
- Mark commission paid → /admin/finance → Orders tab → toggle referrerPayoutStatus / uplinePayoutStatus to "paid"
- Delete a user → /admin/finance → Users tab → Delete button (removes Firebase Auth + Firestore doc)
- Give another email admin access → /admin/settings → Admin emails textarea → add line → Save
- View quiz leads → /admin/leads
- Edit public chatbot personality → /admin/settings → AI prompt

▼ ANSWER PATTERNS
When asked "how many X": pull from snapshot, cite exact number. E.g. "Tienes ${snapshot?.users.total ?? 'X'} usuarios totales: ${snapshot?.users.workers ?? 'X'} partners y ${snapshot?.users.clients ?? 'X'} clientes."
When asked "show me recent X": list from snapshot.recentOrders / recentLeads / topProducts with brief format.
When asked "how do I do X": give 3-5 numbered steps with the link.
When asked "why isn't X working": check if it's Meta-approval related (templates PENDING), if it's a missing config (e.g. no ownerWhatsappNumbers), or suggest they refresh the snapshot (Database icon).

IMPORTANT: You CAN'T modify anything. Always give the user the steps to do it themselves, never pretend to do it.`;
  }, [snapshot, es]);

  const send = async (text: string) => {
    const t = text.trim();
    if (!t || loading) return;
    const userMsg: Message = { role: 'user', content: t };
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
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-end pointer-events-none">
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-sm pointer-events-auto"
        onClick={onClose}
      />
      <aside className="relative h-full w-full max-w-md flex flex-col bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-white shadow-2xl pointer-events-auto animate-slide-down">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-gradient-to-r from-brand-900/30 to-slate-900">
          <div className="flex items-center gap-3">
            <div className="relative h-10 w-10 rounded-xl bg-gradient-to-br from-brand-500 to-brand-800 flex items-center justify-center shadow-lg">
              <Sparkles className="h-5 w-5 text-white" fill="currentColor" strokeWidth={1.5} />
              <span className="absolute -top-1 -right-1 flex h-3 w-3">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-500"></span>
              </span>
            </div>
            <div>
              <h3 className="font-bold tracking-tight">{es ? 'Asistente ILLIUM' : 'ILLIUM Assistant'}</h3>
              <p className="text-[10px] text-brand-400 font-bold tracking-[0.2em] uppercase">
                {es ? 'Super Admin · IA' : 'Super Admin · AI'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={refreshData}
              title={es ? 'Actualizar datos' : 'Refresh data'}
              className="h-8 w-8 rounded-lg hover:bg-white/10 flex items-center justify-center text-slate-300"
            >
              {refreshingData ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
            </button>
            <Link to="/admin/guide" onClick={onClose} title={es ? 'Guía' : 'Guide'}>
              <button
                type="button"
                className="h-8 w-8 rounded-lg hover:bg-white/10 flex items-center justify-center text-slate-300"
              >
                <BookOpen className="h-4 w-4" />
              </button>
            </Link>
            <button
              type="button"
              onClick={onClose}
              className="h-8 w-8 rounded-lg hover:bg-white/10 flex items-center justify-center text-slate-300"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Live stats bar */}
        {snapshot && (
          <div className="grid grid-cols-4 gap-1 px-5 py-3 border-b border-slate-800 bg-slate-900/60 text-center">
            <div>
              <p className="text-[9px] uppercase tracking-widest text-slate-500 font-semibold">{es ? 'Usuarios' : 'Users'}</p>
              <p className="text-sm font-bold text-white">{snapshot.users.total}</p>
            </div>
            <div>
              <p className="text-[9px] uppercase tracking-widest text-slate-500 font-semibold">{es ? 'Pedidos' : 'Orders'}</p>
              <p className="text-sm font-bold text-white">{snapshot.orders.total}</p>
            </div>
            <div>
              <p className="text-[9px] uppercase tracking-widest text-slate-500 font-semibold">{es ? 'Leads' : 'Leads'}</p>
              <p className="text-sm font-bold text-white">{snapshot.leads.total}</p>
            </div>
            <div>
              <p className="text-[9px] uppercase tracking-widest text-slate-500 font-semibold">{es ? 'Ingresos' : 'Revenue'}</p>
              <p className="text-sm font-bold text-brand-400">${snapshot.orders.gross.toFixed(0)}</p>
            </div>
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
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
                  <div className="prose prose-sm prose-invert max-w-none [&_a]:text-brand-400 [&_a]:font-medium [&_strong]:text-white [&_p]:mb-2 [&_ul]:space-y-1 [&_ul]:my-2 [&_ol]:space-y-1 [&_ol]:my-2 [&_li]:text-slate-300 [&_code]:bg-slate-900 [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-brand-300 [&_code]:text-xs">
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
          <div className="px-5 pb-3 border-t border-slate-800 pt-3">
            <p className="text-[10px] uppercase tracking-widest text-slate-500 font-semibold mb-2">
              {es ? 'Sugerencias' : 'Quick prompts'}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {(es ? QUICK_PROMPTS_ES : QUICK_PROMPTS_EN).map((p) => (
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
          className="border-t border-slate-800 p-3 flex gap-2 bg-slate-900/80"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={es ? 'Pregúntame cualquier cosa...' : 'Ask me anything...'}
            className="flex-1 rounded-full bg-slate-800 border border-slate-700 px-4 py-2.5 text-sm text-white placeholder:text-slate-500 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
          />
          <button
            type="submit"
            disabled={!input.trim() || loading}
            className="h-10 w-10 rounded-full bg-brand-600 hover:bg-brand-500 disabled:opacity-40 flex items-center justify-center shrink-0 transition-colors"
          >
            <Send className="h-4 w-4 text-white" />
          </button>
        </form>

        <div className="px-5 py-2 text-center text-[10px] text-slate-500 border-t border-slate-800">
          <span className="inline-flex items-center gap-1">
            <ExternalLink className="h-3 w-3" />
            {es ? 'Conectado a la base de datos · solo lectura' : 'Connected to database · read-only'}
          </span>
        </div>
      </aside>
    </div>
  );
}

// Unused imports suppressed
void orderBy;
void where;
void getCountFromServer;
