import type { User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

/**
 * Matches Firestore `isAdmin()`: role admin on users/{uid} OR email in settings/general.adminEmails.
 */
export async function userHasAdminAccess(user: User | null): Promise<boolean> {
  if (!user?.uid || !user.email) return false;
  const emailNorm = user.email.trim().toLowerCase();

  const uSnap = await getDoc(doc(db, 'users', user.uid));
  const role = uSnap.exists() ? (uSnap.data().role as string | undefined) : undefined;
  if (role === 'admin' || role === 'subadmin') return true;

  const sSnap = await getDoc(doc(db, 'settings', 'general'));
  if (!sSnap.exists()) return false;
  const raw = sSnap.data().adminEmails;
  if (!Array.isArray(raw)) return false;
  return raw.some((e) => typeof e === 'string' && e.trim().toLowerCase() === emailNorm);
}
