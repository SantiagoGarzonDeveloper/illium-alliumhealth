import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog } from '@/components/ui/dialog';
import { auth, db, storage } from '@/lib/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { updateProfile } from 'firebase/auth';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Loader2, Camera, LayoutDashboard } from 'lucide-react';
import { useToastStore } from '@/store';
import { useI18n } from '@/i18n/I18nContext';
import { userHasAdminAccess } from '@/lib/adminAccess';

type ProfileForm = {
  name: string;
  phone: string;
  whatsappCountryCode: string;
  whatsappLocalNumber: string;
  address: string;
  city: string;
  instagram: string;
  tiktok: string;
  facebook: string;
  twitter: string;
  linkedin: string;
};

const emptyProfile: ProfileForm = {
  name: '',
  phone: '',
  whatsappCountryCode: '+1',
  whatsappLocalNumber: '',
  address: '',
  city: '',
  instagram: '',
  tiktok: '',
  facebook: '',
  twitter: '',
  linkedin: '',
};

export function UserProfile() {
  const { t, locale } = useI18n();
  const showToast = useToastStore((s) => s.showToast);
  const [user, setUser] = useState<any>(null);
  const [role, setRole] = useState<string | null>(null);
  const [profileData, setProfileData] = useState<ProfileForm>(emptyProfile);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMessage, setDialogMessage] = useState('');
  const [, setCanAccessAdmin] = useState(false);

  useEffect(() => {
    const fetchUser = async () => {
      if (auth.currentUser) {
        setUser(auth.currentUser);
        setCanAccessAdmin(await userHasAdminAccess(auth.currentUser));
        const userDoc = await getDoc(doc(db, 'users', auth.currentUser.uid));
        if (userDoc.exists()) {
          const d = userDoc.data();
          setRole((d.role as string) ?? null);
          setProfileData({
            name: (d.name as string) || auth.currentUser.displayName || '',
            phone: (d.phone as string) || '',
            whatsappCountryCode: (d.whatsappCountryCode as string) || '+1',
            whatsappLocalNumber: (d.whatsappLocalNumber as string) || '',
            address: (d.address as string) || '',
            city: (d.city as string) || '',
            instagram: (d.instagram as string) || '',
            tiktok: (d.tiktok as string) || '',
            facebook: (d.facebook as string) || '',
            twitter: (d.twitter as string) || '',
            linkedin: (d.linkedin as string) || '',
          });
        }
      }
      setLoading(false);
    };
    fetchUser();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    try {
      const cc = profileData.whatsappCountryCode.trim();
      const waLocal = profileData.whatsappLocalNumber.replace(/\D/g, '');
      if (!cc.replace(/\D/g, '') || !waLocal) {
        setDialogMessage(t('profile.whatsappRequired'));
        setDialogOpen(true);
        setSaving(false);
        return;
      }
      const ccNorm = cc.startsWith('+') ? cc : `+${cc.replace(/\D/g, '')}`;
      if (profileData.name !== user.displayName) {
        await updateProfile(user, { displayName: profileData.name });
      }
      await setDoc(
        doc(db, 'users', user.uid),
        {
          name: profileData.name.trim(),
          phone: profileData.phone.trim(),
          whatsappCountryCode: ccNorm,
          whatsappLocalNumber: waLocal,
          address: profileData.address.trim(),
          city: profileData.city.trim(),
          instagram: profileData.instagram.trim(),
          tiktok: profileData.tiktok.trim(),
          facebook: profileData.facebook.trim(),
          twitter: profileData.twitter.trim(),
          linkedin: profileData.linkedin.trim(),
        },
        { merge: true }
      );
      showToast(t('profile.updated'));
    } catch (error) {
      console.error(error);
      setDialogMessage(error instanceof Error ? error.message : 'Could not update profile.');
      setDialogOpen(true);
    } finally {
      setSaving(false);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    setUploadingImage(true);
    try {
      const storageRef = ref(storage, `profiles/${user.uid}_${Date.now()}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      await updateProfile(user, { photoURL: url });
      setUser({ ...user, photoURL: url });
      showToast(t('profile.photoUpdated'));
    } catch (error) {
      console.error(error);
      setDialogMessage(error instanceof Error ? error.message : 'Failed to upload image.');
      setDialogOpen(true);
    } finally {
      setUploadingImage(false);
    }
  };

  if (loading) return <div className="p-24 text-center">{t('profile.loading')}</div>;
  if (!user) return <div className="p-24 text-center">{t('profile.loginPrompt')}</div>;

  return (
    <div className="container mx-auto px-4 py-12 max-w-2xl">
      <Dialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={t('profile.dialogTitle')}
        description={dialogMessage}
      />
      {/* Big Partner Dashboard CTA (only for workers/admins) */}
      {(role === 'worker' || role === 'admin') && (
        <div className="mb-6 rounded-3xl overflow-hidden bg-gradient-to-br from-brand-900 via-brand-700 to-brand-900 p-6 md:p-8 shadow-2xl shadow-brand-700/30 text-white">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex-1 min-w-0">
              <div className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wider mb-3 ring-1 ring-white/20">
                <LayoutDashboard className="h-3 w-3" />
                {locale === 'es' ? 'Panel de Socio' : 'Partner Panel'}
              </div>
              <h2 className="text-2xl md:text-3xl font-bold tracking-tight mb-2">
                {locale === 'es' ? 'Abre tu panel de socio' : 'Open your partner dashboard'}
              </h2>
              <p className="text-sm text-white/70 max-w-md">
                {locale === 'es'
                  ? 'Ve tu red de referidos, ventas con tu enlace, comisiones y estado de pagos.'
                  : 'See your referral network, link sales, commissions and payout status.'}
              </p>
            </div>
            <div className="flex flex-col gap-2 items-stretch sm:items-start">
              <Link to="/panel">
                <Button type="button" className="gap-2 bg-white text-brand-900 hover:bg-slate-100 rounded-full h-11 px-6 text-sm font-bold shadow-lg">
                  <LayoutDashboard className="h-4 w-4" />
                  {locale === 'es' ? 'Ir al panel' : 'Go to dashboard'}
                </Button>
              </Link>
              {/* Calculator link removed — accessible from navbar */}
            </div>
          </div>
        </div>
      )}

      {/* Client "My Orders" CTA */}
      {role === 'client' && (
        <div className="mb-6 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800 p-6 text-white">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-lg font-bold">{locale === 'es' ? 'Mis pedidos' : 'My orders'}</h2>
              <p className="text-xs text-slate-400">
                {locale === 'es' ? 'Consulta el estado de tus pedidos.' : 'Check the status of your orders.'}
              </p>
            </div>
            <Link to="/orders">
              <Button type="button" className="bg-brand-600 text-white hover:bg-brand-500 rounded-full h-10 px-5 text-sm font-semibold">
                {locale === 'es' ? 'Ver pedidos' : 'View orders'}
              </Button>
            </Link>
          </div>
        </div>
      )}

      <Card>
        <CardHeader className="space-y-3">
          <CardTitle className="text-2xl font-bold">{t('profile.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row gap-8 items-start">
            <div className="flex flex-col items-center space-y-4">
              <div className="relative w-32 h-32 rounded-full border-4 border-white shadow-lg overflow-hidden bg-slate-100 flex items-center justify-center">
                {uploadingImage ? (
                  <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
                ) : user.photoURL ? (
                  <img src={user.photoURL} alt="Profile" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-4xl text-slate-400">{user.email?.charAt(0).toUpperCase()}</span>
                )}
                <label className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center text-white opacity-0 hover:opacity-100 cursor-pointer transition-opacity">
                  <Camera className="w-6 h-6 mb-1" />
                  <span className="text-xs font-medium">{t('profile.changePhoto')}</span>
                  <input type="file" className="hidden" accept="image/*" onChange={handleImageUpload} />
                </label>
              </div>
              <p className="text-sm text-slate-500 font-medium">{user.email}</p>
            </div>

            <form onSubmit={handleSave} className="flex-1 space-y-4 w-full">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">{t('profile.fullName')}</label>
                <Input
                  value={profileData.name}
                  onChange={(e) => setProfileData({ ...profileData, name: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">{t('profile.phone')}</label>
                <Input value={profileData.phone} onChange={(e) => setProfileData({ ...profileData, phone: e.target.value })} />
              </div>
              <div className="rounded-lg border border-emerald-100 bg-emerald-50/40 p-3 space-y-3">
                <p className="text-xs font-medium text-slate-800">{t('profile.whatsappBlockTitle')}</p>
                <p className="text-[11px] text-slate-600">{t('profile.whatsappBlockHint')}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">{t('profile.whatsappCountryCode')}</label>
                    <Input
                      value={profileData.whatsappCountryCode}
                      onChange={(e) => setProfileData({ ...profileData, whatsappCountryCode: e.target.value })}
                      required
                      placeholder="+52"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">{t('profile.whatsappLocalNumber')}</label>
                    <Input
                      type="tel"
                      inputMode="numeric"
                      value={profileData.whatsappLocalNumber}
                      onChange={(e) => setProfileData({ ...profileData, whatsappLocalNumber: e.target.value })}
                      required
                      placeholder="3312345678"
                    />
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">{t('profile.city')}</label>
                <Input value={profileData.city} onChange={(e) => setProfileData({ ...profileData, city: e.target.value })} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">{t('profile.instagram')}</label>
                  <Input
                    value={profileData.instagram}
                    onChange={(e) => setProfileData({ ...profileData, instagram: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">{t('profile.tiktok')}</label>
                  <Input value={profileData.tiktok} onChange={(e) => setProfileData({ ...profileData, tiktok: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">{t('profile.facebook')}</label>
                  <Input
                    value={profileData.facebook}
                    onChange={(e) => setProfileData({ ...profileData, facebook: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">{t('profile.twitter')}</label>
                  <Input
                    value={profileData.twitter}
                    onChange={(e) => setProfileData({ ...profileData, twitter: e.target.value })}
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <label className="text-sm font-medium text-slate-700">{t('profile.linkedin')}</label>
                  <Input
                    value={profileData.linkedin}
                    onChange={(e) => setProfileData({ ...profileData, linkedin: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">{t('profile.address')}</label>
                <textarea
                  className="w-full border border-slate-200 rounded-md p-3 text-sm h-24 outline-none focus:ring-2 focus:ring-blue-600"
                  value={profileData.address}
                  onChange={(e) => setProfileData({ ...profileData, address: e.target.value })}
                />
              </div>
              <Button type="submit" variant="primary" disabled={saving}>
                {saving ? t('profile.saving') : t('profile.save')}
              </Button>
            </form>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
