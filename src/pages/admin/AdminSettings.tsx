import { useState, useEffect, useRef, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { db, storage, cloudFunctions } from '@/lib/firebase';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { httpsCallable } from 'firebase/functions';
import { Trash2, Plus, Loader2, ImageIcon, Upload, UserPlus, Shield } from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { useI18n } from '@/i18n/I18nContext';

const DEFAULT_CATEGORIES = [
  { name: 'Peptides', color: 'bg-emerald-100 text-emerald-700', path: '/shop?category=peptides', imageUrl: '' },
  { name: 'NAD+', color: 'bg-amber-100 text-amber-700', path: '/shop?category=nad', imageUrl: '' },
  { name: 'Nootropics', color: 'bg-blue-100 text-blue-700', path: '/shop?category=nootropics', imageUrl: '' },
  { name: 'Recovery', color: 'bg-purple-100 text-purple-700', path: '/shop?category=recovery', imageUrl: '' },
];

export function AdminSettings() {
  const { t, locale } = useI18n();
  const [settings, setSettings] = useState<any>({
    ownerWhatsappCountryCode: '',
    ownerWhatsappLocalNumber: '',
    metaWhatsappPhoneNumberId: '',
    metaWhatsappTemplateName: 'hello_world',
    metaWhatsappTemplateLang: 'en_US',
    metaWhatsappTemplateBodyVariables: 0,
    paymentMethods: '',
    paymentMethodsEs: '',
    commissionPercent: 10,
    aiPrompt: '',
    protocolPromptEn: '',
    protocolPromptEs: '',
    zelleQrUrl: '',
    zelleNumber: '(786) 948-0879',
    stripePublishableKey: '',
    cardPaymentsEnabled: false,
    heroTitle: '',
    heroSubtitle: '',
    heroTitleEs: '',
    heroSubtitleEs: '',
    categoriesSectionTitle: 'Check out the most popular categories',
    categoriesSectionTitleEs: '',
    categories: DEFAULT_CATEGORIES,
  });
  const [saving, setSaving] = useState(false);
  const [uploadingIndex, setUploadingIndex] = useState<number | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMessage, setDialogMessage] = useState({ title: '', description: '' });
  const [adminEmailsText, setAdminEmailsText] = useState('');
  const [zelleQrUploading, setZelleQrUploading] = useState(false);
  // Sub-admin creation
  const [subAdminEmail, setSubAdminEmail] = useState('');
  const [subAdminPassword, setSubAdminPassword] = useState('');
  const [subAdminName, setSubAdminName] = useState('');
  const [creatingSubAdmin, setCreatingSubAdmin] = useState(false);
  const [subAdminMsg, setSubAdminMsg] = useState('');

  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, 'settings', 'general'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (Array.isArray(data.adminEmails)) {
          setAdminEmailsText(data.adminEmails.join('\n'));
        }
        setSettings((prev: any) => ({
          ...prev,
          ...data,
          categories:
            data.categories && Array.isArray(data.categories) && data.categories.length > 0
              ? data.categories
              : prev.categories?.length
                ? prev.categories
                : DEFAULT_CATEGORIES,
        }));
      }
    });
    return () => unsubscribe();
  }, []);

  const showFeedback = (title: string, description: string) => {
    setDialogMessage({ title, description });
    setDialogOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const adminEmails = adminEmailsText
        .split(/[\n,;]+/)
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean);
      await setDoc(doc(db, 'settings', 'general'), { ...settings, adminEmails }, { merge: true });
      showFeedback(t('adminPage.settings.savedTitle'), t('adminPage.settings.savedBody'));
    } catch (error) {
      console.error(error);
      showFeedback(t('adminPage.settings.errorTitle'), t('adminPage.settings.errorBody'));
    } finally {
      setSaving(false);
    }
  };

  const handleAddCategory = () => {
    setSettings({
      ...settings,
      categories: [
        ...(settings.categories || []),
        { name: '', color: 'bg-slate-100 text-slate-700', path: '/shop', imageUrl: '' },
      ],
    });
  };

  const handleUpdateCategory = (index: number, field: string, value: string) => {
    const newCategories = [...(settings.categories || [])];
    newCategories[index] = { ...newCategories[index], [field]: value };
    setSettings({ ...settings, categories: newCategories });
  };

  const handleRemoveCategory = (index: number) => {
    const newCategories = [...(settings.categories || [])];
    newCategories.splice(index, 1);
    setSettings({ ...settings, categories: newCategories });
  };

  /** Upload a Zelle QR image to Firebase Storage and store the public URL in settings. */
  const uploadZelleQr = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      showFeedback(
        locale === 'es' ? 'Archivo no válido' : 'Invalid file',
        locale === 'es' ? 'Sube una imagen PNG o JPG.' : 'Please upload a PNG or JPG image.',
      );
      return;
    }
    setZelleQrUploading(true);
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const storageRef = ref(storage, `payments/zelle-qr_${Date.now()}_${safeName}`);
      await uploadBytes(storageRef, file, { contentType: file.type });
      const url = await getDownloadURL(storageRef);
      setSettings({ ...settings, zelleQrUrl: url });
    } catch (err) {
      console.error(err);
      showFeedback(
        locale === 'es' ? 'No se pudo subir el QR' : 'Could not upload the QR',
        err instanceof Error ? err.message : 'Upload failed',
      );
    } finally {
      setZelleQrUploading(false);
    }
  };

  const uploadCategoryImage = async (index: number, file: File) => {
    setUploadingIndex(index);
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const storageRef = ref(storage, `layout/categories/${Date.now()}_${safeName}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      handleUpdateCategory(index, 'imageUrl', url);
    } catch (err) {
      console.error(err);
      showFeedback(t('adminPage.settings.uploadFailTitle'), t('adminPage.settings.uploadFailBody'));
    } finally {
      setUploadingIndex(null);
    }
  };

  return (
    <div className="space-y-8 max-w-4xl">
      <h1 className="text-2xl font-bold text-slate-900">{t('adminPage.settings.pageTitle')}</h1>

      <Dialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={dialogMessage.title}
        description={dialogMessage.description}
      />

      <Card>
        <CardHeader>
          <CardTitle>{t('adminPage.settings.cardCheckout')}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSave} className="space-y-6">
            {/* ── Create Sub-Admin ── */}
            <div className="rounded-2xl border-2 border-brand-200 bg-brand-50/30 p-5 space-y-4">
              <div className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-brand-700" />
                <h3 className="text-sm font-bold text-slate-900">
                  {locale === 'es' ? 'Crear cuenta Sub-Admin' : 'Create Sub-Admin account'}
                </h3>
              </div>
              <p className="text-xs text-slate-600">
                {locale === 'es'
                  ? 'Los sub-admins pueden ver pedidos, envíos, productos y leads, pero NO ven ganancias, costos, inventario financiero ni porcentajes de comisión.'
                  : 'Sub-admins can see orders, shipping, products and leads, but NOT see profits, costs, financial inventory or commission rates.'}
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-600 mb-1 block">
                    {locale === 'es' ? 'Nombre' : 'Name'}
                  </label>
                  <Input
                    value={subAdminName}
                    onChange={(e) => setSubAdminName(e.target.value)}
                    placeholder="Carlos Admin"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600 mb-1 block">Email</label>
                  <Input
                    type="email"
                    value={subAdminEmail}
                    onChange={(e) => setSubAdminEmail(e.target.value)}
                    placeholder="carlos@illium.health"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600 mb-1 block">
                    {locale === 'es' ? 'Contraseña (6+ chars)' : 'Password (6+ chars)'}
                  </label>
                  <Input
                    type="text"
                    value={subAdminPassword}
                    onChange={(e) => setSubAdminPassword(e.target.value)}
                    placeholder="SecurePass123"
                  />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Button
                  type="button"
                  disabled={creatingSubAdmin || !subAdminEmail || !subAdminPassword || !subAdminName}
                  onClick={async () => {
                    setCreatingSubAdmin(true);
                    setSubAdminMsg('');
                    try {
                      const fn = httpsCallable(cloudFunctions, 'createSubAdmin');
                      await fn({ email: subAdminEmail, password: subAdminPassword, name: subAdminName });
                      setSubAdminMsg(locale === 'es' ? '✓ Sub-admin creado correctamente' : '✓ Sub-admin created successfully');
                      setSubAdminEmail('');
                      setSubAdminPassword('');
                      setSubAdminName('');
                    } catch (e: any) {
                      setSubAdminMsg(`✗ ${e?.message || 'Error'}`);
                    } finally {
                      setCreatingSubAdmin(false);
                    }
                  }}
                  className="bg-brand-600 hover:bg-brand-500 text-white rounded-lg h-9 px-5 text-xs font-bold"
                >
                  {creatingSubAdmin ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5 mr-1.5" />}
                  {locale === 'es' ? 'Crear Sub-Admin' : 'Create Sub-Admin'}
                </Button>
                {subAdminMsg && (
                  <p className={`text-xs font-semibold ${subAdminMsg.startsWith('✓') ? 'text-emerald-700' : 'text-red-700'}`}>
                    {subAdminMsg}
                  </p>
                )}
              </div>
            </div>

            {/* ── Datos de facturación (factura / legal) ── */}
            <div className="rounded-2xl border-2 border-slate-300 bg-slate-50/80 p-5 space-y-4 shadow-sm">
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-xl bg-slate-700 flex items-center justify-center shrink-0">
                  <svg className="h-5 w-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                </div>
                <div className="flex-1">
                  <h3 className="text-base font-bold text-slate-900">
                    {locale === 'es' ? 'Datos de facturación (factura / legal)' : 'Invoice details (legal)'}
                  </h3>
                  <p className="text-xs text-slate-600 mt-0.5">
                    {locale === 'es'
                      ? 'Estos datos aparecen en el encabezado de las facturas que generas desde Registro de Ventas. Los datos del cliente se toman de cada compra.'
                      : 'These appear in the header of invoices generated from the Sales log. Customer data is taken from each purchase.'}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-600 mb-1 block">{locale === 'es' ? 'Nombre de la empresa' : 'Company name'}</label>
                  <Input value={settings.invoiceCompanyName || ''} onChange={(e) => setSettings({ ...settings, invoiceCompanyName: e.target.value })} placeholder="ILLIUM Health LLC" />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600 mb-1 block">{locale === 'es' ? 'NIF / Tax ID / RUC' : 'Tax ID'}</label>
                  <Input value={settings.invoiceTaxId || ''} onChange={(e) => setSettings({ ...settings, invoiceTaxId: e.target.value })} placeholder="EIN / NIF / RUC" />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600 mb-1 block">Email</label>
                  <Input value={settings.invoiceEmail || ''} onChange={(e) => setSettings({ ...settings, invoiceEmail: e.target.value })} placeholder="facturacion@alliumhealth.net" />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600 mb-1 block">{locale === 'es' ? 'Teléfono' : 'Phone'}</label>
                  <Input value={settings.invoicePhone || ''} onChange={(e) => setSettings({ ...settings, invoicePhone: e.target.value })} placeholder="+1 ..." />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600 mb-1 block">{locale === 'es' ? 'Página web' : 'Website'}</label>
                  <Input value={settings.invoiceWebsite || ''} onChange={(e) => setSettings({ ...settings, invoiceWebsite: e.target.value })} placeholder="alliumhealth.net" />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600 mb-1 block">{locale === 'es' ? 'URL del logo' : 'Logo URL'}</label>
                  <Input value={settings.invoiceLogoUrl || ''} onChange={(e) => setSettings({ ...settings, invoiceLogoUrl: e.target.value })} placeholder="https://...logo.png" />
                </div>
                <div className="md:col-span-2">
                  <label className="text-xs font-medium text-slate-600 mb-1 block">{locale === 'es' ? 'Dirección' : 'Address'}</label>
                  <Input value={settings.invoiceAddress || ''} onChange={(e) => setSettings({ ...settings, invoiceAddress: e.target.value })} placeholder={locale === 'es' ? 'Calle, ciudad, país' : 'Street, city, country'} />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600 mb-1 block">{locale === 'es' ? 'Moneda' : 'Currency'}</label>
                  <Input value={settings.invoiceCurrency || ''} onChange={(e) => setSettings({ ...settings, invoiceCurrency: e.target.value })} placeholder="USD" />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600 mb-1 block">{locale === 'es' ? 'Impuesto / IVA (%)' : 'Tax / VAT (%)'}</label>
                  <Input type="number" min={0} step="any" value={settings.invoiceTaxRate ?? ''} onChange={(e) => setSettings({ ...settings, invoiceTaxRate: e.target.value === '' ? 0 : parseFloat(e.target.value) })} placeholder="0" />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600 mb-1 block">{locale === 'es' ? 'Prefijo de factura' : 'Invoice prefix'}</label>
                  <Input value={settings.invoicePrefix || ''} onChange={(e) => setSettings({ ...settings, invoicePrefix: e.target.value })} placeholder="ILL-" />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600 mb-1 block">{locale === 'es' ? 'Datos bancarios (pie)' : 'Bank details (footer)'}</label>
                  <Input value={settings.invoiceBank || ''} onChange={(e) => setSettings({ ...settings, invoiceBank: e.target.value })} placeholder={locale === 'es' ? 'Banco · IBAN/Cuenta' : 'Bank · IBAN/Account'} />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 mb-1 block">{locale === 'es' ? 'Términos y condiciones' : 'Terms & conditions'}</label>
                <textarea
                  className="w-full border border-slate-200 rounded-md p-2.5 text-sm min-h-[70px] outline-none focus:ring-2 focus:ring-brand-500"
                  value={settings.invoiceTerms || ''}
                  onChange={(e) => setSettings({ ...settings, invoiceTerms: e.target.value })}
                  placeholder={locale === 'es' ? 'Ej: Pago contra entrega. Gracias por tu compra.' : 'E.g. Payment on delivery. Thank you for your purchase.'}
                />
              </div>
            </div>

            <div id="wholesale-section" className="rounded-2xl border-2 border-blue-300 bg-blue-50/80 p-5 space-y-3 shadow-sm">
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-xl bg-blue-600 flex items-center justify-center shrink-0">
                  <svg className="h-5 w-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
                </div>
                <div className="flex-1">
                  <h3 className="text-base font-bold text-slate-900">
                    {locale === 'es' ? 'Lista de productos al por mayor' : 'Wholesale product list'}
                  </h3>
                  <p className="text-xs text-slate-600 mt-0.5">
                    {locale === 'es'
                      ? 'Aparece dentro del panel del trabajador (pestaña Mayorista) con un botón para copiarla y mandársela a un cliente mayorista por WhatsApp. Escribe una línea por producto.'
                      : 'Appears inside the worker panel (Wholesale tab) with a copy button so they can send it to a wholesale customer via WhatsApp. One line per product.'}
                  </p>
                  <p className="text-[11px] text-blue-700 font-semibold mt-1.5">
                    {locale === 'es'
                      ? '🔒 Por defecto NINGÚN trabajador la ve. Activa el permiso “Acceso a lista mayorista” por trabajador en Vendedores y Clientes.'
                      : '🔒 By default NO worker sees it. Toggle "Wholesale list access" per worker in Vendors & Customers.'}
                  </p>
                </div>
              </div>
              <textarea
                className="w-full border-2 border-blue-200 rounded-xl p-3 text-sm h-44 font-mono outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                placeholder={locale === 'es'
                  ? 'GLP2-T Peptide 20mg — $X al por mayor (mín. 10 unidades)\nGLP3-R Peptide 30mg — $X al por mayor (mín. 10 unidades)\nBPC-157 — $X al por mayor\n...'
                  : 'GLP2-T Peptide 20mg — $X wholesale (min. 10 units)\nGLP3-R Peptide 30mg — $X wholesale (min. 10 units)\nBPC-157 — $X wholesale\n...'}
                value={settings.wholesaleList || ''}
                onChange={(e) => setSettings({ ...settings, wholesaleList: e.target.value })}
              />
              {settings.wholesaleList && (
                <details className="rounded-lg bg-white border border-blue-100 p-3">
                  <summary className="text-xs font-bold text-blue-700 cursor-pointer">
                    {locale === 'es' ? 'Vista previa (como la ven los trabajadores)' : 'Preview (as workers see it)'}
                  </summary>
                  <pre className="mt-2 whitespace-pre-wrap rounded-lg border border-slate-100 bg-slate-50 p-3 text-xs font-mono text-slate-800 max-h-60 overflow-y-auto">
                    {settings.wholesaleList}
                  </pre>
                </details>
              )}
            </div>

            <div className="rounded-lg border border-emerald-200 bg-emerald-50/80 p-4 space-y-2">
              <h3 className="text-sm font-semibold text-slate-900">
                {locale === 'es' ? 'Dominio público del sitio' : 'Public site URL'}
              </h3>
              <p className="text-xs text-slate-600">
                {locale === 'es'
                  ? 'URL completa que aparecerá en los enlaces de referido de los trabajadores y en los correos/WhatsApp automáticos. Ej: https://illium.health'
                  : 'Full URL used in worker referral links and in automated emails/WhatsApp. E.g. https://illium.health'}
              </p>
              <Input
                placeholder="https://illium.health"
                value={settings.publicSiteUrl || ''}
                onChange={(e) => setSettings({ ...settings, publicSiteUrl: e.target.value })}
              />
              <p className="text-[11px] text-slate-500">
                {locale === 'es'
                  ? 'Si lo dejas vacío, se usará el dominio actual (monaco-community.web.app).'
                  : 'If left empty, the current domain is used (monaco-community.web.app).'}
              </p>
            </div>

            <div className="rounded-lg border border-amber-200 bg-amber-50/80 p-4 space-y-2">
              <h3 className="text-sm font-semibold text-slate-900">{t('adminPage.settings.superadminTitle')}</h3>
              <p className="text-xs text-slate-600">{t('adminPage.settings.superadminBody')}</p>
              <p className="text-xs text-amber-900 font-medium">{t('adminPage.settings.superadminWarn')}</p>
              <textarea
                className="w-full border rounded-md p-3 text-sm h-24 outline-none focus:ring-2 focus:ring-blue-600 font-mono"
                placeholder="admin@empresa.com&#10;otro@empresa.com"
                value={adminEmailsText}
                onChange={(e) => setAdminEmailsText(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">{t('adminPage.settings.paymentMethods')}</label>
              <textarea
                className="w-full border rounded-md p-3 text-sm h-32 outline-none focus:ring-2 focus:ring-blue-600"
                placeholder="e.g. Zelle: email@lab.com, Bank Transfer: Account 1234..."
                value={settings.paymentMethods || ''}
                onChange={(e) => setSettings({ ...settings, paymentMethods: e.target.value })}
              />
              <p className="text-xs text-slate-500">{t('adminPage.settings.paymentMethodsHint')}</p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">{t('adminPage.settings.paymentMethodsEs')}</label>
              <textarea
                className="w-full border rounded-md p-3 text-sm h-32 outline-none focus:ring-2 focus:ring-blue-600"
                value={settings.paymentMethodsEs || ''}
                onChange={(e) => setSettings({ ...settings, paymentMethodsEs: e.target.value })}
              />
              <p className="text-xs text-slate-500">{t('adminPage.settings.paymentMethodsEsHint')}</p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">{t('adminPage.settings.commissionLegacy')}</label>
              <Input
                type="number"
                value={settings.commissionPercent ?? 10}
                onChange={(e) => setSettings({ ...settings, commissionPercent: parseFloat(e.target.value) })}
              />
              <p className="text-xs text-slate-500">{t('adminPage.settings.commissionLegacyHint')}</p>
            </div>

            <div className="rounded-lg border border-purple-200 bg-purple-50/60 p-4 space-y-4">
              <h3 className="text-sm font-semibold text-slate-900">
                {locale === 'es' ? 'WhatsApp del Propietario / Admin Principal' : 'Owner / Main Admin WhatsApp'}
              </h3>
              <p className="text-xs text-slate-600">
                {locale === 'es'
                  ? 'Este n\u00famero recibir\u00e1 notificaciones cada vez que un nuevo cliente o socio se registre en la plataforma.'
                  : 'This number will receive notifications whenever a new customer or partner signs up on the platform.'}
              </p>
              {/* Multi-number editor: admin can add N numbers, all will be notified */}
              <div className="space-y-3">
                {(Array.isArray(settings.ownerWhatsappNumbers) && settings.ownerWhatsappNumbers.length > 0
                  ? settings.ownerWhatsappNumbers
                  : [{ label: 'Primary', countryCode: settings.ownerWhatsappCountryCode || '+1', localNumber: settings.ownerWhatsappLocalNumber || '' }]
                ).map((entry: any, idx: number) => (
                  <div key={idx} className="rounded-lg border border-slate-200 bg-white p-3 flex flex-wrap gap-2 items-end">
                    <div className="flex-1 min-w-[120px] space-y-1">
                      <label className="text-xs font-medium text-slate-500">
                        {locale === 'es' ? 'Etiqueta' : 'Label'}
                      </label>
                      <Input
                        type="text"
                        placeholder="Primary"
                        value={entry.label || ''}
                        onChange={(e) => {
                          const arr = [...(settings.ownerWhatsappNumbers || [])];
                          arr[idx] = { ...entry, label: e.target.value };
                          setSettings({ ...settings, ownerWhatsappNumbers: arr });
                        }}
                      />
                    </div>
                    <div className="w-24 space-y-1">
                      <label className="text-xs font-medium text-slate-500">
                        {locale === 'es' ? 'País' : 'Country'}
                      </label>
                      <Input
                        type="text"
                        placeholder="+1"
                        value={entry.countryCode || ''}
                        onChange={(e) => {
                          const arr = [...(settings.ownerWhatsappNumbers || [])];
                          arr[idx] = { ...entry, countryCode: e.target.value };
                          setSettings({ ...settings, ownerWhatsappNumbers: arr });
                        }}
                      />
                    </div>
                    <div className="flex-1 min-w-[160px] space-y-1">
                      <label className="text-xs font-medium text-slate-500">
                        {locale === 'es' ? 'Número (solo dígitos)' : 'Number (digits only)'}
                      </label>
                      <Input
                        type="tel"
                        inputMode="numeric"
                        placeholder="7867592242"
                        value={entry.localNumber || ''}
                        onChange={(e) => {
                          const arr = [...(settings.ownerWhatsappNumbers || [])];
                          arr[idx] = { ...entry, localNumber: e.target.value.replace(/\D/g, '') };
                          setSettings({ ...settings, ownerWhatsappNumbers: arr });
                        }}
                      />
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="text-red-600 border-red-200 hover:bg-red-50"
                      onClick={() => {
                        const arr = (settings.ownerWhatsappNumbers || []).filter((_: any, i: number) => i !== idx);
                        setSettings({ ...settings, ownerWhatsappNumbers: arr });
                      }}
                    >
                      {locale === 'es' ? 'Quitar' : 'Remove'}
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const arr = [...(settings.ownerWhatsappNumbers || [])];
                    arr.push({ label: `Owner ${arr.length + 1}`, countryCode: '+1', localNumber: '' });
                    setSettings({ ...settings, ownerWhatsappNumbers: arr });
                  }}
                >
                  + {locale === 'es' ? 'Agregar número' : 'Add number'}
                </Button>
                <p className="text-[11px] text-slate-500">
                  {locale === 'es'
                    ? 'Todos los números listados recibirán notificaciones. Código de país con + y número solo dígitos.'
                    : 'All listed numbers will receive notifications. Country code with + and digits only.'}
                </p>
              </div>
            </div>

            <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-4 space-y-4">
              <h3 className="text-sm font-semibold text-slate-900">{t('adminPage.settings.whatsappCardTitle')}</h3>
              <p className="text-xs text-slate-600">{t('adminPage.settings.whatsappCardBody')}</p>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">{t('adminPage.settings.whatsappPhoneNumberId')}</label>
                <Input
                  type="text"
                  placeholder="Meta Phone number ID"
                  value={settings.metaWhatsappPhoneNumberId || ''}
                  onChange={(e) => setSettings({ ...settings, metaWhatsappPhoneNumberId: e.target.value })}
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">{t('adminPage.settings.whatsappTemplateName')}</label>
                  <Input
                    type="text"
                    value={settings.metaWhatsappTemplateName || 'hello_world'}
                    onChange={(e) => setSettings({ ...settings, metaWhatsappTemplateName: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">{t('adminPage.settings.whatsappTemplateLang')}</label>
                  <Input
                    type="text"
                    placeholder="en_US"
                    value={settings.metaWhatsappTemplateLang || 'en_US'}
                    onChange={(e) => setSettings({ ...settings, metaWhatsappTemplateLang: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">{t('adminPage.settings.whatsappBodyVariables')}</label>
                <Input
                  type="number"
                  min={0}
                  max={10}
                  value={settings.metaWhatsappTemplateBodyVariables ?? 0}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      metaWhatsappTemplateBodyVariables: Math.min(10, Math.max(0, parseInt(e.target.value, 10) || 0)),
                    })
                  }
                />
                <p className="text-xs text-slate-500">{t('adminPage.settings.whatsappBodyVariablesHint')}</p>
              </div>
            </div>

            <div className="rounded-lg border border-brand-100 bg-brand-50/30 p-4 space-y-4">
              <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                💰 {locale === 'es' ? 'Porcentajes de comisión' : 'Commission rates'}
              </h3>
              <p className="text-xs text-slate-600">
                {locale === 'es'
                  ? 'Valores entre 0 y 1 (ej. 0.40 = 40%). Se aplican a los nuevos pedidos.'
                  : 'Values between 0 and 1 (e.g. 0.40 = 40%). Applied to new orders.'}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-700">
                    {locale === 'es' ? 'Comisión directa (%)' : 'Direct commission (%)'}
                  </label>
                  <Input
                    type="number"
                    step="0.01"
                    min={0}
                    max={1}
                    value={settings.commissionDirectRate ?? 0.4}
                    onChange={(e) => setSettings({ ...settings, commissionDirectRate: parseFloat(e.target.value) || 0 })}
                  />
                  <p className="text-[10px] text-slate-500">= {Math.round((settings.commissionDirectRate ?? 0.4) * 100)}%</p>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-700">
                    {locale === 'es' ? 'Comisión upline (%)' : 'Upline commission (%)'}
                  </label>
                  <Input
                    type="number"
                    step="0.01"
                    min={0}
                    max={1}
                    value={settings.commissionUplineRate ?? 0.1}
                    onChange={(e) => setSettings({ ...settings, commissionUplineRate: parseFloat(e.target.value) || 0 })}
                  />
                  <p className="text-[10px] text-slate-500">= {Math.round((settings.commissionUplineRate ?? 0.1) * 100)}%</p>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-brand-100 bg-brand-50/30 p-4 space-y-4">
              <h3 className="text-sm font-semibold text-slate-900">
                {locale === 'es' ? '📧 Información de contacto (visible en /contact)' : '📧 Contact info (visible on /contact)'}
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-600">Email</label>
                  <Input
                    type="email"
                    placeholder="info@alliumhealth.net"
                    value={settings.contactEmail || ''}
                    onChange={(e) => setSettings({ ...settings, contactEmail: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-600">WhatsApp</label>
                  <Input
                    type="text"
                    placeholder="+1 (786) 759-2242"
                    value={settings.contactWhatsapp || ''}
                    onChange={(e) => setSettings({ ...settings, contactWhatsapp: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-600">{locale === 'es' ? 'Horario' : 'Hours'}</label>
                  <Input
                    type="text"
                    placeholder="Mon–Fri · 9am–6pm EST"
                    value={settings.contactHours || ''}
                    onChange={(e) => setSettings({ ...settings, contactHours: e.target.value })}
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">
                {locale === 'es' ? 'Instrucciones adicionales del Quiz IA' : 'Quiz AI additional instructions'}
              </label>
              <textarea
                className="w-full border rounded-md p-3 text-sm h-32 outline-none focus:ring-2 focus:ring-brand-600 font-mono"
                placeholder={locale === 'es'
                  ? 'Ej: Para 3 meses recomendar 3 unidades de cada producto. Para 6 meses recomendar 6 unidades...'
                  : 'E.g.: For 3 months recommend 3 units of each product. For 6 months recommend 6 units...'}
                value={settings.quizAiExtraPrompt || ''}
                onChange={(e) => setSettings({ ...settings, quizAiExtraPrompt: e.target.value })}
              />
              <p className="text-xs text-slate-500">
                {locale === 'es'
                  ? 'Se añade al prompt del quiz IA. Úsalo para personalizar cómo calcula las cantidades según duración, sexo, etc.'
                  : 'Appended to the quiz AI prompt. Use to customize how it calculates quantities by duration, sex, etc.'}
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">
                {locale === 'es' ? 'Video del Hero (MP4)' : 'Hero Video (MP4)'}
              </label>
              {settings.heroVideoUrl && (
                <div className="rounded-lg bg-slate-900 p-3 inline-block">
                  <video
                    src={settings.heroVideoUrl}
                    autoPlay
                    muted
                    loop
                    playsInline
                    className="h-32 w-auto rounded"
                  />
                </div>
              )}
              <Input
                type="text"
                placeholder="https://storage.googleapis.com/.../hero-video.mp4"
                value={settings.heroVideoUrl || ''}
                onChange={(e) => setSettings({ ...settings, heroVideoUrl: e.target.value })}
              />
              <p className="text-xs text-slate-500">
                {locale === 'es'
                  ? 'Video de fondo del hero (loop silencioso). Recomendado: MP4 8-15 seg, <10MB, aspecto 16:9. Generado con Veo 3. Dejar vacío para usar animación CSS.'
                  : 'Hero background video (silent loop). Recommended: MP4 8-15 sec, <10MB, 16:9. Generated with Veo 3. Leave empty for CSS animation fallback.'}
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Brand Logo URL (PNG with transparency recommended)</label>
              {settings.logoUrl && (
                <div className="rounded-lg bg-slate-900 p-4 inline-block">
                  <img src={settings.logoUrl} alt="Logo" className="h-8 w-auto" />
                </div>
              )}
              <Input
                type="text"
                placeholder="https://storage.googleapis.com/.../illium-logo-light.png"
                value={settings.logoUrl || ''}
                onChange={(e) => setSettings({ ...settings, logoUrl: e.target.value })}
              />
              <p className="text-xs text-slate-500">Leave empty to use the default logo. Recommend horizontal PNG with transparent background.</p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">{t('adminPage.settings.aiPrompt')}</label>
              <textarea
                className="w-full border rounded-md p-3 text-sm h-32 outline-none focus:ring-2 focus:ring-brand-600"
                placeholder={t('adminPage.settings.aiPromptPh')}
                value={settings.aiPrompt || ''}
                onChange={(e) => setSettings({ ...settings, aiPrompt: e.target.value })}
              />
            </div>

            {/* ─── Zelle (admin-configurable QR + number) ─── */}
            <div className="rounded-2xl border-2 border-purple-200 bg-purple-50/60 p-5 space-y-3">
              <h3 className="text-base font-bold text-slate-900">
                {locale === 'es' ? 'Pagos con Zelle' : 'Zelle payments'}
              </h3>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">
                  {locale === 'es' ? 'Código QR de Zelle' : 'Zelle QR code'}
                </label>
                <div className="flex items-start gap-4 flex-wrap">
                  {settings.zelleQrUrl ? (
                    <div className="relative rounded-lg bg-white border border-slate-200 p-3 shrink-0">
                      <img src={settings.zelleQrUrl} alt="Zelle QR" className="h-36 w-36 object-contain" />
                      <button
                        type="button"
                        onClick={() => setSettings({ ...settings, zelleQrUrl: '' })}
                        className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-red-500 hover:bg-red-400 text-white text-xs font-bold flex items-center justify-center shadow"
                        title={locale === 'es' ? 'Quitar' : 'Remove'}
                      >
                        ×
                      </button>
                    </div>
                  ) : (
                    <div className="h-36 w-36 shrink-0 rounded-lg border-2 border-dashed border-slate-300 bg-white flex items-center justify-center text-xs text-slate-400 text-center px-2">
                      {locale === 'es' ? 'Sin QR cargado' : 'No QR uploaded'}
                    </div>
                  )}
                  <div className="flex-1 min-w-[200px] space-y-2">
                    <label
                      className={`flex flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed cursor-pointer transition px-4 py-5 ${
                        zelleQrUploading
                          ? 'border-purple-300 bg-purple-100/60 cursor-wait'
                          : 'border-purple-300 bg-white hover:bg-purple-50'
                      }`}
                    >
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/svg+xml"
                        className="hidden"
                        disabled={zelleQrUploading}
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (file) await uploadZelleQr(file);
                          e.currentTarget.value = '';
                        }}
                      />
                      {zelleQrUploading ? (
                        <span className="text-xs font-bold text-purple-700">
                          {locale === 'es' ? 'Subiendo…' : 'Uploading…'}
                        </span>
                      ) : (
                        <>
                          <span className="text-sm font-bold text-purple-700">
                            {locale === 'es' ? '📤 Subir imagen' : '📤 Upload image'}
                          </span>
                          <span className="text-[10px] text-slate-500 text-center">
                            {locale === 'es'
                              ? 'PNG / JPG / WebP — Click o arrastra el archivo'
                              : 'PNG / JPG / WebP — Click or drop your file'}
                          </span>
                        </>
                      )}
                    </label>
                    <div className="text-[10px] text-slate-400 text-center">
                      {locale === 'es' ? '— o pega un URL directo —' : '— or paste a direct URL —'}
                    </div>
                    <Input
                      type="text"
                      placeholder="https://…/zelle-qr.png"
                      value={settings.zelleQrUrl || ''}
                      onChange={(e) => setSettings({ ...settings, zelleQrUrl: e.target.value })}
                      className="text-xs"
                    />
                  </div>
                </div>
                <p className="text-xs text-slate-500">
                  {locale === 'es'
                    ? 'Sube tu QR directamente desde aquí o pega un URL si ya está hospedado.'
                    : 'Upload your QR straight from here, or paste a URL if already hosted.'}
                </p>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">
                  {locale === 'es' ? 'Número Zelle (a mostrar en el checkout)' : 'Zelle number (shown at checkout)'}
                </label>
                <Input
                  type="text"
                  placeholder="(786) 948-0879"
                  value={settings.zelleNumber || ''}
                  onChange={(e) => setSettings({ ...settings, zelleNumber: e.target.value })}
                />
              </div>
            </div>

            {/* ─── Stripe (card payments) ─── */}
            <div className="rounded-2xl border-2 border-indigo-200 bg-indigo-50/60 p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-slate-900">
                  {locale === 'es' ? 'Pagos con tarjeta (Stripe)' : 'Card payments (Stripe)'}
                </h3>
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!settings.cardPaymentsEnabled}
                    onChange={(e) => setSettings({ ...settings, cardPaymentsEnabled: e.target.checked })}
                    className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="text-xs font-bold text-slate-700">
                    {locale === 'es' ? 'Habilitar' : 'Enable'}
                  </span>
                </label>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">
                  {locale === 'es' ? 'Stripe Publishable Key' : 'Stripe Publishable Key'} <span className="text-[10px] text-slate-400 font-normal">(pk_test_… o pk_live_…)</span>
                </label>
                <Input
                  type="text"
                  placeholder="pk_test_…"
                  value={settings.stripePublishableKey || ''}
                  onChange={(e) => setSettings({ ...settings, stripePublishableKey: e.target.value })}
                  className="font-mono text-xs"
                />
                <p className="text-xs text-slate-500">
                  {locale === 'es'
                    ? 'La Secret Key (sk_…) NO se pone aquí — va en las variables de entorno de Cloud Functions (STRIPE_SECRET_KEY). Pídela al desarrollador.'
                    : 'The Secret Key (sk_…) goes NOT here — it lives in Cloud Functions env vars (STRIPE_SECRET_KEY). Ask the developer.'}
                </p>
              </div>
              <div className="text-xs text-indigo-800 bg-indigo-100 border border-indigo-200 rounded-lg p-3">
                {locale === 'es'
                  ? '💡 Cuando esté habilitado, los clientes verán “Pagar con tarjeta” como segunda opción además de Zelle al finalizar la compra.'
                  : '💡 When enabled, customers see "Pay with card" as a second option alongside Zelle at checkout.'}
              </div>
            </div>

            {/* Protocol Analyzer prompts (per locale) — used by AdminSales / WorkerPanel "Ver protocolo IA". */}
            <div className="space-y-2 rounded-xl border border-brand-100 bg-brand-50/40 p-4">
              <div>
                <label className="text-sm font-bold text-slate-800">Protocol Analyzer prompt</label>
                <p className="text-xs text-slate-500 mt-0.5">
                  Used by the "View protocol" button on orders (admin + worker panels). Two slots — one
                  per language. Leave empty to use the built-in default. The training lessons above are
                  automatically appended as context.
                </p>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">English prompt</label>
                <textarea
                  className="w-full border rounded-md p-3 text-sm h-32 outline-none focus:ring-2 focus:ring-brand-600"
                  placeholder="You are a clinical assistant helping a certified physician…"
                  value={settings.protocolPromptEn || ''}
                  onChange={(e) => setSettings({ ...settings, protocolPromptEn: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Spanish prompt</label>
                <textarea
                  className="w-full border rounded-md p-3 text-sm h-32 outline-none focus:ring-2 focus:ring-brand-600"
                  placeholder="Eres un asistente clínico que ayuda a un médico certificado…"
                  value={settings.protocolPromptEs || ''}
                  onChange={(e) => setSettings({ ...settings, protocolPromptEs: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">{t('adminPage.settings.heroTitle')}</label>
              <Input
                type="text"
                placeholder="Highly Purified Peptides & Research Compounds"
                value={settings.heroTitle || ''}
                onChange={(e) => setSettings({ ...settings, heroTitle: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">{t('adminPage.settings.heroSubtitle')}</label>
              <textarea
                className="w-full border rounded-md p-3 text-sm h-24 outline-none focus:ring-2 focus:ring-blue-600"
                placeholder="Trusted by researchers worldwide..."
                value={settings.heroSubtitle || ''}
                onChange={(e) => setSettings({ ...settings, heroSubtitle: e.target.value })}
              />
            </div>

            <div className="rounded-lg border border-blue-100 bg-blue-50/50 p-4 space-y-4">
              <h3 className="text-sm font-semibold text-slate-900">{t('adminPage.settings.spanishBlockTitle')}</h3>
              <p className="text-xs text-slate-600">{t('adminPage.settings.spanishBlockHint')}</p>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">{t('adminPage.settings.heroTitleEs')}</label>
                <Input
                  type="text"
                  value={settings.heroTitleEs || ''}
                  onChange={(e) => setSettings({ ...settings, heroTitleEs: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">{t('adminPage.settings.heroSubtitleEs')}</label>
                <textarea
                  className="w-full border rounded-md p-3 text-sm h-24 outline-none focus:ring-2 focus:ring-blue-600"
                  value={settings.heroSubtitleEs || ''}
                  onChange={(e) => setSettings({ ...settings, heroSubtitleEs: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">{t('adminPage.settings.categoriesTitleEs')}</label>
                <Input
                  type="text"
                  value={settings.categoriesSectionTitleEs || ''}
                  onChange={(e) => setSettings({ ...settings, categoriesSectionTitleEs: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">{t('adminPage.settings.categoriesSectionTitle')}</label>
              <Input
                type="text"
                value={settings.categoriesSectionTitle || ''}
                onChange={(e) => setSettings({ ...settings, categoriesSectionTitle: e.target.value })}
              />
            </div>

            <div className="space-y-4 pt-4 border-t">
              <h3 className="font-medium text-slate-900">{t('adminPage.settings.categoriesLayoutTitle')}</h3>
              <p className="text-xs text-slate-500">{t('adminPage.settings.categoriesLayoutHint')}</p>
              {(settings.categories || []).map((cat: any, idx: number) => (
                <CategoryRow
                  key={idx}
                  cat={cat}
                  index={idx}
                  uploading={uploadingIndex === idx}
                  onUpdate={handleUpdateCategory}
                  onRemove={handleRemoveCategory}
                  onUpload={uploadCategoryImage}
                  t={t}
                />
              ))}
              <Button type="button" variant="outline" size="sm" onClick={handleAddCategory}>
                <Plus className="w-4 h-4 mr-2" /> {t('adminPage.settings.addCategory')}
              </Button>
            </div>

            <Button type="submit" variant="primary" disabled={saving}>
              {saving ? t('adminPage.settings.saving') : t('adminPage.settings.saveSettings')}
            </Button>

            {/* ── Cleanup test data ── */}
            <div className="rounded-2xl border-2 border-red-200 bg-red-50/30 p-5 space-y-4 mt-8">
              <div className="flex items-center gap-2">
                <Trash2 className="h-5 w-5 text-red-600" />
                <h3 className="text-sm font-bold text-red-900">
                  {locale === 'es' ? 'Limpiar datos de prueba' : 'Clean up test data'}
                </h3>
              </div>
              <p className="text-xs text-red-800">
                {locale === 'es'
                  ? 'Elimina pedidos, leads y/o ventas manuales. Esto es irreversible. Úsalo antes de lanzar para quitar datos de prueba.'
                  : 'Delete orders, leads, and/or manual sales. This is irreversible. Use before launch to remove test data.'}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="text-red-700 border-red-300 hover:bg-red-100"
                  onClick={async () => {
                    if (!window.confirm(locale === 'es' ? '¿Eliminar TODOS los pedidos? Esto es irreversible.' : 'Delete ALL orders? This is irreversible.')) return;
                    const { collection: col, getDocs, deleteDoc: dd } = await import('firebase/firestore');
                    const snap = await getDocs(col(db, 'orders'));
                    let count = 0;
                    for (const d of snap.docs) { await dd(d.ref); count++; }
                    showFeedback(locale === 'es' ? 'Pedidos eliminados' : 'Orders deleted', `${count} ${locale === 'es' ? 'pedidos borrados' : 'orders removed'}`);
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1" />
                  {locale === 'es' ? 'Borrar todos los pedidos' : 'Delete all orders'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="text-red-700 border-red-300 hover:bg-red-100"
                  onClick={async () => {
                    if (!window.confirm(locale === 'es' ? '¿Eliminar TODOS los leads?' : 'Delete ALL leads?')) return;
                    const { collection: col, getDocs, deleteDoc: dd } = await import('firebase/firestore');
                    const snap = await getDocs(col(db, 'leads'));
                    let count = 0;
                    for (const d of snap.docs) { await dd(d.ref); count++; }
                    showFeedback(locale === 'es' ? 'Leads eliminados' : 'Leads deleted', `${count} ${locale === 'es' ? 'leads borrados' : 'leads removed'}`);
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1" />
                  {locale === 'es' ? 'Borrar todos los leads' : 'Delete all leads'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="text-red-700 border-red-300 hover:bg-red-100"
                  onClick={async () => {
                    if (!window.confirm(locale === 'es' ? '¿Eliminar TODAS las ventas manuales?' : 'Delete ALL manual sales?')) return;
                    const { collection: col, getDocs, deleteDoc: dd } = await import('firebase/firestore');
                    const snap = await getDocs(col(db, 'manualSales'));
                    let count = 0;
                    for (const d of snap.docs) { await dd(d.ref); count++; }
                    showFeedback(locale === 'es' ? 'Ventas eliminadas' : 'Sales deleted', `${count} ${locale === 'es' ? 'ventas borradas' : 'sales removed'}`);
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1" />
                  {locale === 'es' ? 'Borrar ventas manuales' : 'Delete manual sales'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="text-red-700 border-red-300 hover:bg-red-100"
                  onClick={async () => {
                    if (!window.confirm(locale === 'es' ? '¿Eliminar historial de inventario?' : 'Delete inventory history?')) return;
                    const { collection: col, getDocs, deleteDoc: dd } = await import('firebase/firestore');
                    const snap = await getDocs(col(db, 'inventoryLogs'));
                    let count = 0;
                    for (const d of snap.docs) { await dd(d.ref); count++; }
                    showFeedback(locale === 'es' ? 'Historial eliminado' : 'History deleted', `${count} ${locale === 'es' ? 'registros borrados' : 'records removed'}`);
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1" />
                  {locale === 'es' ? 'Borrar historial inventario' : 'Delete inventory logs'}
                </Button>
              </div>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function CategoryRow({
  cat,
  index,
  uploading,
  onUpdate,
  onRemove,
  onUpload,
  t,
}: {
  cat: { name?: string; color?: string; path?: string; imageUrl?: string };
  index: number;
  uploading: boolean;
  onUpdate: (index: number, field: string, value: string) => void;
  onRemove: (index: number) => void;
  onUpload: (index: number, file: File) => void;
  t: (path: string) => string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files?.[0];
      if (file && file.type.startsWith('image/')) onUpload(index, file);
    },
    [index, onUpload]
  );

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-4 space-y-3">
      <div className="grid gap-3 md:grid-cols-3">
        <Input
          placeholder={t('adminPage.settings.catName')}
          value={cat.name || ''}
          onChange={(e) => onUpdate(index, 'name', e.target.value)}
        />
        <Input
          placeholder={t('adminPage.settings.catColor')}
          value={cat.color || ''}
          onChange={(e) => onUpdate(index, 'color', e.target.value)}
        />
        <Input
          placeholder={t('adminPage.settings.catPath')}
          value={cat.path || ''}
          onChange={(e) => onUpdate(index, 'path', e.target.value)}
        />
      </div>
      <div className="flex flex-col sm:flex-row gap-3 items-start">
        <div
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click();
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          className={`flex-1 min-h-[120px] w-full sm:max-w-xs rounded-lg border-2 border-dashed flex flex-col items-center justify-center gap-2 cursor-pointer transition-colors ${
            dragOver ? 'border-blue-500 bg-blue-50' : 'border-slate-300 bg-white hover:border-slate-400'
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onUpload(index, f);
              e.target.value = '';
            }}
          />
          {uploading ? (
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          ) : cat.imageUrl ? (
            <img src={cat.imageUrl} alt="" className="max-h-24 max-w-full object-contain rounded" />
          ) : (
            <>
              <Upload className="w-6 h-6 text-slate-400" />
              <span className="text-xs text-slate-500 text-center px-2">{t('adminPage.settings.catDrop')}</span>
            </>
          )}
        </div>
        <div className="flex flex-col gap-2 flex-1">
          <label className="text-xs font-medium text-slate-600">{t('adminPage.settings.catImageUrl')}</label>
          <div className="flex gap-2">
            <Input
              placeholder="https://..."
              value={cat.imageUrl || ''}
              onChange={(e) => onUpdate(index, 'imageUrl', e.target.value)}
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => inputRef.current?.click()}
              title={t('adminPage.settings.catUploadTitle')}
            >
              <ImageIcon className="w-4 h-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => onRemove(index)}
              title={t('adminPage.settings.catRemoveTitle')}
            >
              <Trash2 className="w-4 h-4 text-red-500" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
