import { Routes, Route, useSearchParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { Navbar } from './components/layout/Navbar';
import { Footer } from './components/layout/Footer';
import { Home } from './pages/Home';
import { ProductList } from './pages/ProductList';
import { ProductDetail } from './pages/ProductDetail';
import { Cart } from './pages/Cart';
import { Quiz } from './pages/Quiz';
import { PeptideCalculator } from './pages/PeptideCalculator';
import { AdminLayout } from './pages/admin/AdminLayout';
import { AdminDashboard } from './pages/admin/AdminDashboard';
import { AdminProducts } from './pages/admin/AdminProducts';
import { AdminSettings } from './pages/admin/AdminSettings';
import { AdminFinance } from './pages/admin/AdminFinance';
import { AdminLeads } from './pages/admin/AdminLeads';
import { AdminGuide } from './pages/admin/AdminGuide';
import { AdminInventory } from './pages/admin/AdminInventory';
import { AdminSales } from './pages/admin/AdminSales';
import { AdminVendors } from './pages/admin/AdminVendors';
import { AdminPayouts } from './pages/admin/AdminPayouts';
import { AdminAuthenticity } from './pages/admin/AdminAuthenticity';
import { AdminCoupons } from './pages/admin/AdminCoupons';
import { AdminTraining } from './pages/admin/AdminTraining';
import { AdminContent } from './pages/admin/AdminContent';
import { VerifyAuthenticity } from './pages/VerifyAuthenticity';
import { CoaBatch } from './pages/CoaBatch';
import { SharedCartLoader } from './pages/SharedCartLoader';
import { AdminReferrals } from './pages/admin/AdminReferrals';
import { ScrollToTop } from './components/ScrollToTop';
import { AuthAction } from './pages/AuthAction';
import { WorkerPanel } from './pages/worker/WorkerPanel';
import { UserProfile } from './pages/UserProfile';
import { MyOrders } from './pages/MyOrders';
import { FAQPage, ShippingPage, ContactPage, TermsPage, PrivacyPage, TermsOfSalePage, LabResultsPage } from './pages/StaticPages';
import { DocsPage } from './pages/DocsPage';
import { Donaton } from './pages/Donaton';
import { Consulta } from './pages/Consulta';
import { Login } from './pages/Login';
import { ChatbotWidget } from './components/chatbot/ChatbotWidget';
import { ToastHost } from './components/ui/toast-host';
import { ReferralNotice } from './components/ReferralNotice';
import { LanguageAgeGates } from './components/gates/LanguageAgeGates';
import { LocaleRedirect } from './components/LocaleRedirect';
import { useI18n } from './i18n/I18nContext';
import { useAppStore } from './store';
import type { Product } from './store';
import { normalizeProductFromFirestore } from './lib/productLocale';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from './lib/firebase';
import { loadCommissionRates } from './lib/commissions';

function App() {
  const { t } = useI18n();
  const [searchParams] = useSearchParams();
  const setProducts = useAppStore(state => state.setProducts);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const ref = searchParams.get('ref');
    if (ref) {
      localStorage.setItem('referrerId', ref);
    }
  }, [searchParams]);

  // Hydrate commission rates from Firestore once at boot
  useEffect(() => {
    void loadCommissionRates();
  }, []);

  useEffect(() => {
    // Listen to products
    const unsubscribe = onSnapshot(collection(db, 'products'), (snapshot) => {
      const prods: Product[] = [];
      snapshot.forEach((d) => {
        prods.push(normalizeProductFromFirestore(d.id, d.data() as Record<string, unknown>));
      });
      // Set some default mock products if db is empty for the demo
      if (prods.length === 0) {
        const defaults: Product[] = [
          { id: '1', name: 'BPC-157 10mg', price: 45.00, stock: 100, category: 'peptides', description: 'Body Protection Compound 157 is a pentadecapeptide with remarkable healing properties.', benefits: ['Accelerated wound healing', 'Joint and tendon repair', 'Gut health support'], img: 'https://images.unsplash.com/photo-1614948064977-8494916a04cb?auto=format&fit=crop&q=80&w=400&h=400' },
          { id: '2', name: 'NAD+ 500mg', price: 48.00, stock: 100, category: 'nad', description: 'NAD+ is essential for cellular metabolism and energy.', benefits: ['Energy boost', 'Cellular repair'], img: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?auto=format&fit=crop&q=80&w=400&h=400' },
          { id: '3', name: 'Semax 30mg', price: 55.00, stock: 100, category: 'nootropics', description: 'Nootropic peptide known for cognitive enhancement.', benefits: ['Mental focus', 'Memory'], img: 'https://images.unsplash.com/photo-1576086213369-97a306d36557?auto=format&fit=crop&q=80&w=400&h=400' },
          { id: '4', name: 'GHK-Cu 50mg', price: 39.00, stock: 100, category: 'peptides', description: 'Copper peptide for skin and repair.', benefits: ['Skin health', 'Hair growth'], img: 'https://images.unsplash.com/photo-1628771065518-0d82f1938462?auto=format&fit=crop&q=80&w=400&h=400' },
        ];
        setProducts(defaults);
      } else {
        setProducts(prods);
      }
      setLoading(false);
    }, (error) => {
      console.error("Error fetching products:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [setProducts]);

  /* ToastHost + ReferralNotice must mount even while products load, or toasts never appear */
  if (loading) {
    return (
      <div className="min-h-screen flex flex-col font-sans">
        <LanguageAgeGates>
          <ReferralNotice />
          <ToastHost />
          <div className="flex flex-1 items-center justify-center text-slate-500 text-sm">{t('common.loading')}</div>
        </LanguageAgeGates>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col font-sans">
      <LanguageAgeGates>
        <ReferralNotice />
        <ToastHost />
        <ScrollToTop />
        <Routes>
        {/* Public Routes */}
        <Route path="/es" element={<LocaleRedirect lang="es" />} />
        <Route path="/en" element={<LocaleRedirect lang="en" />} />
        <Route path="/" element={<><Navbar /><main className="flex-1"><Home /></main><Footer /><ChatbotWidget /></>} />
        <Route path="/shop" element={<><Navbar /><main className="flex-1"><ProductList /></main><Footer /><ChatbotWidget /></>} />
        <Route path="/product/:id" element={<><Navbar /><main className="flex-1"><ProductDetail /></main><Footer /><ChatbotWidget /></>} />
        <Route path="/cart" element={<><Navbar /><main className="flex-1"><Cart /></main><Footer /><ChatbotWidget /></>} />
        <Route path="/quiz" element={<><Navbar /><main className="flex-1"><Quiz /></main><Footer /><ChatbotWidget /></>} />
        <Route path="/calculator" element={<><Navbar /><main className="flex-1"><PeptideCalculator /></main><Footer /></>} />
        <Route path="/login" element={<><Navbar /><main className="flex-1"><Login /></main><Footer /></>} />
        <Route path="/profile" element={<><Navbar /><main className="flex-1"><UserProfile /></main><Footer /></>} />
        <Route path="/orders" element={<><Navbar /><main className="flex-1"><MyOrders /></main><Footer /></>} />
        <Route path="/faq" element={<><Navbar /><main className="flex-1"><FAQPage /></main><Footer /><ChatbotWidget /></>} />
        <Route path="/shipping" element={<><Navbar /><main className="flex-1"><ShippingPage /></main><Footer /><ChatbotWidget /></>} />
        <Route path="/contact" element={<><Navbar /><main className="flex-1"><ContactPage /></main><Footer /><ChatbotWidget /></>} />
        <Route path="/terms" element={<><Navbar /><main className="flex-1"><TermsPage /></main><Footer /></>} />
        <Route path="/terms-of-sale" element={<><Navbar /><main className="flex-1"><TermsOfSalePage /></main><Footer /></>} />
        <Route path="/lab-results" element={<><Navbar /><main className="flex-1"><LabResultsPage /></main><Footer /><ChatbotWidget /></>} />
        <Route path="/privacy" element={<><Navbar /><main className="flex-1"><PrivacyPage /></main><Footer /></>} />
        <Route path="/docs" element={<><Navbar /><main className="flex-1"><DocsPage /></main><Footer /></>} />
        {/* Standalone campaign page — no navbar/footer/chatbot for an immersive experience */}
        <Route path="/donaton" element={<Donaton />} />
        <Route path="/consulta" element={<><Navbar /><main className="flex-1"><Consulta /></main><Footer /></>} />
        <Route path="/consulting" element={<><Navbar /><main className="flex-1"><Consulta /></main><Footer /></>} />

        {/* Product authenticity verification — standalone immersive page */}
        <Route path="/verify/:code" element={<VerifyAuthenticity />} />
        <Route path="/coa/:batch" element={<CoaBatch />} />

        {/* Shared cart link — hydrates store and forwards to /cart */}
        <Route path="/c/:id" element={<SharedCartLoader />} />

        {/* Firebase Auth action handler (password reset / email verify) — Illium-branded. */}
        <Route path="/auth/action" element={<AuthAction />} />

        {/* Admin Routes */}
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<AdminDashboard />} />
          <Route path="products" element={<AdminProducts />} />
          <Route path="leads" element={<AdminLeads />} />
          <Route path="finance" element={<AdminFinance />} />
          <Route path="inventory" element={<AdminInventory />} />
          <Route path="sales" element={<AdminSales />} />
          <Route path="coupons" element={<AdminCoupons />} />
          <Route path="vendors" element={<AdminVendors />} />
          <Route path="payouts" element={<AdminPayouts />} />
          <Route path="authenticity" element={<AdminAuthenticity />} />
          <Route path="settings" element={<AdminSettings />} />
          <Route path="guide" element={<AdminGuide />} />
          <Route path="training" element={<AdminTraining />} />
          <Route path="content" element={<AdminContent />} />
          <Route path="referrals" element={<AdminReferrals />} />
        </Route>

        {/* Worker Routes */}
        <Route path="/panel" element={<WorkerPanel />} />
        </Routes>
      </LanguageAgeGates>
    </div>
  );
}

export default App;
