import { useEffect, useState, type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';

/**
 * La calculadora de péptidos NO es pública (pedido del cliente, 24-sep-2026):
 * solo la ven administradores y socios (role admin / subadmin / worker).
 * Cualquier otra visita a /calculator va al catálogo.
 */
export function CalculatorGate({ children }: { children: ReactNode }) {
  const [gate, setGate] = useState<'loading' | 'ok' | 'no'>('loading');

  useEffect(() => {
    return onAuthStateChanged(auth, async (user) => {
      if (!user) { setGate('no'); return; }
      try {
        const snap = await getDoc(doc(db, 'users', user.uid));
        const role = snap.exists() ? String(snap.data().role || '') : '';
        setGate(role === 'admin' || role === 'subadmin' || role === 'worker' ? 'ok' : 'no');
      } catch {
        setGate('no');
      }
    });
  }, []);

  if (gate === 'loading') return <div className="min-h-[50vh]" />;
  if (gate === 'no') return <Navigate to="/shop" replace />;
  return <>{children}</>;
}
