import { useEffect, useState } from 'react';
import { addDoc, collection, deleteDoc, doc, onSnapshot, orderBy, query, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToastStore } from '@/store';
import { useI18n } from '@/i18n/I18nContext';

type Pack = {
  id: string;
  date: string;
  caption: string;
  captionEs?: string;
  hashtags?: string;
  imageUrl?: string;
  videoUrl?: string;
  notes?: string;
};

const emptyPack = (): Omit<Pack, 'id'> => ({
  date: new Date().toISOString().slice(0, 10),
  caption: '',
  captionEs: '',
  hashtags: '',
  imageUrl: '',
  videoUrl: '',
  notes: '',
});

export function AdminContent() {
  const { locale } = useI18n();
  const es = locale === 'es';
  const showToast = useToastStore((s) => s.showToast);
  const [packs, setPacks] = useState<Pack[]>([]);
  const [editing, setEditing] = useState<Pack | null>(null);
  const [draft, setDraft] = useState<Omit<Pack, 'id'>>(emptyPack());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(query(collection(db, 'dailyContent'), orderBy('date', 'desc')), (snap) => {
      const rows: Pack[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Pack, 'id'>) }));
      setPacks(rows);
    });
    return () => unsub();
  }, []);

  function startNew() {
    setEditing(null);
    setDraft(emptyPack());
  }

  function edit(p: Pack) {
    setEditing(p);
    setDraft({
      date: p.date,
      caption: p.caption,
      captionEs: p.captionEs || '',
      hashtags: p.hashtags || '',
      imageUrl: p.imageUrl || '',
      videoUrl: p.videoUrl || '',
      notes: p.notes || '',
    });
  }

  async function save() {
    if (!draft.date || !draft.caption.trim()) {
      showToast(es ? 'Fecha y texto son obligatorios' : 'Date and caption are required');
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await updateDoc(doc(db, 'dailyContent', editing.id), { ...draft, updatedAt: serverTimestamp() });
        showToast(es ? 'Actualizado' : 'Updated');
      } else {
        await addDoc(collection(db, 'dailyContent'), { ...draft, createdAt: serverTimestamp() });
        showToast(es ? 'Publicado' : 'Published');
      }
      startNew();
    } catch (e) {
      console.error(e);
      showToast(es ? 'Error al guardar' : 'Save error');
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!confirm(es ? '¿Eliminar este día?' : 'Delete this day?')) return;
    try {
      await deleteDoc(doc(db, 'dailyContent', id));
      showToast(es ? 'Eliminado' : 'Deleted');
      if (editing?.id === id) startNew();
    } catch (e) {
      console.error(e);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          {es ? 'Contenido diario para trabajadores' : 'Daily content for workers'}
        </h1>
        <p className="mt-2 text-sm text-slate-600 max-w-3xl">
          {es
            ? 'Sube el contenido que cada trabajador debe publicar en sus redes hoy: imagen/video + caption + hashtags. Ellos lo verán y podrán copiarlo con un solo botón.'
            : 'Upload what each worker should post on their socials today: image/video + caption + hashtags. They\'ll see it and can copy with one tap.'}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            {editing ? (es ? 'Editar día' : 'Edit day') : (es ? 'Programar día' : 'Schedule day')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600">{es ? 'Fecha (AAAA-MM-DD)' : 'Date (YYYY-MM-DD)'}</label>
              <Input type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600">{es ? 'URL imagen (opcional)' : 'Image URL (optional)'}</label>
              <Input value={draft.imageUrl} onChange={(e) => setDraft({ ...draft, imageUrl: e.target.value })} placeholder="https://…" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600">{es ? 'URL video (opcional)' : 'Video URL (optional)'}</label>
              <Input value={draft.videoUrl} onChange={(e) => setDraft({ ...draft, videoUrl: e.target.value })} placeholder="https://… (YouTube/Vimeo/Drive)" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600">{es ? 'Hashtags' : 'Hashtags'}</label>
              <Input value={draft.hashtags} onChange={(e) => setDraft({ ...draft, hashtags: e.target.value })} placeholder="#illium #peptides #wellness" />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600">{es ? 'Caption — Inglés (Markdown)' : 'Caption — English (Markdown)'}</label>
              <textarea
                className="w-full min-h-[140px] rounded border border-slate-200 p-2 text-sm font-mono"
                value={draft.caption}
                onChange={(e) => setDraft({ ...draft, caption: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600">{es ? 'Caption — Español (Markdown)' : 'Caption — Spanish (Markdown)'}</label>
              <textarea
                className="w-full min-h-[140px] rounded border border-slate-200 p-2 text-sm font-mono"
                value={draft.captionEs}
                onChange={(e) => setDraft({ ...draft, captionEs: e.target.value })}
              />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-600">{es ? 'Notas internas (no se muestran al worker)' : 'Internal notes (not shown to worker)'}</label>
            <Input value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
          </div>
          <div className="flex gap-2">
            <Button type="button" disabled={saving} className="bg-slate-900 text-white" onClick={() => void save()}>
              {saving ? '…' : (editing ? (es ? 'Actualizar' : 'Update') : (es ? 'Publicar' : 'Publish'))}
            </Button>
            {editing && (
              <Button type="button" variant="outline" onClick={startNew}>
                {es ? 'Cancelar edición' : 'Cancel edit'}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>{es ? 'Publicaciones programadas' : 'Scheduled posts'}</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {packs.length === 0 && <p className="text-sm text-slate-500 italic">—</p>}
          {packs.map((p) => (
            <div key={p.id} className="flex items-center justify-between rounded-md border border-slate-200 p-3">
              <div className="min-w-0">
                <p className="font-semibold text-slate-900">{p.date}</p>
                <p className="text-xs text-slate-500 truncate max-w-md">
                  {(es ? p.captionEs || p.caption : p.caption).slice(0, 80)}…
                </p>
              </div>
              <div className="flex gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => edit(p)}>{es ? 'Editar' : 'Edit'}</Button>
                <Button type="button" size="sm" variant="outline" className="text-red-600 border-red-200" onClick={() => void remove(p.id)}>
                  {es ? 'Borrar' : 'Delete'}
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
