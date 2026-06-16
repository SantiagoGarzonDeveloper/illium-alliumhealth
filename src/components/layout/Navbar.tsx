import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ShoppingCart, Menu, X, User, LayoutDashboard, ChevronRight, LogOut, UserCircle, ShoppingBag, Shield, ChevronDown } from 'lucide-react';
import { useAppStore } from '@/store';
import { Button } from '../ui/button';
import { auth, db } from '@/lib/firebase';
import { useEffect, useState, useRef } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { userHasAdminAccess } from '@/lib/adminAccess';
import { useI18n } from '@/i18n/I18nContext';
import { markLocaleExplicitChoice } from '@/components/gates/LanguageAgeGates';
import type { Locale } from '@/i18n/translations';

export function Navbar() {
  const { t, locale, setLocale } = useI18n();
  const location = useLocation();
  const cart = useAppStore((state) => state.cart);
  const cartCount = cart.reduce((acc, item) => acc + item.quantity, 0);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [firestoreRole, setFirestoreRole] = useState<string | null>(null);
  const [canAccessAdmin, setCanAccessAdmin] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string>('');
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [userName, setUserName] = useState<string>('');
  const userMenuRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setUserMenuOpen(false);
      navigate('/');
    } catch (err) {
      console.error('Logout failed', err);
    }
  };

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'settings', 'general'), (snap) => {
      if (snap.exists() && snap.data().logoUrl) {
        setLogoUrl(snap.data().logoUrl as string);
      }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (!user) {
        setFirestoreRole(null);
        setCanAccessAdmin(false);
        return;
      }
      try {
        const snap = await getDoc(doc(db, 'users', user.uid));
        if (snap.exists()) {
          const d = snap.data();
          setFirestoreRole((d.role as string) ?? null);
          setUserName((d.name as string) || user.email || '');
        } else {
          setFirestoreRole(null);
          setUserName(user.email || '');
        }
        setCanAccessAdmin(await userHasAdminAccess(user));
      } catch {
        setFirestoreRole(null);
        setCanAccessAdmin(false);
      }
    });
    return () => unsub();
  }, []);

  const switchLocale = (l: Locale) => {
    setLocale(l);
    markLocaleExplicitChoice();
  };

  const isActive = (path: string) => location.pathname === path;

  const navLinks = [
    { to: '/shop', label: t('nav.products') },
    { to: '/quiz', label: locale === 'es' ? 'Encuentra compuestos para tu investigación' : 'Find Compounds for Your Research' },
    { to: '/consulta', label: locale === 'es' ? 'Consultoría' : 'Consulting' },
    { to: '/lab-results', label: locale === 'es' ? 'Resultados de lab' : 'Lab Results' },
    { to: '/calculator', label: locale === 'es' ? 'Calculadora' : 'Research Calculator' },
  ];

  return (
    <>
      <nav className={`sticky top-0 z-50 transition-all duration-300 ${
        scrolled
          ? 'bg-white/95 backdrop-blur-xl shadow-sm border-b border-slate-200/50'
          : 'bg-white/80 backdrop-blur-md border-b border-slate-100'
      }`}>
        <div className="container mx-auto px-4 h-16 flex items-center justify-between gap-2">
          {/* Logo */}
          <Link to="/" className="flex items-center shrink-0 group">
            <img
              src={logoUrl || '/illium-logo-light.png'}
              alt="ILLIUM"
              className="h-9 sm:h-10 w-auto transition-all duration-300 group-hover:scale-105"
              onError={(e) => { (e.currentTarget as HTMLImageElement).src = '/illium-logo-light.png'; }}
            />
          </Link>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center space-x-1">
            {navLinks.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive(link.to)
                    ? 'text-brand-700 bg-brand-50'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`}
              >
                {link.label}
              </Link>
            ))}
            {/* Admin link hidden from public navbar to look professional */}
          </div>

          {/* Right side */}
          <div className="flex items-center gap-1 shrink-0">
            {/* Language toggle — same ES/EN pill on mobile and desktop. */}
            <div className="flex items-center rounded-lg border border-slate-200 bg-slate-50 p-0.5 shrink-0">
              <button
                type="button"
                aria-label="Español"
                className={`rounded-md px-2 py-1 text-[11px] sm:text-xs font-semibold transition-all ${locale === 'es' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-400 hover:text-slate-600'}`}
                onClick={() => switchLocale('es')}
              >
                ES
              </button>
              <button
                type="button"
                aria-label="English"
                className={`rounded-md px-2 py-1 text-[11px] sm:text-xs font-semibold transition-all ${locale === 'en' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-400 hover:text-slate-600'}`}
                onClick={() => switchLocale('en')}
              >
                EN
              </button>
            </div>

            {/* Sign-in button only shown when NOT logged in — no duplicate */}

            {currentUser ? (
              <div className="relative" ref={userMenuRef}>
                <button
                  type="button"
                  onClick={() => setUserMenuOpen(!userMenuOpen)}
                  className="flex items-center gap-2 rounded-full pl-1 pr-2 py-1 hover:bg-slate-100 transition-colors"
                >
                  {currentUser.photoURL ? (
                    <img src={currentUser.photoURL} alt="" className="w-8 h-8 rounded-full object-cover ring-2 ring-brand-200" />
                  ) : (
                    <div className="flex items-center justify-center h-8 w-8 rounded-full bg-gradient-to-br from-brand-600 to-brand-800 text-white font-bold text-sm">
                      {(userName || 'U').charAt(0).toUpperCase()}
                    </div>
                  )}
                  <ChevronDown className={`h-3.5 w-3.5 text-slate-500 transition-transform ${userMenuOpen ? 'rotate-180' : ''}`} />
                </button>

                {userMenuOpen && (
                  <div className="absolute right-0 top-full mt-2 w-64 rounded-2xl border border-slate-200 bg-white shadow-elevated animate-scale-in overflow-hidden">
                    <div className="px-4 py-3 border-b border-slate-100 bg-gradient-to-br from-brand-50 to-white">
                      <p className="text-sm font-bold text-slate-900 truncate">{userName}</p>
                      <p className="text-xs text-slate-500 truncate">{currentUser.email}</p>
                      {firestoreRole && (
                        <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-brand-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                          {firestoreRole === 'worker' ? 'Partner' : firestoreRole === 'admin' ? 'Admin' : 'Customer'}
                        </span>
                      )}
                    </div>

                    <div className="p-1.5">
                      <Link
                        to="/profile"
                        onClick={() => setUserMenuOpen(false)}
                        className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50"
                      >
                        <UserCircle className="h-4 w-4 text-slate-500" />
                        {t('nav.profile')}
                      </Link>

                      {(firestoreRole === 'worker' || firestoreRole === 'admin') && (
                        <Link
                          to="/panel"
                          onClick={() => setUserMenuOpen(false)}
                          className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50"
                        >
                          <LayoutDashboard className="h-4 w-4 text-brand-600" />
                          {t('nav.partnerPortal')}
                        </Link>
                      )}

                      <Link
                        to="/orders"
                        onClick={() => setUserMenuOpen(false)}
                        className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50"
                      >
                        <ShoppingBag className="h-4 w-4 text-slate-500" />
                        {locale === 'es' ? 'Mis pedidos' : 'My orders'}
                      </Link>

                      {/* Admin link shown ONLY to users who are workers+in adminEmails list,
                          OR who have role==='admin'. Prevents partners from seeing general admin. */}
                      {canAccessAdmin && firestoreRole !== 'worker' && firestoreRole !== 'client' && (
                        <Link
                          to="/admin"
                          onClick={() => setUserMenuOpen(false)}
                          className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium text-brand-700 hover:bg-brand-50"
                        >
                          <Shield className="h-4 w-4 text-brand-600" />
                          {t('nav.admin')}
                        </Link>
                      )}
                    </div>

                    <div className="p-1.5 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={handleLogout}
                        className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium text-red-600 hover:bg-red-50"
                      >
                        <LogOut className="h-4 w-4" />
                        {locale === 'es' ? 'Cerrar sesión' : 'Sign out'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <Link to="/login" title={t('nav.signIn')}>
                <Button variant="outline" size="sm" className="rounded-full text-xs font-semibold h-9 px-3 sm:px-4 border-slate-200 gap-1.5">
                  <User className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{t('nav.signIn')}</span>
                </Button>
              </Link>
            )}

            <Link to="/cart" className="relative">
              <Button variant="ghost" size="icon" className="rounded-lg">
                <ShoppingCart className="h-5 w-5 text-slate-600" />
                {cartCount > 0 && (
                  <span className="absolute top-0.5 right-0.5 bg-brand-600 text-white text-[10px] font-bold h-4 min-w-[16px] px-0.5 rounded-full flex items-center justify-center shadow-sm">
                    {cartCount}
                  </span>
                )}
              </Button>
            </Link>

            {/* Mobile menu toggle */}
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden rounded-lg"
              onClick={() => setMobileOpen(!mobileOpen)}
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
          </div>
        </div>
      </nav>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="fixed inset-0 top-16 z-40 md:hidden animate-fade-in">
          <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <div className="relative bg-white border-b border-slate-200 shadow-elevated animate-slide-down">
            <div className="container mx-auto px-4 py-4 space-y-1">
              {navLinks.map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  className={`flex items-center justify-between px-4 py-3 rounded-xl text-sm font-medium transition-colors ${
                    isActive(link.to)
                      ? 'text-brand-700 bg-brand-50'
                      : 'text-slate-700 hover:bg-slate-50'
                  }`}
                  onClick={() => setMobileOpen(false)}
                >
                  {link.label}
                  <ChevronRight className="h-4 w-4 text-slate-400" />
                </Link>
              ))}
              {canAccessAdmin && firestoreRole === 'admin' && (
                <Link
                  to="/admin"
                  className="flex items-center justify-between px-4 py-3 rounded-xl text-sm font-medium text-brand-600 hover:bg-brand-50 transition-colors"
                  onClick={() => setMobileOpen(false)}
                >
                  {t('nav.admin')}
                  <ChevronRight className="h-4 w-4 text-brand-400" />
                </Link>
              )}
              {!currentUser && (
                <Link
                  to="/login"
                  className="flex items-center justify-between px-4 py-3 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                  onClick={() => setMobileOpen(false)}
                >
                  {t('nav.signIn')}
                  <ChevronRight className="h-4 w-4 text-slate-400" />
                </Link>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
