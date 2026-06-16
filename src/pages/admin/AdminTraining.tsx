import { useEffect, useState } from 'react';
import { addDoc, collection, deleteDoc, doc, onSnapshot, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToastStore } from '@/store';
import { useI18n } from '@/i18n/I18nContext';

type Question = { q: string; options: string[]; correctIndex: number };
type Lesson = {
  id: string;
  title: string;
  titleEs?: string;
  contentMd: string;
  contentMdEs?: string;
  questions: Question[];
  passingScore?: number;
};

const emptyLesson = (): Omit<Lesson, 'id'> => ({
  title: '',
  titleEs: '',
  contentMd: '',
  contentMdEs: '',
  questions: [],
  passingScore: 0.7,
});

export function AdminTraining() {
  const { locale } = useI18n();
  const es = locale === 'es';
  const showToast = useToastStore((s) => s.showToast);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [editing, setEditing] = useState<Lesson | null>(null);
  const [draft, setDraft] = useState<Omit<Lesson, 'id'>>(emptyLesson());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'lessons'), (snap) => {
      const rows: Lesson[] = snap.docs.map((d) => {
        const x = d.data();
        return {
          id: d.id,
          title: String(x.title || ''),
          titleEs: x.titleEs as string | undefined,
          contentMd: String(x.contentMd || ''),
          contentMdEs: x.contentMdEs as string | undefined,
          questions: (x.questions as Question[]) || [],
          passingScore: typeof x.passingScore === 'number' ? x.passingScore : 0.7,
        };
      });
      setLessons(rows);
    });
    return () => unsub();
  }, []);

  function startNew() {
    setEditing(null);
    setDraft(emptyLesson());
  }

  function edit(l: Lesson) {
    setEditing(l);
    setDraft({
      title: l.title,
      titleEs: l.titleEs || '',
      contentMd: l.contentMd,
      contentMdEs: l.contentMdEs || '',
      questions: l.questions.map((q) => ({ q: q.q, options: [...q.options], correctIndex: q.correctIndex })),
      passingScore: l.passingScore ?? 0.7,
    });
  }

  async function save() {
    if (!draft.title.trim()) {
      showToast(es ? 'Falta el título' : 'Title is required');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...draft,
        questions: draft.questions
          .filter((q) => q.q.trim() && q.options.filter((o) => o.trim()).length >= 2)
          .map((q) => ({
            q: q.q.trim(),
            options: q.options.map((o) => o.trim()).filter((o) => o),
            correctIndex: Math.max(0, Math.min(q.correctIndex, q.options.length - 1)),
          })),
        updatedAt: serverTimestamp(),
      };
      if (editing) {
        await updateDoc(doc(db, 'lessons', editing.id), payload);
        showToast(es ? 'Clase actualizada' : 'Lesson updated');
      } else {
        await addDoc(collection(db, 'lessons'), { ...payload, createdAt: serverTimestamp() });
        showToast(es ? 'Clase creada' : 'Lesson created');
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
    if (!confirm(es ? '¿Eliminar esta clase?' : 'Delete this lesson?')) return;
    try {
      await deleteDoc(doc(db, 'lessons', id));
      showToast(es ? 'Eliminada' : 'Deleted');
      if (editing?.id === id) startNew();
    } catch (e) {
      console.error(e);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{es ? 'Clases para trabajadores' : 'Worker training'}</h1>
        <p className="mt-2 text-sm text-slate-600 max-w-3xl">
          {es
            ? 'Crea clases con contenido y un examen al final. Los trabajadores estudian y deben aprobar para registrar su progreso.'
            : 'Create lessons with content and a final exam. Workers study and must pass to register progress.'}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            {editing ? (es ? 'Editar clase' : 'Edit lesson') : (es ? 'Nueva clase' : 'New lesson')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600">{es ? 'Título (Inglés)' : 'Title (English)'}</label>
              <Input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600">{es ? 'Título (Español)' : 'Title (Spanish)'}</label>
              <Input value={draft.titleEs} onChange={(e) => setDraft({ ...draft, titleEs: e.target.value })} />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600">{es ? 'Contenido — Inglés (Markdown)' : 'Content — English (Markdown)'}</label>
              <textarea
                className="w-full min-h-[160px] rounded border border-slate-200 p-2 text-sm font-mono"
                value={draft.contentMd}
                onChange={(e) => setDraft({ ...draft, contentMd: e.target.value })}
                placeholder={'# Lesson 1: GLP-1 peptides\n\n- What it does\n- Dosing\n- Common questions'}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600">{es ? 'Contenido — Español (Markdown)' : 'Content — Spanish (Markdown)'}</label>
              <textarea
                className="w-full min-h-[160px] rounded border border-slate-200 p-2 text-sm font-mono"
                value={draft.contentMdEs}
                onChange={(e) => setDraft({ ...draft, contentMdEs: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">{es ? 'Preguntas del examen' : 'Exam questions'}</h3>
              <Button type="button" size="sm" variant="outline"
                onClick={() => setDraft({
                  ...draft,
                  questions: [...draft.questions, { q: '', options: ['', '', '', ''], correctIndex: 0 }],
                })}
              >+ {es ? 'Pregunta' : 'Question'}</Button>
            </div>
            {draft.questions.map((q, qi) => (
              <div key={qi} className="rounded-md border border-slate-200 p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500 font-mono">#{qi + 1}</span>
                  <Input
                    className="flex-1"
                    value={q.q}
                    onChange={(e) => setDraft({
                      ...draft,
                      questions: draft.questions.map((x, i) => i === qi ? { ...x, q: e.target.value } : x),
                    })}
                    placeholder={es ? 'Texto de la pregunta…' : 'Question text…'}
                  />
                  <button
                    type="button"
                    className="text-red-600 text-xs"
                    onClick={() => setDraft({ ...draft, questions: draft.questions.filter((_, i) => i !== qi) })}
                  >✕</button>
                </div>
                {q.options.map((opt, oi) => (
                  <div key={oi} className="flex items-center gap-2">
                    <input
                      type="radio"
                      name={`correct-${qi}`}
                      checked={q.correctIndex === oi}
                      onChange={() => setDraft({
                        ...draft,
                        questions: draft.questions.map((x, i) => i === qi ? { ...x, correctIndex: oi } : x),
                      })}
                    />
                    <Input
                      className="flex-1 text-sm"
                      value={opt}
                      onChange={(e) => setDraft({
                        ...draft,
                        questions: draft.questions.map((x, i) =>
                          i === qi
                            ? { ...x, options: x.options.map((o, j) => j === oi ? e.target.value : o) }
                            : x
                        ),
                      })}
                      placeholder={es ? `Opción ${oi + 1}` : `Option ${oi + 1}`}
                    />
                  </div>
                ))}
              </div>
            ))}
          </div>

          <div className="space-y-1 max-w-xs">
            <label className="text-xs font-medium text-slate-600">{es ? 'Mínimo para aprobar (0–1)' : 'Pass threshold (0–1)'}</label>
            <Input
              type="number"
              min={0}
              max={1}
              step={0.05}
              value={draft.passingScore}
              onChange={(e) => setDraft({ ...draft, passingScore: parseFloat(e.target.value) || 0.7 })}
            />
          </div>

          <div className="flex gap-2">
            <Button type="button" disabled={saving} className="bg-slate-900 text-white" onClick={() => void save()}>
              {saving ? '…' : (editing ? (es ? 'Actualizar' : 'Update') : (es ? 'Crear clase' : 'Create lesson'))}
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
        <CardHeader><CardTitle>{es ? 'Clases existentes' : 'Existing lessons'}</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {lessons.length === 0 && <p className="text-sm text-slate-500 italic">—</p>}
          {lessons.map((l) => (
            <div key={l.id} className="flex items-center justify-between rounded-md border border-slate-200 p-3">
              <div>
                <p className="font-semibold">{es ? l.titleEs || l.title : l.title}</p>
                <p className="text-xs text-slate-500">{l.questions.length} {es ? 'preguntas' : 'questions'}</p>
              </div>
              <div className="flex gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => edit(l)}>{es ? 'Editar' : 'Edit'}</Button>
                <Button type="button" size="sm" variant="outline" className="text-red-600 border-red-200" onClick={() => void remove(l.id)}>
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
