import { useState, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Pencil, Trash2, Image as ImageIcon, Loader2, ArrowLeft } from 'lucide-react';
import { db, storage } from '@/lib/firebase';
import { collection, doc, deleteDoc, setDoc, addDoc, writeBatch, deleteField } from 'firebase/firestore';
import { getEffectivePrice } from '@/lib/pricing';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import type { Product } from '@/store';
import { useAppStore, useToastStore } from '@/store';
import { Dialog } from '@/components/ui/dialog';
import { Combobox } from '@/components/ui/combobox';
import { useI18n } from '@/i18n/I18nContext';

function FieldLabel({ htmlFor, children }: { htmlFor?: string; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="block text-sm font-medium text-slate-700 mb-1.5">
      {children}
    </label>
  );
}

function FieldHint({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-slate-500 mt-1">{children}</p>;
}

export function AdminProducts() {
  const { t, locale } = useI18n();
  const products = useAppStore((state) => state.products);
  const showToast = useToastStore((s) => s.showToast);
  const [isEditing, setIsEditing] = useState(false);
  const [currentProduct, setCurrentProduct] = useState<Partial<Product>>({});
  const [uploadingImage, setUploadingImage] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMessage, setDialogMessage] = useState({ title: '', description: '' });
  const [saving, setSaving] = useState(false);
  const [bulkSelected, setBulkSelected] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const [deleting, setDeleting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const showDialog = (title: string, description: string) => {
    setDialogMessage({ title, description });
    setDialogOpen(true);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingImage(true);
    try {
      const storageRef = ref(storage, `products/${Date.now()}_${file.name}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      setCurrentProduct({ ...currentProduct, img: url });
    } catch (error) {
      console.error('Error uploading image:', error);
      showDialog(t('adminPage.products.uploadFailTitle'), t('adminPage.products.uploadFailBody'));
    } finally {
      setUploadingImage(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const benefits = Array.isArray(currentProduct.benefits) ? currentProduct.benefits : [];
      const benefitsEs = Array.isArray(currentProduct.benefitsEs) ? currentProduct.benefitsEs : [];

      const dType = currentProduct.discountType;
      const dValue = Number(currentProduct.discountValue) || 0;
      const hasDiscount = (dType === 'percent' || dType === 'fixed') && dValue > 0;
      const payload: Record<string, unknown> = {
        name: currentProduct.name,
        nameEs: currentProduct.nameEs ?? '',
        category: currentProduct.category,
        price: currentProduct.price,
        cost: currentProduct.cost ?? 0,
        stock: currentProduct.stock,
        img: currentProduct.img || '',
        description: currentProduct.description || '',
        descriptionEs: currentProduct.descriptionEs ?? '',
        benefits,
        benefitsEs,
        targetGender: currentProduct.targetGender ?? 'both',
        dosageNote: currentProduct.dosageNote ?? '',
        protocol: currentProduct.protocol ?? '',
        monthsSupplyPerVial: Number(currentProduct.monthsSupplyPerVial) || 1,
      };
      if (hasDiscount) {
        payload.discountType = dType;
        payload.discountValue = dValue;
      } else if (currentProduct.id) {
        // Existing product without discount: clear fields
        payload.discountType = deleteField();
        payload.discountValue = 0;
      }

      let savedId = currentProduct.id;
      if (currentProduct.id) {
        await setDoc(doc(db, 'products', currentProduct.id), payload, { merge: true });
      } else {
        const created = await addDoc(collection(db, 'products'), payload);
        savedId = created.id;
      }
      // Keep the editor open on the just-saved product so the admin sees the values
      // persisted (cost, dosage note, etc.) and confirms with a success toast.
      setCurrentProduct({ ...currentProduct, id: savedId });
      showToast(locale === 'es' ? '✓ Producto guardado' : '✓ Product saved');
    } catch (error) {
      console.error('Error saving product', error);
      const detail = error instanceof Error ? error.message : String(error);
      showDialog(t('adminPage.products.saveFailTitle'), `${t('adminPage.products.saveFailBody')}\n\n${detail}`);
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteDoc(doc(db, 'products', deleteTarget.id));
      showToast(locale === 'es' ? '🗑️ Producto eliminado' : '🗑️ Product deleted');
      setDeleteTarget(null);
    } catch (error) {
      console.error(error);
      showDialog(t('adminPage.products.deleteFailTitle'), t('adminPage.products.deleteFailBody'));
    } finally {
      setDeleting(false);
    }
  };

  if (isEditing) {
    const benefitsStrEn = Array.isArray(currentProduct.benefits) ? currentProduct.benefits.join(', ') : '';
    const benefitsStrEs = Array.isArray(currentProduct.benefitsEs) ? currentProduct.benefitsEs.join(', ') : '';

    return (
      <div className="max-w-2xl bg-white p-6 rounded-lg shadow-sm border border-slate-200">
        <Dialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          title={dialogMessage.title}
          description={dialogMessage.description}
        />
        {/* Back button — lets the admin return to the product list at any time,
            on any screen size, without refreshing the page. */}
        <button
          type="button"
          onClick={() => setIsEditing(false)}
          className="inline-flex items-center gap-1.5 mb-4 -ml-1 px-2 py-1.5 rounded-lg text-sm font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          {locale === 'es' ? 'Volver a productos' : 'Back to products'}
        </button>
        <h2 className="text-xl font-bold mb-2 text-slate-900">
          {currentProduct.id ? t('adminPage.products.editTitle') : t('adminPage.products.addTitle')}
        </h2>
        <p className="text-sm text-slate-600 mb-6 border-b border-slate-100 pb-4">{t('adminPage.products.formIntro')}</p>
        <form onSubmit={handleSave} className="space-y-5">
          <div>
            <FieldLabel htmlFor="product-name-en">{t('adminPage.products.nameEn')}</FieldLabel>
            <Input
              id="product-name-en"
              value={currentProduct.name || ''}
              onChange={(e) => setCurrentProduct({ ...currentProduct, name: e.target.value })}
              required
            />
          </div>

          <div>
            <FieldLabel htmlFor="product-name-es">{t('adminPage.products.nameEs')}</FieldLabel>
            <Input
              id="product-name-es"
              value={currentProduct.nameEs || ''}
              onChange={(e) => setCurrentProduct({ ...currentProduct, nameEs: e.target.value })}
            />
          </div>

          <div>
            <FieldLabel htmlFor="product-category">{t('adminPage.products.category')}</FieldLabel>
            <Combobox
              value={currentProduct.category || ''}
              onChange={(v) => setCurrentProduct({ ...currentProduct, category: v })}
              options={[
                { value: 'metabolic', label: 'Metabolic & Physical', sublabel: 'Fat loss, body composition' },
                { value: 'recovery', label: 'Recovery & Regeneration', sublabel: 'Healing, tissue repair' },
                { value: 'nootropics', label: 'Nootropics (Cognitive)', sublabel: 'Focus, mental performance' },
                { value: 'nad', label: 'NAD+', sublabel: 'Energy, longevity' },
                { value: 'peptides', label: 'Peptides (General)', sublabel: 'Other peptides' },
                { value: 'blends', label: 'Custom Blends', sublabel: 'Premium combinations' },
              ]}
              placeholder="— Select category —"
            />
            <FieldHint>{t('adminPage.products.categoryHint')}</FieldHint>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <FieldLabel htmlFor="product-price">{t('adminPage.products.price')}</FieldLabel>
              <Input
                id="product-price"
                type="number"
                step="0.01"
                min={0}
                value={currentProduct.price ?? ''}
                onChange={(e) =>
                  setCurrentProduct({ ...currentProduct, price: parseFloat(e.target.value) || 0 })
                }
                required
              />
            </div>
            <div>
              <FieldLabel htmlFor="product-cost">
                {locale === 'es' ? 'Costo (tu costo)' : 'Cost (your cost)'}
              </FieldLabel>
              <Input
                id="product-cost"
                type="number"
                step="0.01"
                min={0}
                value={currentProduct.cost ?? ''}
                onChange={(e) =>
                  setCurrentProduct({ ...currentProduct, cost: parseFloat(e.target.value) || 0 })
                }
                placeholder="0.00"
              />
              <FieldHint>{locale === 'es' ? 'Lo que te cuesta adquirir/producir' : 'What it costs you to acquire/produce'}</FieldHint>
            </div>
            <div>
              <FieldLabel htmlFor="product-stock">{t('adminPage.products.stock')}</FieldLabel>
              <Input
                id="product-stock"
                type="number"
                min={0}
                value={currentProduct.stock ?? ''}
                onChange={(e) =>
                  setCurrentProduct({ ...currentProduct, stock: parseInt(e.target.value, 10) || 0 })
                }
                required
              />
            </div>
          </div>

          <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-4">
            <FieldLabel>{locale === 'es' ? 'Descuento del producto' : 'Product discount'}</FieldLabel>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-1">
              <div>
                <select
                  className="w-full border border-slate-200 rounded-md p-2 text-sm bg-white outline-none focus:ring-2 focus:ring-amber-500"
                  value={currentProduct.discountType ?? ''}
                  onChange={(e) => {
                    const v = e.target.value;
                    setCurrentProduct({
                      ...currentProduct,
                      discountType: v === 'percent' || v === 'fixed' ? v : undefined,
                      discountValue: v ? currentProduct.discountValue : 0,
                    });
                  }}
                >
                  <option value="">{locale === 'es' ? 'Sin descuento' : 'No discount'}</option>
                  <option value="percent">{locale === 'es' ? 'Porcentaje (%)' : 'Percent (%)'}</option>
                  <option value="fixed">{locale === 'es' ? 'Monto fijo ($)' : 'Fixed amount ($)'}</option>
                </select>
              </div>
              <div>
                <Input
                  type="number"
                  step="0.01"
                  min={0}
                  value={currentProduct.discountValue ?? ''}
                  onChange={(e) =>
                    setCurrentProduct({ ...currentProduct, discountValue: parseFloat(e.target.value) || 0 })
                  }
                  placeholder={currentProduct.discountType === 'percent' ? '10' : '5.00'}
                  disabled={!currentProduct.discountType}
                />
              </div>
            </div>
            {currentProduct.discountType && (currentProduct.discountValue ?? 0) > 0 && currentProduct.price ? (
              <FieldHint>
                {locale === 'es' ? 'Precio final:' : 'Final price:'}{' '}
                <strong>${getEffectivePrice(currentProduct as Product).finalPrice.toFixed(2)}</strong>{' '}
                <span className="text-slate-400 line-through">${Number(currentProduct.price).toFixed(2)}</span>
              </FieldHint>
            ) : null}
          </div>

          <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-4 space-y-4">
            <FieldLabel>
              {locale === 'es' ? 'Datos para la IA del Quiz' : 'Quiz AI metadata'}
            </FieldLabel>
            <p className="text-xs text-slate-600 -mt-2">
              {locale === 'es'
                ? 'Estos campos los usa la IA para recomendar este producto correctamente. Si los dejas vacíos, la IA puede equivocarse.'
                : 'These fields help the AI recommend this product accurately. Leaving them blank may cause hallucinations.'}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <FieldLabel htmlFor="product-target-gender">
                  {locale === 'es' ? 'Recomendado para' : 'Recommended for'}
                </FieldLabel>
                <select
                  id="product-target-gender"
                  className="w-full border border-slate-200 rounded-md p-2 text-sm bg-white outline-none focus:ring-2 focus:ring-emerald-500"
                  value={currentProduct.targetGender ?? 'both'}
                  onChange={(e) =>
                    setCurrentProduct({
                      ...currentProduct,
                      targetGender: e.target.value as 'male' | 'female' | 'both',
                    })
                  }
                >
                  <option value="both">{locale === 'es' ? 'Ambos (hombre y mujer)' : 'Both (male & female)'}</option>
                  <option value="male">{locale === 'es' ? 'Solo hombre' : 'Male only'}</option>
                  <option value="female">{locale === 'es' ? 'Solo mujer' : 'Female only'}</option>
                </select>
                <FieldHint>
                  {locale === 'es'
                    ? 'La IA solo recomendará este producto al género indicado.'
                    : 'AI will only recommend to the selected gender.'}
                </FieldHint>
              </div>
              <div>
                <FieldLabel htmlFor="product-months-vial">
                  {locale === 'es' ? 'Meses de suministro por vial' : 'Months of supply per vial'}
                </FieldLabel>
                <Input
                  id="product-months-vial"
                  type="number"
                  // step="any" + min=0 so the browser accepts whole numbers (1, 2…)
                  // and decimals alike. The previous min=0.25/step=0.5 combo made
                  // every integer "invalid" and blocked editing entirely.
                  step="any"
                  min={0}
                  value={currentProduct.monthsSupplyPerVial ?? ''}
                  onChange={(e) => {
                    const raw = e.target.value;
                    setCurrentProduct({
                      ...currentProduct,
                      // Keep the field editable while typing (allow empty); only
                      // coerce to a number when there's a value. Saved value falls
                      // back to 1 in handleSave via `Number(...) || 1`.
                      monthsSupplyPerVial: raw === '' ? undefined : (parseFloat(raw) || 0),
                    });
                  }}
                  placeholder="1"
                />
                <FieldHint>
                  {locale === 'es'
                    ? 'Ej: 1 vial cubre 1 mes a la dosis estándar.'
                    : 'E.g. 1 vial covers 1 month at the standard dose.'}
                </FieldHint>
              </div>
            </div>
            <div>
              <FieldLabel htmlFor="product-dosage-note">
                {locale === 'es' ? 'Nota de dosis (para la IA)' : 'Dosage note (for AI)'}
              </FieldLabel>
              <textarea
                id="product-dosage-note"
                className="w-full border border-slate-200 rounded-md p-3 text-sm min-h-[80px] outline-none focus:ring-2 focus:ring-emerald-500"
                value={currentProduct.dosageNote || ''}
                onChange={(e) => setCurrentProduct({ ...currentProduct, dosageNote: e.target.value })}
                placeholder={locale === 'es'
                  ? 'Ej: protocolo típico 0.25mg/semana, titrar a 1mg/semana'
                  : 'E.g. typical protocol 0.25mg/week, titrate up to 1mg/week'}
              />
              <FieldHint>
                {locale === 'es'
                  ? 'Dosis exacta por toma (cantidad y unidades). Texto interno que ve la IA — no se muestra al cliente.'
                  : 'Exact dose per administration (amount + units). Internal text the AI sees — not shown to customers.'}
              </FieldHint>
            </div>

            {/* Per-product protocol — the AI uses this VERBATIM when building the
                order protocol (orderProtocol.ts reads `live.protocol`). This is
                where the admin specifies how the product is actually used:
                frequency per day/week, route, timing, cycle length, reconstitution. */}
            <div>
              <FieldLabel htmlFor="product-protocol">
                {locale === 'es'
                  ? '📋 Protocolo de uso (cómo se usa — para la IA)'
                  : '📋 Usage protocol (how to use — for AI)'}
              </FieldLabel>
              <textarea
                id="product-protocol"
                className="w-full border border-emerald-300 rounded-md p-3 text-sm min-h-[150px] outline-none focus:ring-2 focus:ring-emerald-500"
                value={currentProduct.protocol || ''}
                onChange={(e) => setCurrentProduct({ ...currentProduct, protocol: e.target.value })}
                placeholder={locale === 'es'
                  ? `Ej:
• Dosis: 0.75 mg por aplicación
• Frecuencia: 1 vez al día, antes de dormir
• Vía: subcutánea (SC)
• Ciclo: 8–12 semanas, descanso de 4 semanas
• Reconstitución: 2 ml de agua bacteriostática; marcar 0.75 ml en jeringa de insulina`
                  : `E.g.:
• Dose: 0.75 mg per injection
• Frequency: once daily, before bed
• Route: subcutaneous (SC)
• Cycle: 8–12 weeks, 4-week break
• Reconstitution: 2 ml bacteriostatic water; draw 0.75 ml on insulin syringe`}
              />
              <FieldHint>
                {locale === 'es'
                  ? 'Aquí defines CÓMO se usa este producto: cuántas veces al día/semana, vía, momento, duración del ciclo y reconstitución. La IA lo usa tal cual al armar el protocolo de cada pedido. Entre más completo, menos campos quedan en [corchetes] para el médico.'
                  : 'Define HOW this product is used: times per day/week, route, timing, cycle length, reconstitution. The AI uses it verbatim when building each order protocol. The more complete, the fewer [bracketed] gaps for the physician.'}
              </FieldHint>
            </div>
          </div>

          <div>
            <FieldLabel htmlFor="product-img-url">{t('adminPage.products.imageUrl')}</FieldLabel>
            <Input
              id="product-img-url"
              value={currentProduct.img || ''}
              onChange={(e) => setCurrentProduct({ ...currentProduct, img: e.target.value })}
              placeholder="https://..."
            />
          </div>

          <div>
            <FieldLabel>{t('adminPage.products.uploadImage')}</FieldLabel>
            <div
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click();
              }}
              className="border-2 border-dashed border-slate-300 rounded-lg p-6 flex flex-col items-center justify-center text-slate-500 hover:bg-slate-50 cursor-pointer transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept="image/*"
                onChange={handleImageUpload}
              />
              {uploadingImage ? (
                <Loader2 className="w-8 h-8 animate-spin text-blue-600 mb-2" />
              ) : currentProduct.img ? (
                <>
                  <img src={currentProduct.img} alt="" className="h-32 object-contain mb-2 rounded" />
                  <span className="text-sm font-medium text-slate-600">{t('adminPage.products.preview')}</span>
                </>
              ) : (
                <>
                  <ImageIcon className="w-8 h-8 mb-2" />
                  <span className="text-sm font-medium">{t('adminPage.products.clickUpload')}</span>
                </>
              )}
            </div>
          </div>

          <div>
            <FieldLabel htmlFor="product-description-en">{t('adminPage.products.descriptionEn')}</FieldLabel>
            <textarea
              id="product-description-en"
              className="w-full border border-slate-200 rounded-md p-3 text-sm min-h-[100px] outline-none focus:ring-2 focus:ring-blue-600"
              value={currentProduct.description || ''}
              onChange={(e) => setCurrentProduct({ ...currentProduct, description: e.target.value })}
            />
          </div>

          <div>
            <FieldLabel htmlFor="product-description-es">{t('adminPage.products.descriptionEs')}</FieldLabel>
            <textarea
              id="product-description-es"
              className="w-full border border-slate-200 rounded-md p-3 text-sm min-h-[100px] outline-none focus:ring-2 focus:ring-blue-600"
              value={currentProduct.descriptionEs || ''}
              onChange={(e) => setCurrentProduct({ ...currentProduct, descriptionEs: e.target.value })}
            />
          </div>

          <div>
            <FieldLabel htmlFor="product-benefits-en">{t('adminPage.products.benefitsEn')}</FieldLabel>
            <Input
              id="product-benefits-en"
              value={benefitsStrEn}
              onChange={(e) =>
                setCurrentProduct({
                  ...currentProduct,
                  benefits: e.target.value
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean),
                })
              }
            />
            <FieldHint>{t('adminPage.products.benefitsHint')}</FieldHint>
          </div>

          <div>
            <FieldLabel htmlFor="product-benefits-es">{t('adminPage.products.benefitsEs')}</FieldLabel>
            <Input
              id="product-benefits-es"
              value={benefitsStrEs}
              onChange={(e) =>
                setCurrentProduct({
                  ...currentProduct,
                  benefitsEs: e.target.value
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean),
                })
              }
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-4 border-t border-slate-100">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setIsEditing(false)}
              className="text-slate-600"
            >
              <ArrowLeft className="w-4 h-4 mr-1.5" />
              {locale === 'es' ? 'Volver a productos' : 'Back to products'}
            </Button>
            <div className="flex items-center gap-2 ml-auto">
              <Button type="button" variant="ghost" onClick={() => setIsEditing(false)}>
                {t('adminPage.products.cancel')}
              </Button>
              <Button type="submit" variant="primary" disabled={saving}>
                {saving ? t('adminPage.products.saving') : t('adminPage.products.save')}
              </Button>
            </div>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <Dialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={dialogMessage.title}
        description={dialogMessage.description}
      />

      {/* Delete confirmation modal */}
      <Dialog
        open={!!deleteTarget}
        onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}
        title={locale === 'es' ? '¿Eliminar producto?' : 'Delete product?'}
        description={
          locale === 'es'
            ? `Vas a eliminar "${deleteTarget?.name ?? ''}". Esta acción no se puede deshacer.`
            : `You are about to delete "${deleteTarget?.name ?? ''}". This action cannot be undone.`
        }
      >
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => setDeleteTarget(null)} disabled={deleting}>
            {locale === 'es' ? 'Cancelar' : 'Cancel'}
          </Button>
          <Button
            type="button"
            onClick={() => void confirmDelete()}
            disabled={deleting}
            className="bg-red-600 hover:bg-red-500 text-white"
          >
            <Trash2 className="w-4 h-4 mr-2" />
            {deleting
              ? (locale === 'es' ? 'Eliminando…' : 'Deleting…')
              : (locale === 'es' ? 'Eliminar' : 'Delete')}
          </Button>
        </div>
      </Dialog>

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">{t('adminPage.products.pageTitle')}</h1>
        <Button
          variant="primary"
          onClick={() => {
            setCurrentProduct({});
            setIsEditing(true);
          }}
        >
          <Plus className="w-4 h-4 mr-2" /> {t('adminPage.products.addProduct')}
        </Button>
      </div>

      <BulkDiscountPanel
        products={products}
        locale={locale}
        showDialog={showDialog}
        selected={bulkSelected}
        setSelected={setBulkSelected}
      />

      {/* Mobile: card list (md:hidden) */}
      <div className="md:hidden space-y-3">
        {products.length === 0 ? (
          <Card><CardContent className="p-6 text-center text-sm text-slate-500">{t('adminPage.products.empty')}</CardContent></Card>
        ) : products.map((product) => {
          const eff = getEffectivePrice(product);
          const isSelected = bulkSelected.has(product.id);
          return (
            <Card key={product.id} className={isSelected ? 'ring-2 ring-brand-400' : ''}>
              <CardContent className="p-4 space-y-2">
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={(e) => {
                      const next = new Set(bulkSelected);
                      if (e.target.checked) next.add(product.id); else next.delete(product.id);
                      setBulkSelected(next);
                    }}
                    className="mt-1 h-4 w-4"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-slate-900 text-sm truncate">{product.name}</p>
                    {product.nameEs && <p className="text-[11px] text-slate-500 truncate">{product.nameEs}</p>}
                    <p className="text-[10px] uppercase tracking-wider text-slate-400 mt-0.5">{product.category}</p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button variant="ghost" size="icon" onClick={() => { setCurrentProduct(product); setIsEditing(true); }}>
                      <Pencil className="w-4 h-4 text-blue-600" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(product)}>
                      <Trash2 className="w-4 h-4 text-red-600" />
                    </Button>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <p className="text-[10px] uppercase font-bold text-slate-400">{locale === 'es' ? 'Precio' : 'Price'}</p>
                    {eff.hasDiscount ? (
                      <>
                        <p className="font-bold text-emerald-700">${eff.finalPrice.toFixed(2)}</p>
                        <p className="text-[10px] text-slate-400 line-through">${eff.originalPrice.toFixed(2)}</p>
                      </>
                    ) : (
                      <p className="font-bold text-slate-900">${product.price?.toFixed(2)}</p>
                    )}
                  </div>
                  <div>
                    <p className="text-[10px] uppercase font-bold text-slate-400">{locale === 'es' ? 'Desc.' : 'Disc.'}</p>
                    {eff.hasDiscount ? (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                        {product.discountType === 'percent' ? `-${product.discountValue}%` : `-$${Number(product.discountValue).toFixed(2)}`}
                      </span>
                    ) : <span className="text-slate-400">—</span>}
                  </div>
                  <div>
                    <p className="text-[10px] uppercase font-bold text-slate-400">Stock</p>
                    <p className={`font-bold ${product.stock < 20 ? 'text-red-600' : 'text-slate-900'}`}>
                      {product.stock}
                      {product.stock < 20 && <span className="ml-1 text-[9px] uppercase">{t('adminPage.products.lowStock')}</span>}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Desktop: full table (hidden md:block) */}
      <Card className="hidden md:block">
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b bg-slate-50">
                <th className="px-3 py-4 w-8">
                  <input
                    type="checkbox"
                    checked={products.length > 0 && bulkSelected.size === products.length}
                    onChange={(e) => {
                      if (e.target.checked) setBulkSelected(new Set(products.map((p) => p.id)));
                      else setBulkSelected(new Set());
                    }}
                  />
                </th>
                <th className="px-6 py-4 font-medium text-slate-500 text-sm">{t('adminPage.products.tableName')}</th>
                <th className="px-6 py-4 font-medium text-slate-500 text-sm">{t('adminPage.products.tableCategory')}</th>
                <th className="px-6 py-4 font-medium text-slate-500 text-sm">{t('adminPage.products.tablePrice')}</th>
                <th className="px-6 py-4 font-medium text-slate-500 text-sm">{locale === 'es' ? 'Descuento' : 'Discount'}</th>
                <th className="px-6 py-4 font-medium text-slate-500 text-sm">{t('adminPage.products.tableStock')}</th>
                <th className="px-6 py-4 font-medium text-slate-500 text-sm">{t('adminPage.products.tableStatus')}</th>
                <th className="px-6 py-4 font-medium text-slate-500 text-sm text-right">
                  {t('adminPage.products.tableActions')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {products.map((product) => {
                const eff = getEffectivePrice(product);
                return (
                <tr key={product.id} className="hover:bg-slate-50">
                  <td className="px-3 py-4">
                    <input
                      type="checkbox"
                      checked={bulkSelected.has(product.id)}
                      onChange={(e) => {
                        const next = new Set(bulkSelected);
                        if (e.target.checked) next.add(product.id);
                        else next.delete(product.id);
                        setBulkSelected(next);
                      }}
                    />
                  </td>
                  <td className="px-6 py-4 font-medium text-slate-900">
                    <div>{product.name}</div>
                    {product.nameEs ? (
                      <div className="text-xs font-normal text-slate-500 mt-0.5">{product.nameEs}</div>
                    ) : null}
                  </td>
                  <td className="px-6 py-4 text-slate-600">{product.category}</td>
                  <td className="px-6 py-4 text-slate-600">
                    {eff.hasDiscount ? (
                      <span>
                        <span className="font-semibold text-emerald-700">${eff.finalPrice.toFixed(2)}</span>
                        <span className="ml-2 text-xs text-slate-400 line-through">${eff.originalPrice.toFixed(2)}</span>
                      </span>
                    ) : (
                      <>${product.price?.toFixed(2)}</>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    {eff.hasDiscount ? (
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                        {product.discountType === 'percent'
                          ? `-${product.discountValue}%`
                          : `-$${Number(product.discountValue).toFixed(2)}`}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`font-medium ${product.stock < 20 ? 'text-red-600' : 'text-slate-900'}`}>
                      {product.stock}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    {product.stock < 20 ? (
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700">
                        {t('adminPage.products.lowStock')}
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">
                        {t('adminPage.products.inStock')}
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setCurrentProduct(product);
                        setIsEditing(true);
                      }}
                    >
                      <Pencil className="w-4 h-4 text-blue-600" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(product)}>
                      <Trash2 className="w-4 h-4 text-red-600" />
                    </Button>
                  </td>
                </tr>
                );
              })}
              {products.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-6 py-8 text-center text-slate-500">
                    {t('adminPage.products.empty')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function BulkDiscountPanel({
  products,
  locale,
  showDialog,
  selected,
  setSelected,
}: {
  products: Product[];
  locale: string;
  showDialog: (title: string, body: string) => void;
  selected: Set<string>;
  setSelected: (s: Set<string>) => void;
}) {
  const es = locale === 'es';
  const [scope, setScope] = useState<'selected' | 'category' | 'all'>('selected');
  const [category, setCategory] = useState<string>('');
  const [dType, setDType] = useState<'percent' | 'fixed'>('percent');
  const [dValue, setDValue] = useState<string>('');
  const [busy, setBusy] = useState(false);

  const categories = Array.from(new Set(products.map((p) => p.category).filter(Boolean)));

  const resolveTargets = (): Product[] => {
    if (scope === 'selected') return products.filter((p) => selected.has(p.id));
    if (scope === 'category') return products.filter((p) => p.category === category);
    return products;
  };

  const apply = async (mode: 'apply' | 'clear') => {
    const targets = resolveTargets();
    if (targets.length === 0) {
      showDialog(
        es ? 'Sin productos' : 'No products',
        es ? 'Selecciona productos o una categoría primero.' : 'Select products or a category first.',
      );
      return;
    }
    const value = Number(dValue) || 0;
    if (mode === 'apply' && value <= 0) {
      showDialog(
        es ? 'Valor inválido' : 'Invalid value',
        es ? 'Ingresa un valor de descuento mayor a 0.' : 'Enter a discount value greater than 0.',
      );
      return;
    }
    if (mode === 'apply' && dType === 'percent' && value >= 100) {
      showDialog(
        es ? 'Porcentaje inválido' : 'Invalid percent',
        es ? 'El porcentaje debe ser menor a 100.' : 'Percent must be less than 100.',
      );
      return;
    }
    setBusy(true);
    try {
      const batch = writeBatch(db);
      targets.forEach((p) => {
        const ref = doc(db, 'products', p.id);
        if (mode === 'clear') {
          batch.set(ref, { discountType: deleteField(), discountValue: 0 }, { merge: true });
        } else {
          batch.set(ref, { discountType: dType, discountValue: value }, { merge: true });
        }
      });
      await batch.commit();
      showDialog(
        es ? 'Hecho' : 'Done',
        es
          ? `${mode === 'clear' ? 'Descuentos eliminados' : 'Descuentos aplicados'} a ${targets.length} producto(s).`
          : `${mode === 'clear' ? 'Discounts cleared' : 'Discounts applied'} to ${targets.length} product(s).`,
      );
      if (mode === 'clear') setDValue('');
    } catch (err) {
      console.error(err);
      showDialog(
        es ? 'Error' : 'Error',
        es ? 'No se pudo aplicar el descuento.' : 'Could not apply the discount.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              {es ? 'Descuentos masivos' : 'Bulk discounts'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {es
                ? 'Aplica un descuento a varios productos a la vez. Se reflejará en la tienda al instante.'
                : 'Apply a discount to multiple products at once. It updates the storefront instantly.'}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <FieldLabel>{es ? 'Aplicar a' : 'Apply to'}</FieldLabel>
            <select
              className="w-full border border-slate-200 rounded-md p-2 text-sm bg-white"
              value={scope}
              onChange={(e) => setScope(e.target.value as 'selected' | 'category' | 'all')}
            >
              <option value="selected">
                {es ? `Seleccionados (${selected.size})` : `Selected (${selected.size})`}
              </option>
              <option value="category">{es ? 'Por categoría' : 'By category'}</option>
              <option value="all">{es ? 'Todos los productos' : 'All products'}</option>
            </select>
          </div>
          {scope === 'category' && (
            <div>
              <FieldLabel>{es ? 'Categoría' : 'Category'}</FieldLabel>
              <select
                className="w-full border border-slate-200 rounded-md p-2 text-sm bg-white"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                <option value="">{es ? '— Selecciona —' : '— Select —'}</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <FieldLabel>{es ? 'Tipo' : 'Type'}</FieldLabel>
            <select
              className="w-full border border-slate-200 rounded-md p-2 text-sm bg-white"
              value={dType}
              onChange={(e) => setDType(e.target.value as 'percent' | 'fixed')}
            >
              <option value="percent">{es ? 'Porcentaje (%)' : 'Percent (%)'}</option>
              <option value="fixed">{es ? 'Monto fijo ($)' : 'Fixed ($)'}</option>
            </select>
          </div>
          <div>
            <FieldLabel>{es ? 'Valor' : 'Value'}</FieldLabel>
            <Input
              type="number"
              step="0.01"
              min={0}
              value={dValue}
              onChange={(e) => setDValue(e.target.value)}
              placeholder={dType === 'percent' ? '15' : '10.00'}
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-2 mt-4">
          <Button variant="primary" disabled={busy} onClick={() => void apply('apply')}>
            {busy ? (es ? 'Aplicando…' : 'Applying…') : es ? 'Aplicar descuento' : 'Apply discount'}
          </Button>
          <Button variant="ghost" disabled={busy} onClick={() => void apply('clear')}>
            {es ? 'Quitar descuento' : 'Remove discount'}
          </Button>
          {selected.size > 0 && (
            <Button variant="ghost" onClick={() => setSelected(new Set())}>
              {es ? 'Limpiar selección' : 'Clear selection'}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
