import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useToastStore } from '@/store';
import { X } from 'lucide-react';

function ToastItem({ id, message }: { id: number; message: string }) {
  const dismissToast = useToastStore((s) => s.dismissToast);

  useEffect(() => {
    const t = window.setTimeout(() => dismissToast(id), 5000);
    return () => window.clearTimeout(t);
  }, [id, dismissToast]);

  return (
    <div
      role="status"
      className="pointer-events-auto flex max-w-md items-start gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-xl ring-1 ring-black/5"
    >
      <p className="flex-1 text-sm font-medium text-slate-800">{message}</p>
      <button
        type="button"
        onClick={() => dismissToast(id)}
        className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
        aria-label="Cerrar"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

export function ToastHost() {
  const toasts = useToastStore((s) => s.toasts);

  const node = (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[99999] flex flex-col items-center gap-2 px-4 pb-24 pt-4 sm:pb-20"
      aria-live="polite"
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} id={t.id} message={t.message} />
      ))}
    </div>
  );

  if (typeof document === 'undefined') return node;
  return createPortal(node, document.body);
}
