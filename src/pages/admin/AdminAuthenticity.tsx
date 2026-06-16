import { useState, useEffect, useRef, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog } from '@/components/ui/dialog';
import { db, storage } from '@/lib/firebase';
import {
  collection,
  onSnapshot,
  query,
  limit,
  doc,
  writeBatch,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useAppStore } from '@/store';
import { useI18n } from '@/i18n/I18nContext';
import { useToastStore } from '@/store';
import { ShieldCheck, Download, Loader2, Plus, AlertTriangle, Ban, FileText } from 'lucide-react';
import QRCode from 'qrcode';
import { jsPDF } from 'jspdf';
import { coaPdfBlob, downloadCoaPdf } from '@/lib/generateCoaPdf';

interface AuthCodeRow {
  id: string;
  productId?: string;
  productName?: string;
  lot?: string;
  purity?: string;
  coaUrl?: string;
  analysisDate?: string;
  labName?: string;
  methods?: string;
  scanCount?: number;
  firstScanAt?: { toDate?: () => Date; seconds?: number };
  lastScanAt?: { toDate?: () => Date; seconds?: number };
  createdAt?: { toDate?: () => Date; seconds?: number };
  status?: string;
}

// Random code: IL-XXXX-YYYY (no ambiguous chars)
function generateCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let a = '';
  let b = '';
  for (let i = 0; i < 4; i++) a += alphabet[Math.floor(Math.random() * alphabet.length)];
  for (let i = 0; i < 4; i++) b += alphabet[Math.floor(Math.random() * alphabet.length)];
  return `IL-${a}-${b}`;
}

const BASE_URL = 'https://alliumhealth.net';

