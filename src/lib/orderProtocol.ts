import { collection, getDocs, query, limit as fLimit, doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { groqChatCompletion } from '@/lib/groq';
import type { Product } from '@/store';

export interface ProtocolOrderItem {
  productId?: string;
  name?: string;
  quantity?: number;
  price?: number;
}

export interface ProtocolOrderInfo {
  id: string;
  items?: ProtocolOrderItem[];
  customerName?: string;
  customerEmail?: string;
  locale?: string;
  total?: number;
}

interface LessonDoc {
  title: string;
  titleEs?: string;
  contentMd: string;
  contentMdEs?: string;
}

/** Default system prompt if the admin has not customized one in settings. */
function defaultSystemPrompt(locale: 'es' | 'en'): string {
  if (locale === 'es') {
    return `Eres un asistente clínico que ayuda a un médico certificado a redactar un PROTOCOLO personalizado de uso de péptidos para un paciente. El médico revisará y validará todo antes de enviarlo, así que sé claro, completo y profesional.

Para cada producto en el pedido genera:
- Dosis recomendada (con unidades exactas, p.ej. mg, UI, μg).
- Frecuencia (días de la semana, cada cuántas horas, etc.).
- Vía y momento de administración (subcutánea/SC, oral, ayuno, antes de dormir...).
- Duración del ciclo (semanas) y pausa entre ciclos si aplica.
- Cómo reconstituir si es un péptido liofilizado (agua bacteriostática, volumen, jeringa de insulina con cuánto marcar).
- Combinaciones y orden si hay varios productos.
- Banderas rojas o contraindicaciones que el paciente debe reportar.
- Notas de almacenamiento (refrigeración, sombra, etc.).

Formato: markdown limpio, con secciones por producto y un encabezado breve dirigido al paciente. NUNCA inventes información que no provenga del material de entrenamiento o la nota de dosificación del producto; si falta dato crítico, indícalo entre [corchetes] para que el médico lo complete.`;
  }
  return `You are a clinical assistant helping a certified physician draft a personalized PROTOCOL for a patient's peptide use. The physician will review and validate everything before sending, so be clear, complete and professional.

For each product in the order generate:
- Recommended dose (exact units, e.g. mg, IU, μg).
- Frequency (days of the week, every X hours, etc.).
- Route and timing (subcutaneous/SC, oral, fasting, before sleep...).
- Cycle length (weeks) and break between cycles if applicable.
- Reconstitution if the peptide is lyophilized (bacteriostatic water, volume, insulin syringe markings).
- Combinations and order if there are multiple products.
- Red flags or contraindications the patient should report.
- Storage notes (refrigeration, light, etc.).

Format: clean markdown, with one section per product plus a short header addressed to the patient. NEVER invent information not present in the training material or the product's dosage note; if a critical datum is missing, mark it in [brackets] for the physician to fill in.`;
}

/** Concatenate all training lesson markdown (ES preferred if locale='es'). */
async function loadTrainingContext(locale: 'es' | 'en'): Promise<string> {
  try {
    const snap = await getDocs(query(collection(db, 'lessons'), fLimit(50)));
    const blocks: string[] = [];
    snap.forEach((d) => {
      const x = d.data() as LessonDoc;
      const title = locale === 'es' ? x.titleEs || x.title : x.title || x.titleEs;
      const body = locale === 'es' ? x.contentMdEs || x.contentMd : x.contentMd || x.contentMdEs;
      if (title || body) {
        blocks.push(`### ${title || 'Lesson'}\n\n${body || ''}`);
      }
    });
    return blocks.join('\n\n---\n\n');
  } catch {
    return '';
  }
}

/** Fetch the admin-configured protocol prompts (and a few fallbacks). */
export async function loadProtocolSettings(): Promise<{
  promptEs: string;
  promptEn: string;
}> {
  try {
    const snap = await getDoc(doc(db, 'settings', 'general'));
    if (!snap.exists()) return { promptEs: '', promptEn: '' };
    const data = snap.data();
    return {
      promptEs: typeof data.protocolPromptEs === 'string' ? data.protocolPromptEs : '',
      promptEn: typeof data.protocolPromptEn === 'string' ? data.protocolPromptEn : '',
    };
  } catch {
    return { promptEs: '', promptEn: '' };
  }
}

/** Build the user-message payload describing the order + product metadata. */
function buildOrderContext(args: {
  order: ProtocolOrderInfo;
  products: Product[];
  locale: 'es' | 'en';
}): string {
  const { order, products, locale } = args;
  const productById = new Map(products.map((p) => [p.id, p]));
  const lines: string[] = [];
  lines.push(locale === 'es' ? `## Pedido #${order.id.slice(0, 8).toUpperCase()}` : `## Order #${order.id.slice(0, 8).toUpperCase()}`);
  if (order.customerName) {
    lines.push(locale === 'es' ? `**Paciente:** ${order.customerName}` : `**Patient:** ${order.customerName}`);
  }
  lines.push('');
  lines.push(locale === 'es' ? '### Productos comprados' : '### Purchased products');
  for (const it of order.items || []) {
    const live = it.productId ? productById.get(it.productId) : undefined;
    const name = it.name || live?.name || it.productId || 'Unknown';
    const qty = it.quantity || 1;
    lines.push(`\n- **${name}** ×${qty}`);
    if (live?.dosageNote) {
      lines.push(`  - ${locale === 'es' ? 'Dosis sugerida (catálogo)' : 'Suggested dose (catalog)'}: ${live.dosageNote}`);
    }
    if (live?.protocol) {
      lines.push(`  - ${locale === 'es' ? 'Protocolo base (catálogo)' : 'Base protocol (catalog)'}: ${live.protocol}`);
    }
    if (live?.monthsSupplyPerVial) {
      lines.push(
        `  - ${locale === 'es' ? 'Meses de suministro por vial' : 'Months of supply per vial'}: ${live.monthsSupplyPerVial}`,
      );
    }
    if (live?.targetGender && live.targetGender !== 'both') {
      lines.push(`  - ${locale === 'es' ? 'Indicado para' : 'Indicated for'}: ${live.targetGender}`);
    }
  }
  return lines.join('\n');
}

/** Main entry point — generates a protocol markdown for an order. */
export async function generateProtocolForOrder(args: {
  order: ProtocolOrderInfo;
  products: Product[];
  locale: 'es' | 'en';
}): Promise<string> {
  const { order, products, locale } = args;

  const [settings, trainingContext] = await Promise.all([
    loadProtocolSettings(),
    loadTrainingContext(locale),
  ]);

  const system =
    (locale === 'es' ? settings.promptEs : settings.promptEn).trim() || defaultSystemPrompt(locale);

  const orderContext = buildOrderContext({ order, products, locale });

  const userMessageParts: string[] = [];
  if (trainingContext) {
    userMessageParts.push(
      locale === 'es'
        ? '## Material de entrenamiento (úsalo como única fuente clínica además de las notas del catálogo)'
        : '## Training material (use as the sole clinical source besides catalog notes)',
    );
    userMessageParts.push(trainingContext);
    userMessageParts.push('');
  }
  userMessageParts.push(orderContext);
  userMessageParts.push('');
  userMessageParts.push(
    locale === 'es'
      ? 'Genera ahora el protocolo final en markdown, listo para que el médico lo revise y lo envíe al paciente.'
      : 'Now produce the final protocol in markdown, ready for the physician to review and forward to the patient.',
  );

  return groqChatCompletion([
    { role: 'system', content: system },
    { role: 'user', content: userMessageParts.join('\n') },
  ]);
}
