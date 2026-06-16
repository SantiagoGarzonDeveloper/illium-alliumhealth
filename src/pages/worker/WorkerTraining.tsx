import { useEffect, useState } from 'react';
import { addDoc, collection, getDocs, onSnapshot, query, serverTimestamp, where } from 'firebase/firestore';
import ReactMarkdown from 'react-markdown';
import { db } from '@/lib/firebase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

type Question = { q: string; options: string[]; correctIndex: number };
type Lesson = {
  id: string;
  title: string;
  titleEs?: string;
  contentMd: string;
  contentMdEs?: string;
  questions: Question[];
  passingScore?: number;
  createdAt?: unknown;
};

type Attempt = { lessonId: string; score: number; total: number; passed: boolean };

type Props = { uid: string; locale: 'es' | 'en'; showToast: (m: string) => void };

/**
 * Worker-facing training: lists lessons, lets the worker read and take an exam.
 * The admin creates lessons in /admin/training. Results are stored per worker.
 */
export function WorkerTraining({ uid, locale, showToast }: Props) {
  const es = locale === 'es';
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [attempts, setAttempts] = useState<Record<string, Attempt>>({});
  const [active, setActive] = useState<Lesson | null>(null);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<Attempt | null>(null);

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
          createdAt: x.createdAt,
        };
      });
      setLessons(rows);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const snap = await getDocs(query(collection(db, 'examAttempts'), where('uid', '==', uid)));
        const map: Record<string, Attempt> = {};
        snap.forEach((d) => {
          const x = d.data();
          const lid = String(x.lessonId);
          const a: Attempt = {
            lessonId: lid,
            score: Number(x.score) || 0,
            total: Number(x.total) || 0,
            passed: Boolean(x.passed),
          };
          // Keep best score
          if (!map[lid] || a.score > map[lid].score) map[lid] = a;
        });
        setAttempts(map);
      } catch (e) { console.warn('attempts load', e); }
    })();
  }, [uid]);

  async function submitExam() {
    if (!active) return;
    setSubmitting(true);
    try {
      let correct = 0;
      active.questions.forEach((q, i) => {
        if (answers[i] === q.correctIndex) correct++;
      });
      const total = active.questions.length;
      const score = total > 0 ? correct / total : 0;
      const passed = score >= (active.passingScore ?? 0.7);
      await addDoc(collection(db, 'examAttempts'), {
        uid,
        lessonId: active.id,
        score: correct,
        total,
        passed,
        createdAt: serverTimestamp(),
      });
      const r: Attempt = { lessonId: active.id, score: correct, total, passed };
      setAttempts((curr) => ({ ...curr, [active.id]: r }));
      setResult(r);
      showToast(passed
        ? (es ? '¡Aprobaste!' : 'You passed!')
        : (es ? 'No aprobaste — vuelve a intentarlo' : 'Did not pass — try again'));
    } catch (e) {
      console.error(e);
      showToast(es ? 'Error al enviar el examen' : 'Error submitting exam');
    } finally {
      setSubmitting(false);
    }
  }

  function back() {
    setActive(null);
    setAnswers({});
    setResult(null);
  }

  if (active) {
    const title = es ? active.titleEs || active.title : active.title;
    const md = es ? active.contentMdEs || active.contentMd : active.contentMd;
    return (
      <div className="space-y-4">
        <Button type="button" size="sm" variant="outline" onClick={back}>← {es ? 'Volver' : 'Back'}</Button>
        <Card>
          <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
          <CardContent>
            <div className="prose prose-sm max-w-none text-slate-800">
              <ReactMarkdown>{md}</ReactMarkdown>
            </div>
          </CardContent>
        </Card>
        {active.questions.length > 0 && (
          <Card>
            <CardHeader><CardTitle>{es ? 'Examen' : 'Exam'}</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {result ? (
                <div className={`rounded-xl p-4 border ${result.passed ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
                  <p className="font-bold text-slate-900">
                    {result.passed ? (es ? '✅ Aprobado' : '✅ Passed') : (es ? '❌ No aprobado' : '❌ Not passed')}
                  </p>
                  <p className="text-sm text-slate-700">
                    {es ? 'Puntaje:' : 'Score:'} {result.score}/{result.total} ({Math.round((result.score / Math.max(1, result.total)) * 100)}%)
                  </p>
                  <Button type="button" size="sm" variant="outline" className="mt-3" onClick={() => { setAnswers({}); setResult(null); }}>
                    {es ? 'Reintentar' : 'Retry'}
                  </Button>
                </div>
              ) : (
                <>
                  {active.questions.map((q, i) => (
                    <div key={i} className="space-y-2">
                      <p className="text-sm font-semibold text-slate-900">{i + 1}. {q.q}</p>
                      <div className="space-y-1">
                        {q.options.map((opt, j) => (
                          <label key={j} className="flex items-start gap-2 cursor-pointer rounded p-2 hover:bg-slate-50">
                            <input
                              type="radio"
                              name={`q${i}`}
                              checked={answers[i] === j}
                              onChange={() => setAnswers((a) => ({ ...a, [i]: j }))}
                              className="mt-0.5"
                            />
                            <span className="text-sm text-slate-700">{opt}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                  <Button
                    type="button"
                    disabled={submitting || Object.keys(answers).length < active.questions.length}
                    className="bg-slate-900 text-white"
                    onClick={() => void submitExam()}
                  >
                    {submitting ? '…' : (es ? 'Enviar examen' : 'Submit exam')}
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  return (
    <Card>
      <CardHeader><CardTitle>{es ? 'Cursos de péptidos' : 'Peptide training'}</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {lessons.length === 0 && (
          <p className="text-sm text-slate-500 italic">
            {es ? 'Aún no hay clases publicadas.' : 'No lessons published yet.'}
          </p>
        )}
        {lessons.map((l) => {
          const a = attempts[l.id];
          const title = es ? l.titleEs || l.title : l.title;
          return (
            <div key={l.id} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4">
              <div>
                <p className="font-semibold text-slate-900">{title}</p>
                <p className="text-xs text-slate-500">
                  {l.questions.length} {es ? 'preguntas' : 'questions'} · {es ? 'Pasa con' : 'Pass at'} {Math.round((l.passingScore ?? 0.7) * 100)}%
                </p>
                {a && (
                  <p className={`text-xs mt-1 font-semibold ${a.passed ? 'text-emerald-700' : 'text-amber-700'}`}>
                    {a.passed ? '✓' : '⏳'} {es ? 'Mejor puntaje' : 'Best score'}: {a.score}/{a.total}
                  </p>
                )}
              </div>
              <Button type="button" size="sm" variant="outline" onClick={() => { setActive(l); setAnswers({}); setResult(null); }}>
                {a?.passed ? (es ? 'Repasar' : 'Review') : (es ? 'Estudiar' : 'Study')}
              </Button>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
