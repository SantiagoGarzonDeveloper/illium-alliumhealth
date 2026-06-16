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
    return `Eres un asistente clínico que ayuda a un médico certificado a redactar un PROTOCOLO personalizado de uso de péptidos para un paciente. El médico revisará y validará todo antes de enviarlo.

⛔ REGLA #1 — FIDELIDAD ABSOLUTA A LOS DATOS DEL PRODUCTO (LA MÁS IMPORTANTE):
La información de cada producto ("Protocolo de uso" y "Nota de dosis") es la ÚNICA fuente de verdad para dosis, frecuencia, vía, momento, ciclo, pausa, reconstitución y almacenamiento. Debes usarla TAL CUAL, copiando las cifras EXACTAS (mismas unidades y mismos rangos).
- PROHIBIDO inventar, aproximar, redondear, asumir, derivar o "completar" cualquier número que no esté escrito literalmente en los datos del producto. Por ejemplo: NO calcules volúmenes en mL (como "0.25mg = 0.025mL"), NO inventes calibre/tamaño de jeringa, NO inventes incrementos de titulación, NO inventes una dosis intermedia (como "0.5mg") que nadie escribió.
- Si el producto da un RANGO (p.ej. 0.25mg–0.75mg), MANTÉN el rango exactamente. Si el propio texto del producto indica cómo elegir dentro del rango (p.ej. "según el perfil del paciente, no usar una dosis fija"), sigue ESA instrucción al pie de la letra; no la sustituyas por un número fijo inventado.
- Si las instrucciones del producto se contradicen con cualquier "conocimiento general", SIEMPRE gana lo que dice el producto.
- Si un dato NO aparece en la información del producto, NO lo inventes: déjalo entre [corchetes] para que el médico lo complete, u omítelo.

Para cada producto, presenta de forma clara y profesional (solo con lo que esté en sus datos): dosis, frecuencia, vía y momento, duración del ciclo y pausa, reconstitución, combinaciones/orden si hay varios productos, banderas rojas/contraindicaciones y almacenamiento. Si algún punto no está en los datos del producto, márcalo entre [corchetes] o no lo incluyas — nunca lo rellenes con suposiciones.

Formato: markdown limpio, con una sección por producto (tabla Ítem | Detalle) y un encabezado breve. Idioma del protocolo: español.`;
  }
  return `You are a clinical assistant helping a certified physician draft a personalized PROTOCOL for a patient's peptide use. The physician will review and validate everything before sending.

⛔ RULE #1 — ABSOLUTE FIDELITY TO THE PRODUCT DATA (THE MOST IMPORTANT):
Each product's information ("Usage protocol" and "Dosage note") is the ONLY source of truth for dose, frequency, route, timing, cycle, break, reconstitution and storage. You must use it VERBATIM, copying the EXACT figures (same units and same ranges).
- FORBIDDEN to invent, approximate, round, assume, derive or "fill in" any number not written literally in the product data. For example: do NOT compute mL volumes (like "0.25mg = 0.025mL"), do NOT invent syringe gauge/size, do NOT invent titration increments, do NOT invent an intermediate dose (like "0.5mg") that nobody wrote.
- If the product gives a RANGE (e.g. 0.25mg–0.75mg), KEEP the range exactly. If the product text itself states how to choose within the range (e.g. "based on the patient's profile, do not default to a fixed dose"), follow THAT instruction exactly; do not replace it with an invented fixed number.
- If the product instructions conflict with any "general knowledge", the product ALWAYS wins.
- If a datum is NOT present in the product information, do NOT invent it: leave it in [brackets] for the physician to fill in, or omit it.

For each product, present clearly and professionally (only with what is in its data): dose, frequency, route and timing, cycle length and break, reconstitution, combinations/order if multiple products, red flags/contraindications and storage. If any point is not in the product data, mark it in [brackets] or omit it — never fill it with assumptions.

Format: clean markdown, one section per product (table Item | Detail) plus a short header. Protocol language: English.`;
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
    lines.push(`\n### ${name} ×${qty}`);
    if (live?.protocol) {
      lines.push(
        locale === 'es'
          ? `FUENTE AUTORITATIVA — Protocolo de uso (úsalo TAL CUAL, no cambies ni inventes cifras):\n"""\n${live.protocol}\n"""`
          : `AUTHORITATIVE SOURCE — Usage protocol (use it VERBATIM, do not change or invent figures):\n"""\n${live.protocol}\n"""`,
      );
    }
    if (live?.dosageNote) {
      lines.push(
        locale === 'es'
          ? `FUENTE AUTORITATIVA — Nota de dosis (úsala TAL CUAL):\n"""\n${live.dosageNote}\n"""`
          : `AUTHORITATIVE SOURCE — Dosage note (use it VERBATIM):\n"""\n${live.dosageNote}\n"""`,
      );
    }
    if (!live?.protocol && !live?.dosageNote) {
      lines.push(
        locale === 'es'
          ? `(Sin datos de protocolo/dosis en el catálogo — NO inventes; deja los valores entre [corchetes].)`
          : `(No protocol/dose data in the catalog — do NOT invent; leave values in [brackets].)`,
      );
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
  // Mandatory fidelity rules — always included in the user message so they apply
  // EVEN IF the admin set a custom system prompt in settings/general.
  userMessageParts.push(
    locale === 'es'
      ? `⛔ REGLAS ESTRICTAS OBLIGATORIAS (no negociables):
1. Usa EXCLUSIVAMENTE la información marcada como "FUENTE AUTORITATIVA" de cada producto, TAL CUAL está escrita.
2. PROHIBIDO inventar, aproximar, redondear, asumir o derivar números que no estén escritos literalmente (no calcules mL, no inventes calibre de jeringa, no inventes incrementos de titulación, no inventes una dosis como 0.5mg que nadie escribió).
3. Copia las cifras EXACTAS (mismas unidades y rangos). Si hay un RANGO, mantenlo; si el texto del producto dice cómo elegir dentro del rango, obedécelo y NO pongas una dosis fija inventada.
4. Si un dato no está en la fuente autoritativa, déjalo entre [corchetes] u omítelo. Nunca lo rellenes con suposiciones.
5. Lo que dice el producto SIEMPRE gana sobre cualquier conocimiento general.

Genera ahora el protocolo final en markdown (una tabla Ítem | Detalle por producto), respetando al 100% estas reglas.`
      : `⛔ MANDATORY STRICT RULES (non-negotiable):
1. Use ONLY the information marked "AUTHORITATIVE SOURCE" for each product, VERBATIM.
2. FORBIDDEN to invent, approximate, round, assume or derive numbers not written literally (do not compute mL, do not invent syringe gauge, do not invent titration increments, do not invent a dose like 0.5mg nobody wrote).
3. Copy the EXACT figures (same units and ranges). If there is a RANGE, keep it; if the product text says how to choose within the range, obey it and do NOT put an invented fixed dose.
4. If a datum is not in the authoritative source, leave it in [brackets] or omit it. Never fill it with assumptions.
5. What the product says ALWAYS wins over any general knowledge.

Now produce the final protocol in markdown (one Item | Detail table per product), respecting these rules 100%.`,
  );

  return groqChatCompletion(
    [
      { role: 'system', content: system },
      { role: 'user', content: userMessageParts.join('\n') },
    ],
    { temperature: 0.1 },
  );
}
