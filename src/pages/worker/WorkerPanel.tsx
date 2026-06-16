import { useState, useEffect, useRef, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  LogOut,
  Users,
  DollarSign,
  Link as LinkIcon,
  FlaskConical,
  Network,
  Wallet,
  LayoutGrid,
  Calculator,
  ShoppingBag,
  GraduationCap,
  Sparkles,
  Copy as CopyIcon,
} from 'lucide-react';
import { OrderProtocolModal } from '@/components/orders/OrderProtocolModal';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { auth, db } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, query, where, onSnapshot, doc, getDoc, updateDoc } from 'firebase/firestore';
import { buildReferralTree, ReferralTree, type NetworkUser } from '@/components/referral/ReferralTree';
import { useToastStore } from '@/store';
import { useI18n } from '@/i18n/I18nContext';
import { uplineCommission, getDirectRate } from '@/lib/commissions';
import { resolveOrderCommissions } from '@/lib/orderCommission';
import { PeptideCalculator } from '@/pages/PeptideCalculator';
import { WorkerSaleForm } from '@/pages/worker/WorkerSaleForm';
import { WorkerTraining } from '@/pages/worker/WorkerTraining';
import { WorkerDailyContent } from '@/pages/worker/WorkerDailyContent';

type OrderRow = {
  id: string;
  customer?: { name?: string; email?: string };
  total?: number;
  status?: string;
  referrerId?: string | null;
  uplineReferrerId?: string | null;
  items?: { productId?: string; name?: string; price?: number; quantity?: number }[];
  referrerCommissionAmount?: number;
  uplineCommissionAmount?: number;
  referrerPayoutStatus?: string;
  uplinePayoutStatus?: string;
  trackingNumber?: string;
  shippingTracking?: string;
  fulfillmentStatus?: string;
};

type VendorCommissionConfig = {
  mode: string;
  percentage: number;
  fixedAmount: number;
  fixedPerProduct: Record<string, number>;
};

/**
 * The direct (referrer) commission a partner earns on an order.
 * The vendor's CURRENT commission mode is the source of truth: we always recompute
 * from it so the displayed amount matches the tier badge. A partner set to
 * "$40 per unit" always sees $40×units — never a stale percentage that was stored
 * when the order was created under an earlier mode. Only falls back to the stored
 * amount when the vendor's mode hasn't loaded yet.
 */
function directCommissionForOrder(o: OrderRow, vendor: VendorCommissionConfig): number {
  const total = Number(o.total) || 0;
  const items = o.items || [];
  if (vendor.mode === 'fixed_global') {
    const units = items.reduce((s, it) => s + (Number(it.quantity) || 1), 0);
    return Math.round(vendor.fixedAmount * units * 100) / 100;
  }
  if (vendor.mode === 'fixed_per_product') {
    let sum = 0;
    for (const it of items) {
      const amt = Number(vendor.fixedPerProduct[it.productId || '']) || 0;
      sum += amt * (Number(it.quantity) || 1);
    }
    return Math.round(sum * 100) / 100;
  }
  if (vendor.mode === 'percentage') {
    return Math.round(total * vendor.percentage * 100) / 100;
  }
  // Mode not loaded yet — fall back to the stored amount, else the default rate.
  if (typeof o.referrerCommissionAmount === 'number') return o.referrerCommissionAmount;
  return Math.round(total * getDirectRate() * 100) / 100;
}

/**
 * Upline commission for an order: the upline rate (10%) applied to the DIRECT
 * seller's commission (their net earnings), NOT the order total. Recomputed from
 * the seller's stored commission so older orders (which stored 10%×total) display
 * correctly too.
 */
function uplineCommissionForOrder(o: OrderRow): number {
  const base =
    typeof o.referrerCommissionAmount === 'number'
      ? o.referrerCommissionAmount
      : Number(o.total) || 0;
  return uplineCommission(base);
}

type TabKey = 'dashboard' | 'finance' | 'calculator' | 'wholesale' | 'sales' | 'training' | 'content';

