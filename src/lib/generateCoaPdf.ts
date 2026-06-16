import { jsPDF } from 'jspdf';

export interface CoaInput {
  productName: string;
  lot: string;
  purity: string;
  analysisDate: string;
  labName: string;
  methods: string;
  client?: string;
  netContent?: string;
  appearance?: string;
  signedBy?: string;
  signedRole?: string;
}

function accession(lot: string) {
  const ts = Date.now().toString().slice(-7);
  return `${ts}${(lot || 'X').replace(/[^A-Z0-9]/gi, '').slice(0, 3).toUpperCase()}`;
}

function dateStr(iso?: string) {
  if (!iso) return new Date().toLocaleDateString('en-US');
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-US');
}

/**
 * Builds a Certificate of Analysis PDF in the Freedom-Diagnostics-style layout
 * (logo block, accession header, product/lot tables, purity, signature).
 */
export function buildCoaPdf(input: CoaInput): jsPDF {
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210;
  const M = 14;
  let y = M;

  const ACC = accession(input.lot);
  const received = dateStr(input.analysisDate);
  const reported = dateStr(input.analysisDate);

  // ── Header: Brand block + accession table ─────────────────
  pdf.setFillColor(16, 122, 87);
  pdf.rect(M, y, 18, 18, 'F');
  pdf.setTextColor(255, 255, 255);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(18);
  pdf.text('I', M + 9, y + 13, { align: 'center' });

  pdf.setTextColor(15, 23, 42);
  pdf.setFontSize(20);
  pdf.text('ILLIUM', M + 22, y + 9);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8);
  pdf.setTextColor(100, 116, 139);
  pdf.text('DIAGNOSTICS', M + 22, y + 14);

  // Right side title
  pdf.setFont('times', 'bold');
  pdf.setFontSize(22);
  pdf.setTextColor(15, 23, 42);
  pdf.text('Certificate of Analysis', W - M, y + 8, { align: 'right' });

  y += 22;

  // Accession header table
  const tableX = W - M - 90;
  const labelW = 38;
  const valueW = 52;
  const rowH = 7;
  const headerRows: [string, string][] = [
    ['Accession Number', ACC],
    ['Client', input.client || 'ILLIUM'],
    ['Search Code', `ILL${ACC}`],
  ];
  pdf.setFontSize(9);
  headerRows.forEach(([l, v], i) => {
    const ry = y + i * rowH;
    pdf.setFillColor(225, 235, 245);
    pdf.rect(tableX, ry, labelW, rowH, 'F');
    pdf.setFillColor(255, 255, 255);
    pdf.rect(tableX + labelW, ry, valueW, rowH, 'F');
    pdf.setDrawColor(180, 195, 215);
    pdf.rect(tableX, ry, labelW + valueW, rowH);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(15, 23, 42);
    pdf.text(l, tableX + 2, ry + 4.8);
    pdf.setFont('helvetica', 'normal');
    pdf.text(v, tableX + labelW + 2, ry + 4.8);
  });

  // Searchable note
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8);
  pdf.setTextColor(15, 23, 42);
  pdf.text('Proudly Owned and Operated in the USA', M, y + 6);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7);
  pdf.setTextColor(80, 100, 130);
  pdf.text('Searchable via: alliumhealth.net/coa/' + input.lot, M, y + 11);

  y += 24;

  // Dates row
  const dateRows: [string, string][] = [
    ['Received Date:', received],
    ['Reported Date:', reported],
  ];
  dateRows.forEach(([l, v], i) => {
    const ry = y + i * rowH;
    pdf.setFillColor(225, 235, 245);
    pdf.rect(tableX, ry, labelW, rowH, 'F');
    pdf.setFillColor(255, 255, 255);
    pdf.rect(tableX + labelW, ry, valueW, rowH, 'F');
    pdf.setDrawColor(180, 195, 215);
    pdf.rect(tableX, ry, labelW + valueW, rowH);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(15, 23, 42);
    pdf.text(l, tableX + 2, ry + 4.8);
    pdf.setFont('helvetica', 'normal');
    pdf.text(v, tableX + labelW + 2, ry + 4.8);
  });

  y += 18;

  // ── Product / Lot side-by-side tables ─────────────────────
  const colW = (W - M * 2 - 4) / 2;
  const left: [string, string][] = [
    ['Product', input.productName],
    ['Net Peptide Content', input.netContent || '—'],
    ['Identity', input.productName.split(/\s/)[0] || input.productName],
  ];
  const right: [string, string][] = [
    ['Lot', input.lot],
    ['Purity', input.purity],
    ['Appearance', input.appearance || 'White Lyophilized Powder'],
  ];
  const drawSpec = (rows: [string, string][], x0: number) => {
    const lW = 36;
    rows.forEach(([l, v], i) => {
      const ry = y + i * rowH;
      pdf.setFillColor(225, 235, 245);
      pdf.rect(x0, ry, lW, rowH, 'F');
      pdf.setFillColor(255, 255, 255);
      pdf.rect(x0 + lW, ry, colW - lW, rowH, 'F');
      pdf.setDrawColor(180, 195, 215);
      pdf.rect(x0, ry, colW, rowH);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(15, 23, 42);
      pdf.text(l, x0 + 2, ry + 4.8);
      pdf.setFont('helvetica', 'normal');
      pdf.text(v, x0 + lW + 2, ry + 4.8);
    });
  };
  drawSpec(left, M);
  drawSpec(right, M + colW + 4);
  y += rowH * 3 + 6;

  // ── Pink banner ───────────────────────────────────────────
  pdf.setFillColor(252, 220, 220);
  pdf.rect(M, y, W - M * 2, 9, 'F');
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(10);
  pdf.setTextColor(120, 30, 30);
  pdf.text('All Chemical Analysis was performed by HPLC with UV Detection Coupled with Mass Spectrometry', W / 2, y + 6, { align: 'center' });
  y += 14;

  // ── Result table ─────────────────────────────────────────
  pdf.setFillColor(225, 235, 245);
  pdf.rect(M, y, (W - M * 2) / 2, 9, 'F');
  pdf.rect(M + (W - M * 2) / 2, y, (W - M * 2) / 2, 9, 'F');
  pdf.setDrawColor(180, 195, 215);
  pdf.rect(M, y, W - M * 2, 9);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(15, 23, 42);
  pdf.setFontSize(10);
  pdf.text('Mass Identification', M + (W - M * 2) / 4, y + 6, { align: 'center' });
  pdf.text('Result', M + (W - M * 2) * 0.75, y + 6, { align: 'center' });
  y += 9;
  pdf.setFillColor(255, 255, 255);
  pdf.rect(M, y, W - M * 2, 11, 'F');
  pdf.rect(M, y, W - M * 2, 11);
  pdf.line(M + (W - M * 2) / 2, y, M + (W - M * 2) / 2, y + 11);
  pdf.setFontSize(14);
  pdf.text(input.productName, M + (W - M * 2) / 4, y + 7, { align: 'center' });
  pdf.setTextColor(16, 122, 87);
  pdf.text(input.purity, M + (W - M * 2) * 0.75, y + 7, { align: 'center' });
  y += 16;

  // ── Chromatogram placeholder ─────────────────────────────
  const chartH = 50;
  pdf.setDrawColor(220, 225, 235);
  pdf.rect(M, y, W - M * 2, chartH);
  pdf.setFontSize(7);
  pdf.setTextColor(120, 130, 145);
  pdf.text('mAU', M + 3, y + 6);
  pdf.text('1 PDA Multi 1', W - M - 3, y + 6, { align: 'right' });
  // Baseline + peak
  pdf.setDrawColor(15, 23, 42);
  pdf.setLineWidth(0.3);
  const baseY = y + chartH - 8;
  pdf.line(M + 8, baseY, W - M - 4, baseY);
  // small noise
  for (let i = 0; i < 30; i++) {
    const x = M + 8 + i * ((W - M * 2 - 12) / 30);
    pdf.line(x, baseY, x + 1, baseY - (Math.random() * 0.6));
  }
  // peak
  const peakX = M + (W - M * 2) * 0.55;
  pdf.line(peakX - 2, baseY, peakX, y + 8);
  pdf.line(peakX, y + 8, peakX + 2, baseY);
  pdf.setFontSize(7);
  pdf.setTextColor(15, 23, 42);
  pdf.text(input.productName.split(/\s/)[0] || 'Peak', peakX, y + 6, { align: 'center' });
  // axis labels
  pdf.setTextColor(120, 130, 145);
  ['0.0', '2.5', '5.0', '7.5', '10.0', '12.5', '15.0'].forEach((t, i) => {
    const x = M + 8 + i * ((W - M * 2 - 12) / 6);
    pdf.text(t, x, y + chartH - 2, { align: 'center' });
  });
  pdf.text('min', W - M - 5, y + chartH - 2);
  y += chartH + 6;

  // ── Signature / COA number band ──────────────────────────
  pdf.setDrawColor(180, 195, 215);
  pdf.line(M, y, W / 2 - 8, y);
  pdf.setFont('times', 'italic');
  pdf.setFontSize(13);
  pdf.setTextColor(15, 23, 42);
  pdf.text(input.signedBy || 'Alex Johnson', M, y - 2);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8);
  pdf.setTextColor(80, 90, 110);
  pdf.text(input.signedBy || 'Alex Johnson', M, y + 4);
  pdf.text(input.signedRole || 'Principal Chemist', M, y + 8);

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(13);
  pdf.setTextColor(15, 23, 42);
  pdf.text(`COA: ${ACC}`, W / 2 + 6, y + 2);

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7);
  pdf.setTextColor(90, 100, 120);
  const disclaimer = `The peptide purity analysis reported here was conducted using ${input.methods} under standard laboratory conditions performed by ${input.labName}. The peptides tested are intended for research use only and are not approved for human or veterinary use, diagnostic, therapeutic, or clinical applications. Results should be interpreted by qualified professionals within the scope of the intended research.`;
  const lines = pdf.splitTextToSize(disclaimer, W / 2 - 12);
  pdf.text(lines, W / 2 + 6, y + 8);

  y += 30;

  // ── Footer ───────────────────────────────────────────────
  pdf.setFillColor(252, 220, 220);
  pdf.rect(M, y, W - M * 2, 8, 'F');
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8);
  pdf.setTextColor(120, 30, 30);
  pdf.text(`Searchable via: alliumhealth.net/coa/${input.lot}`, M + 3, y + 5);
  pdf.text('Contact at: admin@illium.com', W - M - 3, y + 5, { align: 'right' });

  return pdf;
}

export function downloadCoaPdf(input: CoaInput) {
  const pdf = buildCoaPdf(input);
  pdf.save(`COA_${input.productName.replace(/\s+/g, '_')}_${input.lot}.pdf`);
}

export async function coaPdfBlob(input: CoaInput): Promise<Blob> {
  const pdf = buildCoaPdf(input);
  return pdf.output('blob');
}