export function AdminAuthenticity() {
  const { locale } = useI18n();
  const es = locale === 'es';
  const products = useAppStore((s) => s.products);
  const showToast = useToastStore((s) => s.showToast);

  const [codes, setCodes] = useState<AuthCodeRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Generator form
  const [genOpen, setGenOpen] = useState(false);
  const [gProductId, setGProductId] = useState('');
  const [gLot, setGLot] = useState('');
  const [gPurity, setGPurity] = useState('');
  const [gQty, setGQty] = useState(10);
  const [gCoaFile, setGCoaFile] = useState<File | null>(null);
  const [gCoaUrl, setGCoaUrl] = useState('');
  const [gAnalysisDate, setGAnalysisDate] = useState('');
  const [gLabName, setGLabName] = useState('');
  const [gMethods, setGMethods] = useState('HPLC, LC-MS');
  const [generating, setGenerating] = useState(false);
  const coaInputRef = useRef<HTMLInputElement>(null);

  // Filters
  const [filterLot, setFilterLot] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'unscanned' | 'scanned' | 'flagged' | 'voided'>('all');

  // Void confirm
  const [voidId, setVoidId] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'authCodes'), limit(2000)),
      (snap) => {
        const rows: AuthCodeRow[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<AuthCodeRow, 'id'>) }));
        rows.sort((a, b) => {
          const av = a.createdAt?.seconds ?? 0;
          const bv = b.createdAt?.seconds ?? 0;
          return bv - av;
        });
        setCodes(rows);
        setLoading(false);
      },
      (err) => {
        console.error('authCodes listener error', err);
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  const filtered = useMemo(() => {
    return codes.filter((c) => {
      if (filterLot && !(c.lot || '').toLowerCase().includes(filterLot.toLowerCase())) return false;
      const scans = c.scanCount || 0;
      if (filterStatus === 'unscanned' && scans !== 0) return false;
      if (filterStatus === 'scanned' && scans === 0) return false;
      if (filterStatus === 'flagged' && scans < 2) return false;
      if (filterStatus === 'voided' && c.status !== 'voided') return false;
      return true;
    });
  }, [codes, filterLot, filterStatus]);

  const lots = useMemo(() => {
    const m = new Map<string, { lot: string; productName: string; total: number; scanned: number; flagged: number }>();
    codes.forEach((c) => {
      const key = `${c.productId || '?'}::${c.lot || '—'}`;
      const e = m.get(key) || { lot: c.lot || '—', productName: c.productName || '—', total: 0, scanned: 0, flagged: 0 };
      e.total += 1;
      if ((c.scanCount || 0) > 0) e.scanned += 1;
      if ((c.scanCount || 0) > 1) e.flagged += 1;
      m.set(key, e);
    });
    return Array.from(m.values()).sort((a, b) => b.total - a.total);
  }, [codes]);

  const openGenerator = () => {
    setGProductId('');
    setGLot('');
    setGPurity('');
    setGQty(10);
    setGCoaFile(null);
    setGCoaUrl('');
    setGAnalysisDate(new Date().toISOString().slice(0, 10));
    setGLabName('');
    setGMethods('HPLC, LC-MS');
    setGenOpen(true);
  };

  const handleCoaUpload = async (file: File): Promise<string> => {
    const safeLot = (gLot || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '_');
    const path = `coa/${gProductId || 'product'}/${safeLot}-${Date.now()}.pdf`;
    const ref = storageRef(storage, path);
    await uploadBytes(ref, file, { contentType: file.type || 'application/pdf' });
    return await getDownloadURL(ref);
  };

  const handleGenerate = async () => {
    if (!gProductId) { showToast(es ? 'Selecciona un producto' : 'Select a product'); return; }
    if (!gLot.trim()) { showToast(es ? 'Ingresa el número de lote' : 'Enter lot number'); return; }
    const qty = Math.max(1, Math.min(500, Number(gQty) || 0));
    if (!qty) { showToast(es ? 'Cantidad inválida' : 'Invalid quantity'); return; }

    setGenerating(true);
    try {
      let coaUrl = gCoaUrl;
      if (gCoaFile) {
        showToast(es ? 'Subiendo COA...' : 'Uploading COA...');
        coaUrl = await handleCoaUpload(gCoaFile);
      }

      const product = products.find((p) => p.id === gProductId);
      const productName = product ? product.name : gProductId;

      const newCodes: string[] = [];
      const usedSet = new Set(codes.map((c) => c.id));
      while (newCodes.length < qty) {
        const c = generateCode();
        if (!usedSet.has(c) && !newCodes.includes(c)) newCodes.push(c);
      }

      // Batch writes (max 500 per batch)
      const chunks: string[][] = [];
      for (let i = 0; i < newCodes.length; i += 400) chunks.push(newCodes.slice(i, i + 400));

      for (const chunk of chunks) {
        const batch = writeBatch(db);
        for (const c of chunk) {
          batch.set(doc(db, 'authCodes', c), {
            productId: gProductId,
            productName,
            lot: gLot.trim(),
            purity: gPurity.trim() || null,
            coaUrl: coaUrl || null,
            analysisDate: gAnalysisDate || null,
            labName: gLabName.trim() || null,
            methods: gMethods.trim() || null,
            scanCount: 0,
            status: 'active',
            firstScanAt: null,
            lastScanAt: null,
            scanHistory: [],
            createdAt: serverTimestamp(),
          });
        }
        await batch.commit();
      }

      showToast(es ? `✓ ${qty} códigos generados` : `✓ ${qty} codes generated`);

      // Auto-download QRs PDF
      await downloadQRsAsPdf(newCodes, productName, gLot.trim());
      setGenOpen(false);
    } catch (e) {
      console.error(e);
      showToast(es ? 'Error al generar códigos' : 'Error generating codes');
    } finally {
      setGenerating(false);
    }
  };

  const downloadQRsAsPdf = async (codeList: string[], productName: string, lot: string) => {
    const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
    const pageW = 210;
    const pageH = 297;
    // Grid 4 cols × 6 rows = 24 per page
    const cols = 4;
    const rows = 6;
    const marginX = 10;
    const marginY = 12;
    const cellW = (pageW - marginX * 2) / cols;
    const cellH = (pageH - marginY * 2) / rows;
    const qrSize = 28;

    for (let i = 0; i < codeList.length; i++) {
      const idx = i % (cols * rows);
      if (idx === 0 && i > 0) pdf.addPage();
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      const x = marginX + col * cellW;
      const y = marginY + row * cellH;

      const url = `${BASE_URL}/verify/${codeList[i]}`;
      const dataUrl = await QRCode.toDataURL(url, { errorCorrectionLevel: 'M', margin: 1, width: 300 });

      pdf.addImage(dataUrl, 'PNG', x + (cellW - qrSize) / 2, y + 2, qrSize, qrSize);
      pdf.setFontSize(7);
      pdf.setTextColor(20, 83, 45);
      pdf.text('Scan to verify', x + cellW / 2, y + qrSize + 5, { align: 'center' });
      pdf.setFontSize(8);
      pdf.setFont('courier', 'bold');
      pdf.setTextColor(0, 0, 0);
      pdf.text(codeList[i], x + cellW / 2, y + qrSize + 9, { align: 'center' });
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(6);
      pdf.setTextColor(100, 116, 139);
      pdf.text(`${productName} · Lot ${lot}`.slice(0, 44), x + cellW / 2, y + qrSize + 13, { align: 'center' });
    }

    pdf.save(`ILLIUM_QR_${lot}_${codeList.length}codes.pdf`);
  };

  const exportLotPdf = async (lot: string) => {
    const list = codes.filter((c) => c.lot === lot).map((c) => c.id);
    if (list.length === 0) return;
    const first = codes.find((c) => c.lot === lot);
    await downloadQRsAsPdf(list, first?.productName || '—', lot);
  };

  const autoGenerateCoa = async (lot: string) => {
    const lotCodes = codes.filter((c) => c.lot === lot);
    if (lotCodes.length === 0) return;
    const first = lotCodes[0];
    const input = {
      productName: first.productName || '—',
      lot,
      purity: first.purity || '99.0%',
      analysisDate: first.analysisDate || new Date().toISOString().slice(0, 10),
      labName: first.labName || 'ILLIUM Diagnostics',
      methods: first.methods || 'HPLC, LC-MS',
    };
    try {
      showToast(es ? 'Generando COA...' : 'Generating COA...');
      const blob = await coaPdfBlob(input);
      const safeLot = lot.replace(/[^a-zA-Z0-9_-]/g, '_');
      const path = `coa/${first.productId || 'product'}/${safeLot}-auto-${Date.now()}.pdf`;
      const ref = storageRef(storage, path);
      await uploadBytes(ref, blob, { contentType: 'application/pdf' });
      const url = await getDownloadURL(ref);

      // Update all codes in this lot with the new coaUrl
      const ids = lotCodes.map((c) => c.id);
      for (let i = 0; i < ids.length; i += 400) {
        const chunk = ids.slice(i, i + 400);
        const batch = writeBatch(db);
        chunk.forEach((id) => batch.update(doc(db, 'authCodes', id), { coaUrl: url }));
        await batch.commit();
      }
      showToast(es ? '✓ COA generado y asignado' : '✓ COA generated and assigned');
      // Also trigger local download
      downloadCoaPdf(input);
    } catch (e) {
      console.error(e);
      showToast(es ? 'Error generando COA' : 'Error generating COA');
    }
  };

  const voidCode = async () => {
    if (!voidId) return;
    try {
      await updateDoc(doc(db, 'authCodes', voidId), { status: 'voided' });
      showToast(es ? 'Código anulado' : 'Code voided');
      setVoidId(null);
    } catch (e) {
      console.error(e);
      showToast(es ? 'Error al anular' : 'Error voiding');
    }
  };

  const totals = useMemo(() => {
    const total = codes.length;
    const scanned = codes.filter((c) => (c.scanCount || 0) > 0).length;
    const flagged = codes.filter((c) => (c.scanCount || 0) > 1).length;
    const voided = codes.filter((c) => c.status === 'voided').length;
    return { total, scanned, flagged, voided };
  }, [codes]);

  const statusBadge = (c: AuthCodeRow) => {
    const s = c.scanCount || 0;
    if (c.status === 'voided') return <span className="rounded bg-slate-200 px-2 py-0.5 text-[10px] text-slate-700">VOIDED</span>;
    if (s > 1) return <span className="rounded bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">⚠ {s}×</span>;
    if (s === 1) return <span className="rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">✓ SCANNED</span>;
    return <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600">UNSCANNED</span>;
  };

  return (
    <div className="space-y-6">
      {/* Void dialog */}
      <Dialog
        open={Boolean(voidId)}
        onOpenChange={(o) => !o && setVoidId(null)}
        title={es ? 'Anular código' : 'Void code'}
        description={es ? 'El código quedará inválido y no podrá verificarse más. Esta acción no se puede deshacer.' : 'Code will become invalid and can no longer be verified. This cannot be undone.'}
      >
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => setVoidId(null)}>
            {es ? 'Cancelar' : 'Cancel'}
          </Button>
          <Button type="button" variant="primary" className="bg-red-600 hover:bg-red-700" onClick={() => void voidCode()}>
            {es ? 'Anular' : 'Void'}
          </Button>
        </div>
      </Dialog>

      {/* Generate dialog */}
      <Dialog
        open={genOpen}
        onOpenChange={setGenOpen}
        title={es ? 'Generar lote de códigos' : 'Generate code batch'}
        panelClassName="max-w-lg"
      >
        <div className="space-y-4 text-sm">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">{es ? 'Producto' : 'Product'}</label>
            <select className="w-full rounded border border-slate-200 px-2 py-2 text-sm" value={gProductId} onChange={(e) => setGProductId(e.target.value)}>
              <option value="">{es ? '— selecciona —' : '— select —'}</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">{es ? 'Lote' : 'Lot'}</label>
              <Input value={gLot} onChange={(e) => setGLot(e.target.value)} placeholder="NWPBJ4" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">{es ? 'Pureza' : 'Purity'}</label>
              <Input value={gPurity} onChange={(e) => setGPurity(e.target.value)} placeholder="99.253%" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">{es ? 'Cantidad (1-500)' : 'Quantity (1-500)'}</label>
            <Input type="number" min={1} max={500} value={gQty} onChange={(e) => setGQty(Number(e.target.value))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">{es ? 'Fecha de análisis' : 'Analysis date'}</label>
              <Input type="date" value={gAnalysisDate} onChange={(e) => setGAnalysisDate(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">{es ? 'Laboratorio' : 'Laboratory'}</label>
              <Input value={gLabName} onChange={(e) => setGLabName(e.target.value)} placeholder="ACS Laboratory" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">{es ? 'Métodos' : 'Methods'}</label>
            <Input value={gMethods} onChange={(e) => setGMethods(e.target.value)} placeholder="HPLC, LC-MS" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">{es ? 'COA (PDF)' : 'COA (PDF)'}</label>
            <input
              ref={coaInputRef}
              type="file"
              accept="application/pdf"
              onChange={(e) => setGCoaFile(e.target.files?.[0] || null)}
              className="w-full text-xs"
            />
            <p className="text-[11px] text-slate-500 mt-1">
              {es ? 'O pega un URL directo:' : 'Or paste a direct URL:'}
            </p>
            <Input className="mt-1" value={gCoaUrl} onChange={(e) => setGCoaUrl(e.target.value)} placeholder="https://..." />
          </div>
          <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-900">
            {es
              ? `Al generar, se descargará un PDF con ${gQty} códigos QR listos para imprimir (1 por vial).`
              : `On generate, a PDF with ${gQty} QR codes ready to print will download (1 per vial).`}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setGenOpen(false)} disabled={generating}>
              {es ? 'Cancelar' : 'Cancel'}
            </Button>
            <Button type="button" variant="primary" onClick={() => void handleGenerate()} disabled={generating}>
              {generating ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />{es ? 'Generando...' : 'Generating...'}</> : (es ? 'Generar códigos' : 'Generate codes')}
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <ShieldCheck className="w-7 h-7 text-emerald-600" />
            {es ? 'Autenticidad de Producto' : 'Product Authenticity'}
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            {es
              ? 'Genera códigos QR únicos por vial. Los clientes los escanean para verificar autenticidad.'
              : 'Generate unique QR codes per vial. Customers scan them to verify authenticity.'}
          </p>
        </div>
        <Button variant="primary" onClick={openGenerator}>
          <Plus className="w-4 h-4 mr-1.5" />{es ? 'Generar lote' : 'Generate batch'}
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="p-4">
          <div className="text-xs text-slate-500 uppercase tracking-wider font-semibold">{es ? 'Total códigos' : 'Total codes'}</div>
          <div className="text-3xl font-black text-slate-900 mt-1">{totals.total}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-slate-500 uppercase tracking-wider font-semibold">{es ? 'Escaneados' : 'Scanned'}</div>
          <div className="text-3xl font-black text-emerald-700 mt-1">{totals.scanned}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-slate-500 uppercase tracking-wider font-semibold flex items-center gap-1"><AlertTriangle className="w-3 h-3" />{es ? 'Alertas' : 'Flagged'}</div>
          <div className="text-3xl font-black text-red-600 mt-1">{totals.flagged}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-slate-500 uppercase tracking-wider font-semibold">{es ? 'Anulados' : 'Voided'}</div>
          <div className="text-3xl font-black text-slate-500 mt-1">{totals.voided}</div>
        </CardContent></Card>
      </div>

      {/* Lots summary */}
      {lots.length > 0 && (
        <Card>
          <CardContent className="p-6">
            <h2 className="text-lg font-bold text-slate-900 mb-3">{es ? 'Lotes' : 'Lots'}</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-slate-50">
                    <th className="px-3 py-2 text-left font-medium text-slate-500">{es ? 'Producto' : 'Product'}</th>
                    <th className="px-3 py-2 text-left font-medium text-slate-500">{es ? 'Lote' : 'Lot'}</th>
                    <th className="px-3 py-2 text-right font-medium text-slate-500">{es ? 'Total' : 'Total'}</th>
                    <th className="px-3 py-2 text-right font-medium text-slate-500">{es ? 'Escaneados' : 'Scanned'}</th>
                    <th className="px-3 py-2 text-right font-medium text-slate-500">{es ? 'Alertas' : 'Flagged'}</th>
                    <th className="px-3 py-2 text-right font-medium text-slate-500">{es ? 'Acción' : 'Action'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {lots.map((l, i) => (
                    <tr key={i} className="hover:bg-slate-50">
                      <td className="px-3 py-2">{l.productName}</td>
                      <td className="px-3 py-2 font-mono text-xs">{l.lot}</td>
                      <td className="px-3 py-2 text-right font-bold">{l.total}</td>
                      <td className="px-3 py-2 text-right text-emerald-700">{l.scanned}</td>
                      <td className="px-3 py-2 text-right text-red-600">{l.flagged}</td>
                      <td className="px-3 py-2 text-right space-x-2 whitespace-nowrap">
                        <Button size="sm" variant="outline" onClick={() => void exportLotPdf(l.lot)}>
                          <Download className="w-3 h-3 mr-1" /> QRs
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => void autoGenerateCoa(l.lot)}>
                          <FileText className="w-3 h-3 mr-1" /> Auto-COA
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters + table */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <h2 className="text-lg font-bold text-slate-900">{es ? 'Todos los códigos' : 'All codes'}</h2>
            <div className="flex gap-2 items-center flex-wrap">
              <Input placeholder={es ? 'Filtrar por lote' : 'Filter by lot'} value={filterLot} onChange={(e) => setFilterLot(e.target.value)} className="w-40 h-9 text-xs" />
              <select className="rounded border border-slate-200 px-2 py-1.5 text-xs" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as typeof filterStatus)}>
                <option value="all">{es ? 'Todos' : 'All'}</option>
                <option value="unscanned">{es ? 'Sin escanear' : 'Unscanned'}</option>
                <option value="scanned">{es ? 'Escaneados' : 'Scanned'}</option>
                <option value="flagged">{es ? 'Con alerta' : 'Flagged'}</option>
                <option value="voided">{es ? 'Anulados' : 'Voided'}</option>
              </select>
            </div>
          </div>
          {loading ? (
            <div className="py-10 text-center text-sm text-slate-500">{es ? 'Cargando...' : 'Loading...'}</div>
          ) : filtered.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-500">
              {es ? 'No hay códigos. Genera el primer lote con el botón "Generar lote".' : 'No codes. Generate your first batch with the "Generate batch" button.'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[800px]">
                <thead>
                  <tr className="border-b bg-slate-50">
                    <th className="px-3 py-2 text-left font-medium text-slate-500">{es ? 'Código' : 'Code'}</th>
                    <th className="px-3 py-2 text-left font-medium text-slate-500">{es ? 'Producto' : 'Product'}</th>
                    <th className="px-3 py-2 text-left font-medium text-slate-500">{es ? 'Lote' : 'Lot'}</th>
                    <th className="px-3 py-2 text-right font-medium text-slate-500">{es ? 'Escaneos' : 'Scans'}</th>
                    <th className="px-3 py-2 text-left font-medium text-slate-500">{es ? 'Estado' : 'Status'}</th>
                    <th className="px-3 py-2 text-left font-medium text-slate-500">COA</th>
                    <th className="px-3 py-2 text-right font-medium text-slate-500"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filtered.slice(0, 500).map((c) => (
                    <tr key={c.id} className="hover:bg-slate-50">
                      <td className="px-3 py-2 font-mono text-xs">
                        <a href={`/verify/${c.id}`} target="_blank" rel="noopener noreferrer" className="text-emerald-700 hover:underline">{c.id}</a>
                      </td>
                      <td className="px-3 py-2">{c.productName || '—'}</td>
                      <td className="px-3 py-2 font-mono text-xs">{c.lot || '—'}</td>
                      <td className="px-3 py-2 text-right font-bold">{c.scanCount || 0}</td>
                      <td className="px-3 py-2">{statusBadge(c)}</td>
                      <td className="px-3 py-2">
                        {c.coaUrl ? (
                          <a href={c.coaUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-emerald-700 hover:underline inline-flex items-center gap-1">
                            <FileText className="w-3 h-3" /> PDF
                          </a>
                        ) : <span className="text-xs text-slate-400">—</span>}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {c.status !== 'voided' && (
                          <Button size="sm" variant="ghost" className="text-red-600 text-xs" onClick={() => setVoidId(c.id)}>
                            <Ban className="w-3 h-3 mr-1" />{es ? 'Anular' : 'Void'}
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filtered.length > 500 && (
                <p className="text-xs text-slate-500 mt-2 text-center">
                  {es ? `Mostrando 500 de ${filtered.length}. Usa filtros para refinar.` : `Showing 500 of ${filtered.length}. Use filters to refine.`}
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
