import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import ReactMarkdown from 'react-markdown';
import { db } from '@/lib/firebase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Copy as CopyIcon } from 'lucide-react';

type Pack = {
  id: string;
  date: string; // YYYY-MM-DD
  caption: string;
  captionEs?: string;
  hashtags?: string;
  imageUrl?: string;
  videoUrl?: string;
  notes?: string;
};

type Props = { locale: 'es' | 'en'; showToast: (m: string) => void };

/**
 * Shows the worker the daily content pack scheduled by the admin
 * (caption + hashtags + asset link). The worker can copy everything in one click
 * and paste into Instagram/TikTok/WhatsApp Status.
 */
export function WorkerDailyContent({ locale, showToast }: Props) {
  const es = locale === 'es';
  const [packs, setPacks] = useState<Pack[]>([]);

  useEffect(() => {
    const unsub = onSnapshot(query(collection(db, 'dailyContent'), orderBy('date', 'desc')), (snap) => {
      const rows: Pack[] = snap.docs.map((d) => {
        const x = d.data();
        return {
          id: d.id,
          date: String(x.date || ''),
          caption: String(x.caption || ''),
          captionEs: x.captionEs as string | undefined,
          hashtags: String(x.hashtags || ''),
          imageUrl: x.imageUrl as string | undefined,
          videoUrl: x.videoUrl as string | undefined,
          notes: x.notes as string | undefined,
        };
      });
      setPacks(rows);
    });
    return () => unsub();
  }, []);

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const todayPack = packs.find((p) => p.date === today) || packs[0];

  function copyAll(p: Pack) {
    const cap = es ? p.captionEs || p.caption : p.caption;
    const txt = [cap, p.hashtags].filter(Boolean).join('\n\n');
    void navigator.clipboard
      .writeText(txt)
      .then(() => showToast(es ? 'Contenido copiado' : 'Content copied'))
      .catch(() => showToast(es ? 'No se pudo copiar' : 'Could not copy'));
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{es ? 'Contenido para hoy' : 'Today\'s content'}</CardTitle>
        </CardHeader>
        <CardContent>
          {!todayPack ? (
            <p className="text-sm text-slate-500 italic">
              {es
                ? 'El admin todavía no ha publicado contenido. Vuelve más tarde.'
                : 'Admin has not posted content yet. Check back later.'}
            </p>
          ) : (
            <ContentBlock pack={todayPack} es={es} onCopy={copyAll} highlight />
          )}
        </CardContent>
      </Card>

      {packs.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle>{es ? 'Anteriores' : 'Previous'}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {packs.filter((p) => p !== todayPack).slice(0, 14).map((p) => (
              <ContentBlock key={p.id} pack={p} es={es} onCopy={copyAll} />
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ContentBlock({ pack, es, onCopy, highlight }: { pack: Pack; es: boolean; onCopy: (p: Pack) => void; highlight?: boolean }) {
  const cap = es ? pack.captionEs || pack.caption : pack.caption;
  return (
    <div className={`rounded-xl border p-4 ${highlight ? 'border-emerald-300 bg-emerald-50/40' : 'border-slate-200 bg-white'}`}>
      <div className="flex items-center justify-between gap-2 mb-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-600">{pack.date}</span>
        <Button type="button" size="sm" variant="outline" onClick={() => onCopy(pack)}>
          <CopyIcon className="w-3.5 h-3.5 mr-1" />
          {es ? 'Copiar' : 'Copy'}
        </Button>
      </div>
      {pack.imageUrl && (
        <img src={pack.imageUrl} alt="" className="rounded-lg mb-3 max-h-96 object-contain border border-slate-200" />
      )}
      {pack.videoUrl && (
        <a href={pack.videoUrl} target="_blank" rel="noreferrer" className="text-xs text-blue-700 hover:underline block mb-3">
          {es ? '▶ Ver video' : '▶ Watch video'}
        </a>
      )}
      <div className="prose prose-sm max-w-none text-slate-800 mb-2">
        <ReactMarkdown>{cap}</ReactMarkdown>
      </div>
      {pack.hashtags && (
        <p className="text-xs text-slate-500 font-mono">{pack.hashtags}</p>
      )}
      {pack.notes && (
        <p className="text-[11px] text-slate-400 italic mt-2">{pack.notes}</p>
      )}
    </div>
  );
}
