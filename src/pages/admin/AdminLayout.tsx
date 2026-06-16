import { Link, Navigate, Outlet, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Package,
  Users,
  Settings,
  LogOut,
  Wallet,
  MessageSquare,
  BookOpen,
  ExternalLink,
  Menu,
  X,
  BarChart3,
  ShieldCheck,
  Tag,
  Share2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/i18n/I18nContext';
import { useEffect, useState } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { userHasAdminAccess } from '@/lib/adminAccess';
import { AdminAssistant } from './AdminAssistant';

export function AdminLayout() {
  const { t, locale } = useI18n();
  const location = useLocation();
  const [gate, setGate] = useState<'loading' | 'ok' | 'no'>('loading');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [userEmail, setUserEmail] = useState<string>('');
  const [userRole, setUserRole] = useState<string>('');
  const isSuperAdmin = userRole === 'admin';

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setGate('no');
        return;
      }
      setUserEmail(user.email || '');
      try {
        const { getDoc, setDoc, doc: fbDoc } = await import('firebase/firestore');
        const { db: fbDb } = await import('@/lib/firebase');
        const uRef = fbDoc(fbDb, 'users', user.uid);
        const uSnap = await getDoc(uRef);
        const existingRole = uSnap.exists() ? ((uSnap.data().role as string) || '') : '';
        const hasAccess = await userHasAdminAccess(user);
        if (hasAccess && existingRole !== 'admin' && existingRole !== 'subadmin') {
          // Self-heal: promote this admin user so Firestore rules role check passes reliably
          // (avoids case-sensitivity mismatch on adminEmails matching).
          try {
            await setDoc(
              uRef,
              { role: 'admin', email: (user.email || '').toLowerCase(), updatedAt: new Date() },
              { merge: true },
            );
            setUserRole('admin');
          } catch (e) {
            console.warn('Could not auto-promote admin role:', e);
            setUserRole(existingRole);
          }
        } else {
          setUserRole(existingRole);
        }
        setGate(hasAccess ? 'ok' : 'no');
      } catch {
        setGate('no');
      }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  if (gate === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-600 text-sm">
        {t('common.loading')}
      </div>
    );
  }
  if (gate === 'no') {
    return <Navigate to="/login" replace />;
  }

  const es = locale === 'es';

  const allOpsLinks = [
    { name: t('admin.dashboard'), path: '/admin', icon: LayoutDashboard, superOnly: false },
    { name: t('admin.finance'), path: '/admin/finance', icon: Wallet, superOnly: false },
    { name: t('admin.products'), path: '/admin/products', icon: Package, superOnly: false },
    { name: es ? 'Inventario y Ganancias' : 'Inventory & Profits', path: '/admin/inventory', icon: BarChart3, superOnly: true },
    { name: es ? 'Registro de Ventas' : 'Sales Register', path: '/admin/sales', icon: Package, superOnly: true },
    { name: es ? 'Ventas Referidas' : 'Referred Sales', path: '/admin/referrals', icon: Share2, superOnly: false },
    { name: es ? 'Cupones de Descuento' : 'Discount Coupons', path: '/admin/coupons', icon: Tag, superOnly: true },
    { name: es ? 'Vendedores y Clientes' : 'Vendors & Customers', path: '/admin/vendors', icon: Users, superOnly: false },
    { name: es ? 'Pagos a Vendedores' : 'Vendor Payouts', path: '/admin/payouts', icon: BarChart3, superOnly: true },
    { name: t('admin.leads'), path: '/admin/leads', icon: Users, superOnly: false },
    { name: es ? 'Autenticidad' : 'Authenticity', path: '/admin/authenticity', icon: ShieldCheck, superOnly: false },
    { name: es ? 'Clases / Exámenes' : 'Training', path: '/admin/training', icon: BookOpen, superOnly: false },
    { name: es ? 'Contenido diario' : 'Daily Content', path: '/admin/content', icon: BookOpen, superOnly: false },
  ];

  const groups = [
    {
      title: es ? 'Operaciones' : 'Operations',
      links: isSuperAdmin ? allOpsLinks : allOpsLinks.filter((l) => !l.superOnly),
    },
    {
      title: es ? 'Ayuda' : 'Help',
      links: [
        { name: es ? 'Guía de uso' : 'User guide', path: '/admin/guide', icon: BookOpen },
      ],
    },
    {
      title: es ? 'Configuración' : 'Configuration',
      links: [{ name: t('admin.settings'), path: '/admin/settings', icon: Settings }],
    },
  ];

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch {
      /* ignore */
    }
  };

  const initial = (userEmail || 'A').charAt(0).toUpperCase();

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Sidebar */}
      <aside
        className={`${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        } fixed top-0 left-0 h-full w-72 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-slate-300 flex flex-col z-40 transition-transform duration-300 shadow-2xl lg:shadow-none`}
      >
        {/* Brand */}
        <div className="p-6 border-b border-slate-800">
          <Link to="/" className="flex items-center gap-3 group">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-brand-500 to-brand-800 flex items-center justify-center shadow-lg shadow-brand-600/20">
              <span className="text-white font-black text-sm tracking-tighter">I</span>
            </div>
            <div className="flex flex-col">
              <span className="text-white font-black text-sm tracking-[0.25em] uppercase">ILLIUM</span>
              <span className="text-[10px] uppercase tracking-widest text-brand-400 font-semibold">Admin Panel</span>
            </div>
          </Link>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto p-4 space-y-6">
          {groups.map((g) => (
            <div key={g.title}>
              <p className="px-3 mb-2 text-[10px] uppercase tracking-[0.2em] text-slate-500 font-bold">{g.title}</p>
              <div className="space-y-1">
                {g.links.map((link) => {
                  const active = location.pathname === link.path;
                  return (
                    <Link key={link.path} to={link.path} className="block">
                      <div
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-sm font-medium ${
                          active
                            ? 'bg-gradient-to-r from-brand-600/20 to-brand-500/10 text-white ring-1 ring-brand-500/30'
                            : 'text-slate-400 hover:bg-slate-800/60 hover:text-white'
                        }`}
                      >
                        <link.icon className={`w-4 h-4 ${active ? 'text-brand-400' : ''}`} />
                        <span>{link.name}</span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}

          {/* AI Assistant button */}
          <div>
            <p className="px-3 mb-2 text-[10px] uppercase tracking-[0.2em] text-slate-500 font-bold">
              {es ? 'Asistente IA' : 'AI Assistant'}
            </p>
            <button
              type="button"
              onClick={() => setAssistantOpen(true)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium bg-gradient-to-r from-brand-600 to-brand-500 text-white hover:from-brand-500 hover:to-brand-400 transition-all shadow-lg shadow-brand-700/25"
            >
              <MessageSquare className="w-4 h-4" />
              <span>{es ? 'Pregúntale al asistente' : 'Ask the assistant'}</span>
            </button>
            <p className="mt-2 px-3 text-[10px] text-slate-500 leading-relaxed">
              {es
                ? 'Resuelve dudas, consulta datos, obtén guías paso a paso.'
                : 'Get answers, query data, get step-by-step guides.'}
            </p>
          </div>
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 space-y-2">
          <div className="flex items-center gap-2.5 px-2 py-2">
            <div className="h-8 w-8 rounded-full bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center text-white text-xs font-bold">
              {initial}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-white font-semibold truncate">{userEmail}</p>
              <p className="text-[10px] text-brand-400 font-semibold">Super Admin</p>
            </div>
          </div>
          <Link to="/" className="block">
            <Button variant="ghost" className="w-full justify-start text-slate-400 hover:text-white hover:bg-slate-800 h-9 text-xs">
              <ExternalLink className="w-4 h-4 mr-2" /> {es ? 'Ir a la tienda' : 'Go to store'}
            </Button>
          </Link>
          <Button
            variant="ghost"
            onClick={handleLogout}
            className="w-full justify-start text-red-400 hover:text-red-300 hover:bg-red-500/10 h-9 text-xs"
          >
            <LogOut className="w-4 h-4 mr-2" /> {es ? 'Cerrar sesión' : 'Sign out'}
          </Button>
        </div>
      </aside>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main */}
      <div className="flex-1 lg:ml-72 flex flex-col min-h-screen">
        <header className="h-16 bg-white/95 backdrop-blur-md border-b border-slate-200 flex items-center px-4 lg:px-8 justify-between sticky top-0 z-20">
          <button
            type="button"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="lg:hidden p-2 -ml-2 rounded-lg hover:bg-slate-100"
            aria-label="menu"
          >
            {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <div className="flex-1 lg:flex-initial">
            <h2 className="font-bold text-slate-900 text-base lg:text-lg tracking-tight">
              {t('admin.panelTitle')}
            </h2>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setAssistantOpen(true)}
              className="hidden sm:inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-brand-600 to-brand-500 text-white px-4 py-2 text-xs font-semibold shadow-md shadow-brand-700/20 hover:shadow-lg transition-all"
            >
              <MessageSquare className="h-3.5 w-3.5" />
              {es ? 'Asistente' : 'Assistant'}
            </button>
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center text-white font-bold text-sm shadow-md">
              {initial}
            </div>
          </div>
        </header>
        <main className="flex-1 min-w-0 p-4 lg:p-8">
          <Outlet />
        </main>
      </div>

      {/* AI Assistant panel */}
      <AdminAssistant open={assistantOpen} onClose={() => setAssistantOpen(false)} />
    </div>
  );
}
