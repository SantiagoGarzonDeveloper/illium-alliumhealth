import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { auth, db } from '@/lib/firebase';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { Package, Clock, CheckCircle2, Truck, ShoppingBag, AlertCircle } from 'lucide-react';
import { useI18n } from '@/i18n/I18nContext';

type OrderItem = {
  productId: string;
  name: string;
  quantity: number;
  price: number;
};

type Order = {
  id: string;
  createdAt?: { seconds: number };
  customer?: { name?: string; email?: string };
  items?: OrderItem[];
  total?: number;
  status?: string;
  fulfillmentStatus?: string;
  trackingNumber?: string;
};

function statusLabel(status: string | undefined, locale: string) {
  const s = (status || 'pending').toLowerCase();
  const es = locale === 'es';
  const map: Record<string, { label: string; color: string; icon: any }> = {
    pending: { label: es ? 'Pendiente' : 'Pending', color: 'bg-amber-100 text-amber-700 border-amber-200', icon: Clock },
    processing: { label: es ? 'Procesando' : 'Processing', color: 'bg-blue-100 text-blue-700 border-blue-200', icon: Package },
    fulfilled: { label: es ? 'Preparado' : 'Fulfilled', color: 'bg-indigo-100 text-indigo-700 border-indigo-200', icon: Package },
    shipped: { label: es ? 'Enviado' : 'Shipped', color: 'bg-emerald-100 text-emerald-700 border-emerald-200', icon: Truck },
    delivered: { label: es ? 'Entregado' : 'Delivered', color: 'bg-brand-100 text-brand-800 border-brand-200', icon: CheckCircle2 },
    cancelled: { label: es ? 'Cancelado' : 'Cancelled', color: 'bg-red-100 text-red-700 border-red-200', icon: AlertCircle },
  };
  return map[s] || map.pending;
}