export function WorkerPanel() {
  const { t, locale } = useI18n();
  const showToast = useToastStore((s) => s.showToast);
  const [user, setUser] = useState<{ uid: string; email: string | null } | null>(null);
  const [vendorCommission, setVendorCommission] = useState<VendorCommissionConfig>({
    mode: '',
    percentage: 0.4,
    fixedAmount: 0,
    fixedPerProduct: {},
  });
  const [vendorStatus, setVendorStatus] = useState<string>('');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [showTermsPopup, setShowTermsPopup] = useState(false);
  const [showWelcomePopup, setShowWelcomePopup] = useState(false);
  const [ordersDirect, setOrdersDirect] = useState<OrderRow[]>([]);
  const [ordersUpline, setOrdersUpline] = useState<OrderRow[]>([]);
  const [leads, setLeads] = useState<Record<string, unknown>[]>([]);
  const [networkFlat, setNetworkFlat] = useState<Omit<NetworkUser, 'children'>[]>([]);
  const [tab, setTab] = useState<TabKey>('dashboard');
  const [publicSiteUrl, setPublicSiteUrl] = useState<string>('');
  const [wholesaleList, setWholesaleList] = useState<string>('');
  const [protocolOrder, setProtocolOrder] = useState<OrderRow | null>(null);
  /** Admins always see Wholesale; workers only if their user doc has wholesaleAccess=true. */
  const [canSeeWholesale, setCanSeeWholesale] = useState(false);
  const [accessDenied, setAccessDenied] = useState<{ role: string; email: string } | null>(null);
  const [showWholesale, setShowWholesale] = useState(false);
  const navigate = useNavigate();
  const detachRef = useRef<(() => void)[]>([]);

  const orders = useMemo(() => {
    const map = new Map<string, OrderRow>();
    for (const o of ordersDirect) map.set(o.id, o);
    for (const o of ordersUpline) map.set(o.id, o);
    return Array.from(map.values());
  }, [ordersDirect, ordersUpline]);

  const totals = useMemo(() => {
    let directComm = 0;
    let uplineComm = 0;
    if (!user) return { directComm, uplineComm, totalSalesAttributed: 0 };
    for (const o of orders) {
      if (o.referrerId === user.uid) directComm += directCommissionForOrder(o, vendorCommission);
      if (o.uplineReferrerId === user.uid) uplineComm += uplineCommissionForOrder(o);
    }
    const totalSalesAttributed = orders.reduce((acc, o) => acc + (Number(o.total) || 0), 0);
    return {
      directComm: Math.round(directComm * 100) / 100,
      uplineComm: Math.round(uplineComm * 100) / 100,
      totalSalesAttributed,
    };
  }, [orders, user, vendorCommission]);

  const payoutRollup = useMemo(() => {
    if (!user) return { pending: 0, paid: 0 };
    let pending = 0;
    let paid = 0;
    for (const o of orders) {
      // Status comes from the stored payout flags; amounts use the same recomputed
      // values shown everywhere else on the dashboard so the totals always reconcile.
      const c = resolveOrderCommissions(o as unknown as Record<string, unknown>);
      if (o.referrerId === user.uid) {
        const amt = directCommissionForOrder(o, vendorCommission);
        if (c.referrerPayoutStatus === 'pending') pending += amt;
        if (c.referrerPayoutStatus === 'paid') paid += amt;
      }
      if (o.uplineReferrerId === user.uid) {
        const amt = uplineCommissionForOrder(o);
        if (c.uplinePayoutStatus === 'pending') pending += amt;
        if (c.uplinePayoutStatus === 'paid') paid += amt;
      }
    }
    return { pending: Math.round(pending * 100) / 100, paid: Math.round(paid * 100) / 100 };
  }, [orders, user, vendorCommission]);

  const productBreakdown = useMemo(() => {
    if (!user) return [];
    const rows: { name: string; qty: number; revenue: number; commission: number }[] = [];
    const push = (name: string, qty: number, lineRev: number, comm: number) => {
      const i = rows.findIndex((r) => r.name === name);
      if (i >= 0) {
        rows[i].qty += qty;
        rows[i].revenue += lineRev;
        rows[i].commission += comm;
      } else rows.push({ name, qty, revenue: lineRev, commission: comm });
    };

    for (const o of orders) {
      const isDirect = o.referrerId === user.uid;
      const isUpline = o.uplineReferrerId === user.uid;
      const orderComm = isDirect
        ? directCommissionForOrder(o, vendorCommission)
        : isUpline
          ? uplineCommissionForOrder(o)
          : 0;
      if (!orderComm || !o.items?.length) continue;
      // Distribute the order's real commission across its lines, by revenue share.
      const lineRevTotal = o.items.reduce((s, it) => s + (Number(it.price) || 0) * (Number(it.quantity) || 0), 0);
      for (const it of o.items) {
        const qty = Number(it.quantity) || 0;
        const price = Number(it.price) || 0;
        const lineRev = price * qty;
        const frac = lineRevTotal > 0 ? lineRev / lineRevTotal : 0;
        const comm = Math.round(orderComm * frac * 100) / 100;
        push(it.name || 'Product', qty, lineRev, comm);
      }
    }
    return rows.sort((a, b) => b.commission - a.commission);
  }, [orders, user, vendorCommission]);

  useEffect(() => {
    const runDetach = () => {
      detachRef.current.forEach((fn) => fn());
      detachRef.current = [];
    };

    const unsubAuth = onAuthStateChanged(auth, (currentUser) => {
      runDetach();
      if (!currentUser) {
        setUser(null);
        navigate('/login');
        return;
      }

      void (async () => {
        const snap = await getDoc(doc(db, 'users', currentUser.uid));
        const uData = snap.exists() ? snap.data() : {};
        const role = (uData.role as string) ?? '';
        // Load public site URL (admin-configurable, used for referral link)
        try {
          const sSnap = await getDoc(doc(db, 'settings', 'general'));
          const s = sSnap.exists() ? sSnap.data() : {};
          const cfgUrl = String(s.publicSiteUrl || '').trim().replace(/\/$/, '');
          setPublicSiteUrl(cfgUrl);
          setWholesaleList(String(s.wholesaleList || '').trim());
        } catch { /* fall through, will use window.location.origin */ }
        if (role !== 'worker' && role !== 'admin' && role !== 'subadmin') {
          setAccessDenied({ role: role || 'client', email: currentUser.email || '' });
          setUser({ uid: currentUser.uid, email: currentUser.email });
          return;
        }
        // Admins see wholesale unconditionally; workers need the per-user flag.
        setCanSeeWholesale(role === 'admin' || role === 'subadmin' || Boolean(uData.wholesaleAccess));
        // Read vendor commission config
        const cMode = uData.commissionMode ? String(uData.commissionMode) : '';
        const cPct = typeof uData.commissionPercentage === 'number' ? uData.commissionPercentage : 0.4;
        const cFixed = typeof uData.commissionFixedAmount === 'number' ? uData.commissionFixedAmount : 0;
        const cPerProduct = (uData.commissionFixedPerProduct && typeof uData.commissionFixedPerProduct === 'object'
          ? uData.commissionFixedPerProduct
          : {}) as Record<string, number>;
        setVendorCommission({ mode: cMode, percentage: cPct, fixedAmount: cFixed, fixedPerProduct: cPerProduct });
        const vs = String(uData.vendorStatus || 'pending_review');
        setVendorStatus(vs);
        const ta = Boolean(uData.termsAccepted);
        setTermsAccepted(ta);
        if (!ta) setShowTermsPopup(true);
        if (vs === 'active' && !sessionStorage.getItem('illium_welcome_shown')) {
          setShowWelcomePopup(true);
          sessionStorage.setItem('illium_welcome_shown', '1');
        }
        setUser({ uid: currentUser.uid, email: currentUser.email });

        const qDirect = query(collection(db, 'orders'), where('referrerId', '==', currentUser.uid));
        detachRef.current.push(
          onSnapshot(
            qDirect,
            (s) => setOrdersDirect(s.docs.map((d) => ({ id: d.id, ...d.data() } as OrderRow))),
            (err) => console.error('Partner panel: orders direct', err)
          )
        );

        const qUpline = query(collection(db, 'orders'), where('uplineReferrerId', '==', currentUser.uid));
        detachRef.current.push(
          onSnapshot(
            qUpline,
            (s) => setOrdersUpline(s.docs.map((d) => ({ id: d.id, ...d.data() } as OrderRow))),
            (err) => console.error('Partner panel: orders upline', err)
          )
        );

        const qLeads = query(collection(db, 'leads'), where('referrerId', '==', currentUser.uid));
        detachRef.current.push(
          onSnapshot(
            qLeads,
            (s) => setLeads(s.docs.map((d) => ({ id: d.id, ...d.data() }))),
            (err) => console.error('Partner panel: leads listener', err)
          )
        );

        const qNetwork = query(collection(db, 'users'), where('referralAncestors', 'array-contains', currentUser.uid));
        detachRef.current.push(
          onSnapshot(
            qNetwork,
            (s) => {
              const list: Omit<NetworkUser, 'children'>[] = s.docs.map((d) => {
                const x = d.data();
                return {
                  id: d.id,
                  name: x.name as string | undefined,
                  email: x.email as string | undefined,
                  role: x.role as string | undefined,
                  referrerId: (x.referrerId as string | null) ?? null,
                };
              });
              setNetworkFlat(list);
            },
            (err) => console.error('Partner panel: network listener', err)
          )
        );

      })();
    });

    return () => {
      runDetach();
      unsubAuth();
    };
  }, [navigate]);

  const handleLogout = async () => {
    await auth.signOut();
    navigate('/login');
  };

  if (!user) return <div className="p-24 text-center text-slate-500">{t('profile.loading')}</div>;

  // Access-denied screen: clear UX instead of silent redirect
  if (accessDenied) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
        <div className="text-center max-w-md rounded-3xl bg-white shadow-card p-8 border border-slate-200">
          <div className="h-16 w-16 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl">⚠️</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">
            {locale === 'es' ? 'Tu cuenta aún no es Socio/Trabajador' : 'Your account is not yet a Partner/Worker'}
          </h1>
          <p className="text-sm text-slate-600 mb-1">
            {locale === 'es'
              ? `Estás registrado como "${accessDenied.role}" (${accessDenied.email}).`
              : `You are registered as "${accessDenied.role}" (${accessDenied.email}).`}
          </p>
          <p className="text-sm text-slate-500 mb-6">
            {locale === 'es'
              ? 'Pídele al administrador que cambie tu rol a "worker" desde /admin/finance → Usuarios. Luego cierra sesión y vuelve a entrar.'
              : 'Ask the administrator to change your role to "worker" from /admin/finance → Users. Then sign out and sign in again.'}
          </p>
          <div className="flex gap-2 justify-center">
            <Link to="/"><Button variant="outline">{locale === 'es' ? 'Ir al inicio' : 'Go home'}</Button></Link>
            <Button onClick={handleLogout} className="bg-slate-900 text-white">
              {locale === 'es' ? 'Cerrar sesión' : 'Sign out'}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const linkBase = publicSiteUrl || window.location.origin;
  const referralLink = `${linkBase}/?ref=${user.uid}`;
  const treeRoots = buildReferralTree(user.uid, networkFlat);

  /** Tier badge for a direct sale — reflects the partner's actual commission mode
   *  ($X/unit, per-product, or %), instead of the old hardcoded "40% tier". */
  const directTierLabel =
    vendorCommission.mode === 'fixed_global'
      ? `$${vendorCommission.fixedAmount}/${locale === 'es' ? 'unidad' : 'unit'}`
      : vendorCommission.mode === 'fixed_per_product'
        ? (locale === 'es' ? 'Por producto' : 'Per product')
        : vendorCommission.mode === 'percentage'
          ? `${Math.round(vendorCommission.percentage * 100)}% ${locale === 'es' ? 'nivel' : 'tier'}`
          : t('worker.tierDirect');

  const TabBtn = ({ k, label, icon: Icon }: { k: TabKey; label: string; icon: typeof LayoutGrid }) => (
    <button
      type="button"
      onClick={() => setTab(k)}
      className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
        tab === k ? 'bg-blue-600 text-white shadow' : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
      }`}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );

  const acceptTerms = async () => {
    if (!user) return;
    await updateDoc(doc(db, 'users', user.uid), { termsAccepted: true });
    setTermsAccepted(true);
    setShowTermsPopup(false);
  };

  // Blocked / inactive vendors see a message instead of the panel
  if (vendorStatus === 'blocked' || vendorStatus === 'inactive') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <div className="h-16 w-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl">🚫</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">
            {locale === 'es' ? 'Cuenta suspendida' : 'Account suspended'}
          </h1>
          <p className="text-slate-500 mb-6">
            {locale === 'es'
              ? 'Tu cuenta de socio está actualmente inactiva o bloqueada. Contacta al administrador para más información.'
              : 'Your partner account is currently inactive or blocked. Contact the administrator for more information.'}
          </p>
          <Link to="/">
            <Button className="bg-slate-900 text-white rounded-lg px-6">
              {locale === 'es' ? 'Volver al inicio' : 'Back to home'}
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Terms & Conditions popup */}
      {showTermsPopup && !termsAccepted && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-3xl bg-white shadow-2xl p-6 md:p-8 animate-scale-in max-h-[90vh] overflow-y-auto">
            <div className="text-center mb-6">
              <img src="/illium-logo-light.png" alt="ILLIUM" className="h-8 mx-auto mb-4" />
              <h2 className="text-xl font-bold text-slate-900">
                {locale === 'es' ? 'Términos y Condiciones del Socio' : 'Partner Terms & Conditions'}
              </h2>
            </div>
            <div className="bg-slate-50 rounded-2xl p-5 mb-6 text-sm text-slate-700 space-y-3 leading-relaxed">
              <p className="font-bold text-slate-900">
                {locale === 'es' ? 'Al unirte como socio ILLIUM, aceptas:' : 'By joining as an ILLIUM partner, you agree to:'}
              </p>
              <ul className="space-y-2">
                <li className="flex gap-2">
                  <span className="text-brand-600 font-bold shrink-0">1.</span>
                  <span>{locale === 'es'
                    ? 'Estar atento a las comunicaciones del equipo ILLIUM por WhatsApp y correo electrónico.'
                    : 'Stay attentive to ILLIUM team communications via WhatsApp and email.'}</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-brand-600 font-bold shrink-0">2.</span>
                  <span>{locale === 'es'
                    ? 'Compartir en tus redes sociales el contenido que ILLIUM te envíe para apoyar las ventas.'
                    : 'Share on your social media the content ILLIUM sends you to support sales.'}</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-brand-600 font-bold shrink-0">3.</span>
                  <span>{locale === 'es'
                    ? 'No realizar afirmaciones médicas ni promesas de resultados al promocionar los productos.'
                    : 'Not make medical claims or promises of results when promoting products.'}</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-brand-600 font-bold shrink-0">4.</span>
                  <span>{locale === 'es'
                    ? 'Tu cuenta será revisada por el equipo antes de ser activada. Recibirás un correo de confirmación.'
                    : 'Your account will be reviewed by the team before activation. You will receive a confirmation email.'}</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-brand-600 font-bold shrink-0">5.</span>
                  <span>{locale === 'es'
                    ? 'ILLIUM se reserva el derecho de suspender o cancelar tu cuenta de socio si no se cumplen estos términos.'
                    : 'ILLIUM reserves the right to suspend or cancel your partner account if these terms are not met.'}</span>
                </li>
              </ul>
            </div>
            <Button
              onClick={acceptTerms}
              className="w-full bg-brand-600 hover:bg-brand-500 text-white rounded-xl h-12 font-bold text-sm"
            >
              {locale === 'es' ? 'Acepto los términos y condiciones' : 'I accept the terms and conditions'}
            </Button>
            <p className="text-center text-[10px] text-slate-400 mt-3">
              {locale === 'es' ? 'Tu cuenta será revisada antes de ser activada.' : 'Your account will be reviewed before activation.'}
            </p>
          </div>
        </div>
      )}

      {/* Welcome popup — shown once when status becomes active */}
      {showWelcomePopup && vendorStatus === 'active' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-3xl bg-gradient-to-br from-brand-900 to-brand-700 text-white shadow-2xl p-8 text-center animate-scale-in">
            <div className="text-5xl mb-4">🎉</div>
            <h2 className="text-2xl font-bold mb-2">
              {locale === 'es' ? '¡Bienvenido a ILLIUM!' : 'Welcome to ILLIUM!'}
            </h2>
            <p className="text-brand-100 mb-6 leading-relaxed">
              {locale === 'es'
                ? 'Tu cuenta ha sido aprobada. Ahora puedes vender con nosotros, compartir tu enlace de referido y ganar comisiones por cada venta.'
                : 'Your account has been approved. You can now sell with us, share your referral link and earn commissions on every sale.'}
            </p>
            <Button
              onClick={() => setShowWelcomePopup(false)}
              className="bg-white text-brand-900 hover:bg-brand-50 rounded-full h-11 px-8 font-bold"
            >
              {locale === 'es' ? '¡Empezar a vender!' : "Let's start selling!"}
            </Button>
          </div>
        </div>
      )}

      {/* Pending review banner */}
      {vendorStatus === 'pending_review' && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-3 text-center">
          <p className="text-sm text-amber-900 font-semibold flex items-center justify-center gap-2">
            ⏳ {locale === 'es'
              ? 'Tu cuenta está en revisión. El equipo ILLIUM la activará pronto.'
              : 'Your account is under review. The ILLIUM team will activate it soon.'}
          </p>
        </div>
      )}

      <header className="bg-white border-b border-slate-200">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 text-slate-900">
            <FlaskConical className="h-6 w-6 text-blue-600" />
            <span className="font-bold text-lg">{t('worker.partnerPortal')}</span>
          </Link>
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium text-slate-600 hidden sm:inline">
              {t('worker.welcomeUser').replace('{email}', user.email || '')}
            </span>
            <Button variant="ghost" size="sm" onClick={handleLogout}>
              <LogOut className="w-4 h-4 mr-2" /> {t('worker.exit')}
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 container mx-auto px-4 py-8">
        <div className="mb-6 flex flex-wrap gap-2">
          <TabBtn k="dashboard" label={t('worker.dashboard')} icon={LayoutGrid} />
          <TabBtn k="finance" label={t('worker.finance')} icon={Wallet} />
          <TabBtn k="sales" label={locale === 'es' ? 'POS / Registrar venta' : 'POS / Register sale'} icon={DollarSign} />
          {canSeeWholesale && (
            <TabBtn k="wholesale" label={locale === 'es' ? 'Mayorista' : 'Wholesale'} icon={ShoppingBag} />
          )}
          <TabBtn k="training" label={locale === 'es' ? 'Cursos' : 'Training'} icon={GraduationCap} />
          <TabBtn k="content" label={locale === 'es' ? 'Contenido diario' : 'Daily content'} icon={Sparkles} />
          <TabBtn k="calculator" label={t('worker.calculator')} icon={Calculator} />
          <Link to="/profile" className="ml-auto">
            <Button variant="outline" size="sm">
              {t('profile.title')}
            </Button>
          </Link>
        </div>

        {tab === 'calculator' && (
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <PeptideCalculator />
          </div>
        )}

        {tab === 'wholesale' && canSeeWholesale && (
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ShoppingBag className="w-5 h-5 text-blue-600" />
                  {locale === 'es' ? 'Lista al por mayor' : 'Wholesale list'}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {!wholesaleList ? (
                  <p className="text-sm text-slate-500 italic">
                    {locale === 'es'
                      ? 'El administrador todavía no ha publicado la lista de mayoreo.'
                      : 'The administrator has not published the wholesale list yet.'}
                  </p>
                ) : (
                  <>
                    <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                      <input
                        type="checkbox"
                        checked={showWholesale}
                        onChange={(e) => setShowWholesale(e.target.checked)}
                        className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                      />
                      {locale === 'es' ? 'Ver lista al por mayor' : 'Show wholesale list'}
                    </label>
                    {showWholesale && (
                      <>
                        <pre className="whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm font-mono text-slate-800 max-h-[60vh] overflow-y-auto">{wholesaleList}</pre>
                        <Button
                          type="button"
                          size="sm"
                          className="bg-emerald-600 hover:bg-emerald-500 text-white"
                          onClick={() => {
                            void navigator.clipboard
                              .writeText(wholesaleList)
                              .then(() => showToast(locale === 'es' ? 'Lista copiada' : 'List copied'))
                              .catch(() => showToast(locale === 'es' ? 'No se pudo copiar' : 'Could not copy'));
                          }}
                        >
                          <CopyIcon className="w-4 h-4 mr-2" />
                          {locale === 'es' ? 'Copiar lista para WhatsApp' : 'Copy list for WhatsApp'}
                        </Button>
                      </>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {tab === 'sales' && user && (
          <WorkerSaleForm uid={user.uid} email={user.email || ''} locale={locale} showToast={showToast} />
        )}

        {tab === 'training' && user && (
          <WorkerTraining uid={user.uid} locale={locale} showToast={showToast} />
        )}

        {tab === 'content' && (
          <WorkerDailyContent locale={locale} showToast={showToast} />
        )}

        {tab === 'finance' && (
          <div className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardContent className="p-5">
                  <p className="text-xs font-medium text-slate-500">{t('worker.totalDirectCommissions')}</p>
                  <p className="mt-1 text-2xl font-bold text-slate-900">${totals.directComm.toFixed(2)}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-5">
                  <p className="text-xs font-medium text-slate-500">{t('worker.totalUplineCommissions')}</p>
                  <p className="mt-1 text-2xl font-bold text-slate-900">${totals.uplineComm.toFixed(2)}</p>
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardContent className="p-5">
                  <p className="text-xs font-medium text-amber-800">{t('worker.pendingCommissions')}</p>
                  <p className="mt-1 text-2xl font-bold text-amber-700">${payoutRollup.pending.toFixed(2)}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-5">
                  <p className="text-xs font-medium text-emerald-800">{t('worker.paidCommissions')}</p>
                  <p className="mt-1 text-2xl font-bold text-emerald-700">${payoutRollup.paid.toFixed(2)}</p>
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <Card>
                <CardHeader>
                  <CardTitle>{t('worker.incomeFromOrders')}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {orders.map((order) => {
                    const total = Number(order.total) || 0;
                    const isDirect = order.referrerId === user.uid;
                    const isUpline = order.uplineReferrerId === user.uid;
                    const comm = isDirect ? directCommissionForOrder(order, vendorCommission) : isUpline ? uplineCommissionForOrder(order) : 0;
                    if (!comm) return null;
                    const c = resolveOrderCommissions(order as unknown as Record<string, unknown>);
                    const payoutSt = isDirect ? c.referrerPayoutStatus : c.uplinePayoutStatus;
                    const payoutLabel =
                      payoutSt === 'paid'
                        ? t('worker.statusPaid')
                        : payoutSt === 'pending'
                          ? t('worker.statusPending')
                          : t('worker.statusNa');
                    return (
                      <div key={order.id} className="flex justify-between gap-4 border-b border-slate-100 py-3 last:border-0">
                        <div>
                          <p className="font-medium text-slate-900">{order.customer?.name || '—'}</p>
                          <p className="text-xs text-slate-500">{order.customer?.email}</p>
                          <p className="mt-1 text-[11px] font-semibold uppercase text-blue-700">
                            {isDirect ? t('worker.orderDirect') : t('worker.orderUpline')}
                          </p>
                          <p className="mt-1 text-xs text-slate-600">
                            {t('worker.orderPayment')}: <span className="font-medium uppercase">{order.status || '—'}</span>
                            {' · '}
                            {t('worker.orderDispatch')}:{' '}
                            <span className="font-medium uppercase">
                              {(order as { fulfillmentStatus?: string }).fulfillmentStatus || '—'}
                            </span>
                          </p>
                          <p className="mt-0.5 text-xs text-slate-600">
                            {isDirect ? t('worker.payoutDirect') : t('worker.payoutUpline')}: {payoutLabel}
                          </p>
                          <ul className="mt-2 space-y-1 text-xs text-slate-600">
                            {(order.items || []).map((it, idx) => (
                              <li key={idx}>
                                {(it.quantity || 0)}× {it.name} — ${((it.price || 0) * (it.quantity || 0)).toFixed(2)}
                              </li>
                            ))}
                          </ul>
                          {(order.items || []).length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => setProtocolOrder(order)}
                                className="inline-flex items-center gap-1 rounded-full bg-brand-50 hover:bg-brand-100 border border-brand-200 px-3 py-1 text-[11px] font-bold text-brand-700"
                              >
                                <Sparkles className="h-3 w-3" />
                                {locale === 'es' ? 'Ver protocolo IA' : 'View AI protocol'}
                              </button>
                              {(() => {
                                const t = String(order.trackingNumber || order.shippingTracking || '').trim();
                                if (!t) return null;
                                return (
                                  <a
                                    href={`https://tools.usps.com/go/TrackConfirmAction?qtc_tLabels1=${encodeURIComponent(t.replace(/\s+/g, ''))}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 rounded-full bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-3 py-1 text-[11px] font-bold text-emerald-700"
                                  >
                                    🔍 {locale === 'es' ? `Rastrear (${t.slice(-6)})` : `Track (${t.slice(-6)})`}
                                  </a>
                                );
                              })()}
                            </div>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm text-slate-500">{t('worker.saleTotal')}</p>
                          <p className="font-bold text-slate-900">${total.toFixed(2)}</p>
                          <p className="mt-2 text-sm text-emerald-600">
                            {t('worker.commission')}:{' '}
                            {t('worker.commissionLine').replace('{amount}', `$${comm.toFixed(2)}`)}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                  {orders.length === 0 && <p className="text-sm text-slate-500">{t('worker.noOrders')}</p>}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>{t('worker.perProductTitle')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-slate-500 border-b">
                          <th className="py-2 pr-2">{t('worker.colProduct')}</th>
                          <th className="py-2 pr-2">{t('worker.colQty')}</th>
                          <th className="py-2 pr-2">{t('worker.colRevenue')}</th>
                          <th className="py-2">{t('worker.colCommission')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {productBreakdown.map((r) => (
                          <tr key={r.name} className="border-b border-slate-100">
                            <td className="py-2 pr-2 font-medium text-slate-900">{r.name}</td>
                            <td className="py-2 pr-2">{r.qty}</td>
                            <td className="py-2 pr-2">${r.revenue.toFixed(2)}</td>
                            <td className="py-2 text-emerald-700 font-semibold">${r.commission.toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {productBreakdown.length === 0 && (
                    <p className="text-sm text-slate-500">{t('worker.noAttributedLines')}</p>
                  )}
                </CardContent>
              </Card>
            </div>

          </div>
        )}

        {tab === 'dashboard' && (
          <>
            <div className="mb-8">
              <h1 className="text-2xl font-bold text-slate-900 mb-2">{t('worker.dashboardTitle')}</h1>
              <div className="flex flex-wrap gap-2 mt-1">
                {vendorCommission.mode ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-100 text-brand-800 text-xs font-bold px-3 py-1">
                    💰 {vendorCommission.mode === 'percentage'
                      ? `${Math.round(vendorCommission.percentage * 100)}% direct`
                      : vendorCommission.mode === 'fixed_global'
                      ? `$${vendorCommission.fixedAmount} per unit`
                      : 'Fixed per product'}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 text-amber-800 text-xs font-bold px-3 py-1">
                    ⏳ In review
                  </span>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center text-blue-600">
                      <DollarSign className="w-6 h-6" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-500">
                        {!vendorCommission.mode
                          ? 'Commissions (in review)'
                          : vendorCommission.mode === 'percentage'
                          ? `Commissions (${Math.round(vendorCommission.percentage * 100)}%)`
                          : vendorCommission.mode === 'fixed_global'
                          ? `Commissions ($${vendorCommission.fixedAmount}/unit)`
                          : 'Commissions (custom)'}
                      </p>
                      <h3 className="text-2xl font-bold text-slate-900">
                        ${(totals.directComm + totals.uplineComm).toFixed(2)}
                      </h3>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center text-emerald-600">
                      <Users className="w-6 h-6" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-500">{t('worker.activeLeads')}</p>
                      <h3 className="text-2xl font-bold text-slate-900">{leads.length}</h3>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center text-purple-600">
                      <LinkIcon className="w-6 h-6" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-slate-500 mb-1">{t('worker.referralLinkLabel')}</p>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          readOnly
                          value={referralLink}
                          className="text-xs bg-slate-100 border-none rounded px-2 py-1 w-full outline-none"
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            void navigator.clipboard
                              .writeText(referralLink)
                          .then(() => showToast(t('worker.linkCopied')))
                          .catch(() => showToast(t('worker.linkCopyFail')));
                          }}
                        >
                          {t('worker.copy')}
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <Card>
                <CardHeader>
                  <CardTitle>{t('worker.recentSales')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {orders.map((order) => {
                      const o = order;
                      const total = Number(o.total) || 0;
                      const isDirect = o.referrerId === user.uid;
                      const isUpline = o.uplineReferrerId === user.uid;
                      const comm = isDirect ? directCommissionForOrder(o, vendorCommission) : isUpline ? uplineCommissionForOrder(o) : 0;
                      if (!comm) return null;
                      const c = resolveOrderCommissions(o as unknown as Record<string, unknown>);
                      const payoutSt = isDirect ? c.referrerPayoutStatus : c.uplinePayoutStatus;
                      const payoutLabel =
                        payoutSt === 'paid'
                          ? t('worker.statusPaid')
                          : payoutSt === 'pending'
                            ? t('worker.statusPending')
                            : t('worker.statusNa');
                      return (
                        <div key={o.id} className="flex justify-between items-center py-2 border-b last:border-0">
                          <div>
                            <p className="font-medium text-slate-900">
                              {t('worker.orderFrom').replace('{name}', o.customer?.name || '—')}
                            </p>
                            <p className="text-sm text-slate-500">{o.customer?.email}</p>
                            <p className="text-[11px] font-semibold text-blue-700 mt-1">
                              {isDirect ? directTierLabel : t('worker.tierUpline')}
                            </p>
                            <p className="text-[11px] text-slate-500 mt-0.5">
                              {t('worker.payoutStatus')}: {payoutLabel}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="font-bold text-slate-900">${total.toFixed(2)}</p>
                            <p className="text-sm text-emerald-600">
                              {t('worker.commissionLine').replace('{amount}', `$${comm.toFixed(2)}`)}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                    {orders.length === 0 && <p className="text-sm text-slate-500">{t('worker.noSalesLink')}</p>}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Network className="w-5 h-5 text-blue-600" /> {t('worker.networkTreeTitle')}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-slate-500 mb-4">{t('worker.networkTreeHint')}</p>

                  <div className="rounded-xl border border-slate-200 bg-gradient-to-b from-slate-50 to-white p-4 overflow-x-auto">
                    <div className="mb-4 inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white">
                      <span className="h-2 w-2 rounded-full bg-emerald-400" />
                      {t('worker.youRoot')}
                    </div>
                    {treeRoots.length > 0 ? (
                      <ReferralTree roots={treeRoots} />
                    ) : (
                      <div className="text-center py-10 bg-slate-50 rounded-lg border border-dashed border-slate-300">
                        <Network className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                        <p className="text-sm text-slate-500">{t('worker.noDownline')}</p>
                        <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">{t('worker.noDownlineHint')}</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </main>
      {protocolOrder && (
        <OrderProtocolModal
          open={!!protocolOrder}
          onClose={() => setProtocolOrder(null)}
          order={protocolOrder}
        />
      )}
    </div>
  );
}