export function MyOrders() {
  const { locale } = useI18n();
  const [user, setUser] = useState<User | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [authReady, setAuthReady] = useState(false);
  const es = locale === 'es';

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!user?.email && !user?.uid) {
      setOrders([]);
      setLoading(false);
      return;
    }

    // Match orders by customer.email (any case) OR customerUid. Two subscriptions,
    // results merged client-side. This catches orders saved with a different
    // email casing AND orders from the Stripe flow where customerUid was set.
    const seen = new Map<string, Order>();
    const update = () => {
      const rows = Array.from(seen.values());
      rows.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setOrders(rows);
      setLoading(false);
    };

    const subs: Array<() => void> = [];
    const userEmail = (user.email || '').trim();
    if (userEmail) {
      // Lower-case variant.
      subs.push(
        onSnapshot(
          query(collection(db, 'orders'), where('customer.email', '==', userEmail)),
          (snap) => {
            snap.forEach((d) => seen.set(d.id, { id: d.id, ...(d.data() as any) }));
            update();
          },
          (err) => console.warn('orders by email lower', err),
        ),
      );
      // Upper-case as some legacy orders were saved capitalized.
      const upper = userEmail.toUpperCase();
      if (upper !== userEmail) {
        subs.push(
          onSnapshot(
            query(collection(db, 'orders'), where('customer.email', '==', upper)),
            (snap) => {
              snap.forEach((d) => seen.set(d.id, { id: d.id, ...(d.data() as any) }));
              update();
            },
            (err) => console.warn('orders by email upper', err),
          ),
        );
      }
    }
    if (user.uid) {
      subs.push(
        onSnapshot(
          query(collection(db, 'orders'), where('customerUid', '==', user.uid)),
          (snap) => {
            snap.forEach((d) => seen.set(d.id, { id: d.id, ...(d.data() as any) }));
            update();
          },
          (err) => console.warn('orders by uid', err),
        ),
      );
    }

    return () => subs.forEach((u) => u());
  }, [user?.email, user?.uid]);

  if (!authReady) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center text-slate-500">
        {es ? 'Cargando...' : 'Loading...'}
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-4">
        <ShoppingBag className="h-12 w-12 text-slate-300 mb-4" />
        <h2 className="text-xl font-bold text-slate-900 mb-2">
          {es ? 'Inicia sesión para ver tus pedidos' : 'Sign in to view your orders'}
        </h2>
        <Link
          to="/login"
          className="mt-4 inline-flex items-center gap-2 rounded-full bg-brand-700 text-white px-6 py-2.5 text-sm font-semibold hover:bg-brand-800"
        >
          {es ? 'Iniciar sesión' : 'Sign in'}
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50/50 py-10 md:py-16">
      <div className="container mx-auto px-4 max-w-4xl">
        <div className="mb-8">
          <h1 className="text-3xl md:text-4xl font-bold text-slate-900 tracking-tight">
            {es ? 'Mis pedidos' : 'My orders'}
          </h1>
          <p className="mt-2 text-slate-500 text-sm">
            {es ? 'Consulta el estado de tus pedidos en ILLIUM.' : 'Check the status of your orders at ILLIUM.'}
          </p>
        </div>

        {loading ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-slate-500">
            {es ? 'Cargando pedidos...' : 'Loading orders...'}
          </div>
        ) : orders.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center">
            <ShoppingBag className="h-12 w-12 text-slate-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-slate-900 mb-2">
              {es ? 'Aún no tienes pedidos' : 'No orders yet'}
            </h3>
            <p className="text-sm text-slate-500 mb-6">
              {es ? 'Cuando realices una compra, aparecerá aquí.' : 'When you make a purchase, it will appear here.'}
            </p>
            <Link
              to="/shop"
              className="inline-flex items-center gap-2 rounded-full bg-brand-700 text-white px-6 py-2.5 text-sm font-semibold hover:bg-brand-800"
            >
              {es ? 'Ir a la tienda' : 'Go to shop'}
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {orders.map((order) => {
              const status = statusLabel(order.fulfillmentStatus || order.status, locale);
              const StatusIcon = status.icon;
              const date = order.createdAt?.seconds
                ? new Date(order.createdAt.seconds * 1000).toLocaleDateString(locale === 'es' ? 'es-ES' : 'en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                  })
                : '';

              return (
                <div key={order.id} className="rounded-2xl border border-slate-200 bg-white overflow-hidden hover:shadow-card transition-all">
                  {/* Header */}
                  <div className="flex items-center justify-between bg-slate-50 px-5 py-3 border-b border-slate-100">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4">
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
                          {es ? 'Pedido' : 'Order'}
                        </p>
                        <p className="text-sm font-mono font-semibold text-slate-900">#{order.id.slice(0, 8).toUpperCase()}</p>
                      </div>
                      {date && (
                        <div className="hidden sm:block">
                          <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
                            {es ? 'Fecha' : 'Date'}
                          </p>
                          <p className="text-sm text-slate-700">{date}</p>
                        </div>
                      )}
                    </div>
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold border ${status.color}`}>
                      <StatusIcon className="h-3 w-3" />
                      {status.label}
                    </span>
                  </div>

                  {/* Items */}
                  <div className="px-5 py-4">
                    <ul className="space-y-2">
                      {(order.items || []).map((item, i) => (
                        <li key={i} className="flex items-center justify-between text-sm">
                          <span className="text-slate-700">
                            {item.quantity}× {item.name}
                          </span>
                          <span className="font-medium text-slate-900">${(item.price * item.quantity).toFixed(2)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Footer */}
                  <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 border-t border-slate-100 bg-white">
                    {order.trackingNumber ? (
                      <div className="flex flex-col gap-1.5">
                        <div className="text-xs text-slate-500">
                          <span className="font-semibold">{es ? 'Tracking: ' : 'Tracking: '}</span>
                          <span className="font-mono text-slate-700">{order.trackingNumber}</span>
                        </div>
                        <a
                          href={`https://tools.usps.com/go/TrackConfirmAction?qtc_tLabels1=${encodeURIComponent(order.trackingNumber.replace(/\s+/g, ''))}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500 hover:bg-emerald-400 text-white text-[11px] font-bold px-3 py-1.5 w-fit"
                        >
                          🔍 {es ? 'Rastrear envío' : 'Track shipment'}
                        </a>
                      </div>
                    ) : (
                      <div />
                    )}
                    <div className="text-right">
                      <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
                        {es ? 'Total' : 'Total'}
                      </p>
                      <p className="text-lg font-bold text-slate-900">${(order.total || 0).toFixed(2)}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
