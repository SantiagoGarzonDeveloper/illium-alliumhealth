import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '@/i18n/I18nContext';
import { Button } from '@/components/ui/button';
import { Mail, MessageCircle, Clock, Truck, RotateCcw, ShieldCheck, FileText, Lock, ChevronDown, Send } from 'lucide-react';
import { useToastStore, useAppStore } from '@/store';
import { getLocalizedProduct } from '@/lib/productLocale';

function PageShell({ title, kicker, children }: { title: string; kicker?: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
      <div className="container mx-auto max-w-4xl px-4 py-16 md:py-24">
        {kicker && (
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-brand-400 mb-3">{kicker}</p>
        )}
        <h1 className="text-4xl md:text-5xl font-bold text-white tracking-tight mb-10">{title}</h1>
        <div className="prose prose-invert max-w-none text-slate-300 leading-relaxed [&_h2]:text-white [&_h2]:text-2xl [&_h2]:font-bold [&_h2]:mt-10 [&_h2]:mb-4 [&_h3]:text-white [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:mt-6 [&_h3]:mb-3 [&_a]:text-brand-400 [&_a:hover]:text-brand-300 [&_strong]:text-white [&_p]:mb-4 [&_ul]:list-disc [&_ul]:ml-5 [&_ul]:space-y-2 [&_li]:pl-1">
          {children}
        </div>
      </div>
    </div>
  );
}

// ── FAQ ─────────────────────────────────────────────────────
export function FAQPage() {
  const { locale } = useI18n();
  const es = locale === 'es';
  const [openIdx, setOpenIdx] = useState<number | null>(0);

  const faqs = es
    ? [
        {
          q: '¿Los productos están verificados?',
          a: 'Sí. Cada lote pasa por pruebas independientes HPLC y espectrometría de masas (MS) para verificar pureza ≥99%. Puedes solicitar el certificado de análisis (COA) escribiendo a nuestro soporte.',
        },
        {
          q: '¿Hacen envíos a todos los países?',
          a: 'Enviamos a la mayoría de países. Consulta la página de Envíos para ver la lista actualizada y los tiempos estimados por región.',
        },
        {
          q: '¿Cuánto tarda el envío?',
          a: 'Domésticos (EE.UU./MX/CO): 2–5 días hábiles. Internacionales: 7–15 días hábiles. Todos los envíos incluyen número de seguimiento.',
        },
        {
          q: '¿Qué métodos de pago aceptan?',
          a: 'Zelle, transferencia bancaria, y algunos países aceptan cripto. Después de confirmar tu pedido recibirás las instrucciones de pago exactas por correo y WhatsApp.',
        },
        {
          q: '¿Tienen devoluciones?',
          a: 'Dado que nuestros productos son de calidad controlada para investigación, solo se aceptan cambios si el producto llega dañado o con defecto de fabricación. Tienes 14 días desde la recepción para reportarlo.',
        },
        {
          q: '¿Cómo funciona el programa de socios?',
          a: 'Al registrarte como Socio, recibes un enlace de referido único. Ganas 40% de cada venta con tu enlace, y 10% adicional por cada venta que haga alguien que tú refieras. Puedes seguir tus comisiones en tiempo real desde el panel de socio.',
        },
        {
          q: '¿El sitio es seguro?',
          a: 'Sí. Toda la información se transmite por HTTPS, los pagos no se almacenan en nuestros servidores, y los datos personales están cifrados en reposo.',
        },
      ]
    : [
        {
          q: 'Are the products verified?',
          a: 'Yes. Every batch is tested independently with HPLC and mass spectrometry (MS) to verify ≥99% purity. You can request the Certificate of Analysis (COA) from support.',
        },
        {
          q: 'Do you ship worldwide?',
          a: 'We ship to most countries. Check the Shipping page for the updated list and regional ETAs.',
        },
        {
          q: 'How long does shipping take?',
          a: 'Domestic (US/MX/CO): 2–5 business days. International: 7–15 business days. All shipments include tracking.',
        },
        {
          q: 'What payment methods are accepted?',
          a: 'Zelle, wire transfer, and some countries accept crypto. After confirming your order you receive exact payment instructions via email and WhatsApp.',
        },
        {
          q: 'Do you accept returns?',
          a: 'Since our products are quality-controlled research compounds, we only accept exchanges for damaged/defective items. Report within 14 days of receipt.',
        },
        {
          q: 'How does the partner program work?',
          a: 'Sign up as a Partner to receive a unique referral link. You earn 40% on every sale through your link and an additional 10% on sales by partners you refer. Track commissions in real time on your partner dashboard.',
        },
        {
          q: 'Is the site secure?',
          a: 'Yes. All traffic is HTTPS, payment data is never stored on our servers, and personal data is encrypted at rest.',
        },
      ];

  return (
    <PageShell title={es ? 'Preguntas frecuentes' : 'Frequently Asked Questions'} kicker="ILLIUM">
      <div className="not-prose space-y-3">
        {faqs.map((faq, i) => {
          const open = openIdx === i;
          return (
            <div key={i} className="rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900 to-slate-800 overflow-hidden">
              <button
                type="button"
                onClick={() => setOpenIdx(open ? null : i)}
                className="w-full flex items-center justify-between gap-4 p-5 text-left hover:bg-slate-800/50 transition-colors"
              >
                <span className="font-semibold text-white text-base">{faq.q}</span>
                <ChevronDown className={`h-5 w-5 text-brand-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
              </button>
              {open && (
                <div className="px-5 pb-5 text-sm text-slate-300 leading-relaxed animate-slide-down">
                  {faq.a}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="not-prose mt-10 rounded-2xl bg-gradient-to-br from-brand-900 to-slate-900 border border-brand-700/30 p-6 text-center">
        <p className="text-sm text-slate-300 mb-3">
          {es ? '¿Tu pregunta no está aquí?' : "Don't see your question?"}
        </p>
        <Link to="/contact">
          <Button className="bg-white text-slate-900 hover:bg-slate-100 rounded-full h-10 px-6 text-sm font-semibold">
            {es ? 'Contáctanos' : 'Contact us'}
          </Button>
        </Link>
      </div>
    </PageShell>
  );
}

// ── Shipping ─────────────────────────────────────────────
export function ShippingPage() {
  const { locale } = useI18n();
  const es = locale === 'es';
  return (
    <PageShell title={es ? 'Envíos y devoluciones' : 'Shipping & Returns'} kicker="ILLIUM">
      <div className="not-prose grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
        <div className="rounded-2xl bg-slate-900/60 border border-slate-800 p-5 text-center">
          <Truck className="h-6 w-6 text-brand-400 mx-auto mb-2" />
          <p className="text-sm font-semibold text-white">{es ? 'Envío rápido' : 'Fast shipping'}</p>
          <p className="text-xs text-slate-400 mt-1">{es ? '2–5 días (nacional)' : '2–5 days (domestic)'}</p>
        </div>
        <div className="rounded-2xl bg-slate-900/60 border border-slate-800 p-5 text-center">
          <ShieldCheck className="h-6 w-6 text-brand-400 mx-auto mb-2" />
          <p className="text-sm font-semibold text-white">{es ? 'Discreto' : 'Discreet'}</p>
          <p className="text-xs text-slate-400 mt-1">{es ? 'Empaque sin marca' : 'Unbranded packaging'}</p>
        </div>
        <div className="rounded-2xl bg-slate-900/60 border border-slate-800 p-5 text-center">
          <RotateCcw className="h-6 w-6 text-brand-400 mx-auto mb-2" />
          <p className="text-sm font-semibold text-white">{es ? 'Cambios' : 'Exchanges'}</p>
          <p className="text-xs text-slate-400 mt-1">{es ? 'Si llega dañado' : 'If it arrives damaged'}</p>
        </div>
      </div>

      <h2>{es ? 'Tiempos de envío' : 'Delivery times'}</h2>
      <ul>
        <li>
          <strong>{es ? 'Estados Unidos' : 'United States'}:</strong> 2–5 {es ? 'días hábiles' : 'business days'}
        </li>
        <li>
          <strong>México, Colombia, Puerto Rico:</strong> 3–7 {es ? 'días hábiles' : 'business days'}
        </li>
        <li>
          <strong>{es ? 'América Latina' : 'Latin America'}:</strong> 7–15 {es ? 'días hábiles' : 'business days'}
        </li>
        <li>
          <strong>{es ? 'Europa' : 'Europe'}:</strong> 7–12 {es ? 'días hábiles' : 'business days'}
        </li>
        <li>
          <strong>{es ? 'Otros países' : 'Other countries'}:</strong> 10–20 {es ? 'días hábiles' : 'business days'}
        </li>
      </ul>

      <h2>{es ? 'Seguimiento' : 'Tracking'}</h2>
      <p>
        {es
          ? 'Todos los pedidos incluyen número de seguimiento. Lo recibes por correo y WhatsApp una vez que el pedido se marca como enviado. Puedes ver el estado en tiempo real desde /orders.'
          : 'All orders include a tracking number. You receive it by email and WhatsApp once the order is marked as shipped. You can check the status in real time at /orders.'}
      </p>

      <h2>{es ? 'Cambios y devoluciones' : 'Exchanges & Returns'}</h2>
      <p>
        {es
          ? 'Aceptamos cambios dentro de los 14 días de recepción si el producto llega dañado, defectuoso o incorrecto. Envía fotos claras a nuestro equipo y coordinaremos el intercambio sin costo. No se aceptan devoluciones por arrepentimiento en productos de investigación ya abiertos.'
          : 'Exchanges accepted within 14 days of receipt if the product arrives damaged, defective or incorrect. Send clear photos to our team and we will arrange the exchange at no cost. Returns for change of mind are not accepted on opened research products.'}
      </p>

      <h2>{es ? 'Responsabilidad' : 'Liability'}</h2>
      <p>
        {es
          ? 'ILLIUM no se responsabiliza por retenciones aduaneras en países que requieren permisos especiales. El comprador es responsable de conocer las regulaciones locales sobre importación de compuestos de investigación.'
          : 'ILLIUM is not liable for customs holds in countries requiring special permits. The buyer is responsible for knowing local regulations on research compound imports.'}
      </p>
    </PageShell>
  );
}

// ── Contact ─────────────────────────────────────────────
export function ContactPage() {
  const { locale } = useI18n();
  const showToast = useToastStore((s) => s.showToast);
  const es = locale === 'es';
  const [form, setForm] = useState({ name: '', email: '', message: '' });
  const [sending, setSending] = useState(false);
  const [contactInfo, setContactInfo] = useState({ email: 'info@alliumhealth.net', whatsapp: '+1 (786) 759-2242', hours: 'Mon–Fri · 9am–6pm EST' });

  useEffect(() => {
    (async () => {
      try {
        const { doc, getDoc } = await import('firebase/firestore');
        const { db } = await import('@/lib/firebase');
        const snap = await getDoc(doc(db, 'settings', 'general'));
        if (snap.exists()) {
          const d = snap.data();
          if (d.contactEmail) setContactInfo((p) => ({ ...p, email: String(d.contactEmail) }));
          if (d.contactWhatsapp) setContactInfo((p) => ({ ...p, whatsapp: String(d.contactWhatsapp) }));
          if (d.contactHours) setContactInfo((p) => ({ ...p, hours: String(d.contactHours) }));
        }
      } catch { /* ignore */ }
    })();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    if (!EMAIL_REGEX.test(form.email)) {
      showToast(es ? 'Correo no válido' : 'Invalid email');
      return;
    }
    if (form.message.trim().length < 10) {
      showToast(es ? 'Mensaje muy corto' : 'Message too short');
      return;
    }
    setSending(true);
    try {
      // Save to Firestore 'contactMessages' collection
      const { addDoc, collection, serverTimestamp } = await import('firebase/firestore');
      const { db } = await import('@/lib/firebase');
      await addDoc(collection(db, 'contactMessages'), {
        ...form,
        createdAt: serverTimestamp(),
        locale,
      });
      showToast(es ? '¡Mensaje enviado! Te responderemos pronto.' : 'Message sent! We will reply soon.');
      setForm({ name: '', email: '', message: '' });
    } catch (err) {
      console.error(err);
      showToast(es ? 'Error al enviar. Inténtalo de nuevo.' : 'Failed to send. Try again.');
    } finally {
      setSending(false);
    }
  };

  return (
    <PageShell title={es ? 'Contáctanos' : 'Contact us'} kicker="ILLIUM">
      <div className="not-prose grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div>
          <p className="text-slate-300 leading-relaxed mb-6">
            {es
              ? 'Estamos aquí para responder tus preguntas sobre productos, envíos, el programa de socios o cualquier otra cosa. Usualmente respondemos en 24 horas hábiles.'
              : 'We are here to answer your questions about products, shipping, the partner program or anything else. We usually respond within 24 business hours.'}
          </p>
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-4 rounded-xl bg-slate-900/60 border border-slate-800">
              <Mail className="h-5 w-5 text-brand-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs uppercase tracking-wider text-slate-400 font-semibold">Email</p>
                <a href={`mailto:${contactInfo.email}`} className="text-white hover:text-brand-400 font-medium">{contactInfo.email}</a>
              </div>
            </div>
            <div className="flex items-start gap-3 p-4 rounded-xl bg-slate-900/60 border border-slate-800">
              <MessageCircle className="h-5 w-5 text-brand-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs uppercase tracking-wider text-slate-400 font-semibold">WhatsApp</p>
                <p className="text-white font-medium">{contactInfo.whatsapp}</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-4 rounded-xl bg-slate-900/60 border border-slate-800">
              <Clock className="h-5 w-5 text-brand-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs uppercase tracking-wider text-slate-400 font-semibold">{es ? 'Horario' : 'Hours'}</p>
                <p className="text-white font-medium">{contactInfo.hours}</p>
              </div>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800 border border-slate-800 p-6 space-y-4">
          <h2 className="text-xl font-bold text-white mb-2">{es ? 'Envíanos un mensaje' : 'Send us a message'}</h2>
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">{es ? 'Nombre' : 'Name'}</label>
            <input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full rounded-xl bg-slate-950/50 border border-slate-700 px-4 py-2.5 text-sm text-white placeholder:text-slate-500 outline-none focus:border-brand-500"
              placeholder={es ? 'Tu nombre' : 'Your name'}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Email</label>
            <input
              required
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="w-full rounded-xl bg-slate-950/50 border border-slate-700 px-4 py-2.5 text-sm text-white placeholder:text-slate-500 outline-none focus:border-brand-500"
              placeholder="you@email.com"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">{es ? 'Mensaje' : 'Message'}</label>
            <textarea
              required
              value={form.message}
              onChange={(e) => setForm({ ...form, message: e.target.value })}
              rows={5}
              className="w-full rounded-xl bg-slate-950/50 border border-slate-700 px-4 py-2.5 text-sm text-white placeholder:text-slate-500 outline-none focus:border-brand-500 resize-none"
              placeholder={es ? 'Cuéntanos en qué podemos ayudar...' : 'Tell us how we can help...'}
            />
          </div>
          <Button
            type="submit"
            disabled={sending}
            className="w-full bg-gradient-to-r from-brand-500 to-brand-400 text-white hover:from-brand-400 hover:to-brand-300 rounded-full h-11 font-bold shadow-xl shadow-brand-500/30"
          >
            <Send className="mr-2 h-4 w-4" />
            {sending ? (es ? 'Enviando...' : 'Sending...') : (es ? 'Enviar mensaje' : 'Send message')}
          </Button>
        </form>
      </div>
    </PageShell>
  );
}

// ── Terms ────────────────────────────────────────────────
export function TermsPage() {
  const { locale } = useI18n();
  const es = locale === 'es';
  return (
    <PageShell title={es ? 'Términos del servicio' : 'Terms of Service'} kicker="ILLIUM · LEGAL">
      <div className="not-prose flex items-center gap-2 mb-6 text-xs text-slate-400">
        <FileText className="h-4 w-4" />
        {es ? 'Última actualización: 13 de abril de 2026' : 'Last updated: April 13, 2026'}
      </div>

      <h2>1. {es ? 'Aceptación' : 'Acceptance'}</h2>
      <p>
        {es
          ? 'Al acceder y usar este sitio, aceptas cumplir con los presentes Términos del Servicio. Si no estás de acuerdo, te pedimos que no utilices el sitio.'
          : 'By accessing and using this site, you agree to comply with these Terms of Service. If you disagree, please do not use the site.'}
      </p>

      <h2>2. {es ? 'Edad' : 'Age'}</h2>
      <p>
        {es
          ? 'Debes tener al menos 21 años y ser un investigador, científico o profesional calificado para comprar en este sitio. Al completar una compra, confirmas que cumples estos requisitos y que usarás todos los productos exclusivamente con fines de investigación lícitos.'
          : 'You must be at least 21 years of age and a licensed researcher, scientist, or qualified professional to purchase from this site. By completing a purchase, you confirm that you meet these requirements and will use all products exclusively for lawful research purposes.'}
      </p>

      <h2>3. {es ? 'Uso del producto' : 'Product use'}</h2>
      <p>
        {es
          ? 'Todos los productos ofrecidos en ILLIUM son compuestos de calidad controlada destinados a propósitos de investigación en laboratorios. NO están destinados para consumo humano o animal, ni para diagnóstico, tratamiento, cura o prevención de ninguna enfermedad.'
          : 'All products offered on ILLIUM are quality-controlled compounds intended for laboratory research purposes. They are NOT intended for human or animal consumption, nor for the diagnosis, treatment, cure, or prevention of any disease.'}
      </p>

      <h2>4. {es ? 'Programa de socios' : 'Partner program'}</h2>
      <p>
        {es
          ? 'Los socios ganan comisiones según las tarifas publicadas (40% directa / 10% upline, sujeto a cambio por el administrador). Los pagos se liberan una vez que el pedido se marca como completado. ILLIUM se reserva el derecho de revisar y retener pagos por actividades fraudulentas.'
          : 'Partners earn commissions per published rates (40% direct / 10% upline, subject to change by the administrator). Payouts are released once the order is marked complete. ILLIUM reserves the right to review and withhold payments for fraudulent activity.'}
      </p>

      <h2>5. {es ? 'Cuentas' : 'Accounts'}</h2>
      <p>
        {es
          ? 'Eres responsable de mantener la confidencialidad de tu cuenta y contraseña. Notifícanos de inmediato si detectas uso no autorizado.'
          : 'You are responsible for maintaining the confidentiality of your account and password. Notify us immediately if you detect unauthorized use.'}
      </p>

      <h2>6. {es ? 'Propiedad intelectual' : 'Intellectual property'}</h2>
      <p>
        {es
          ? 'Todo el contenido del sitio (logo, textos, imágenes) es propiedad de ILLIUM o de sus licenciantes y está protegido por leyes de propiedad intelectual.'
          : 'All site content (logo, text, images) is property of ILLIUM or its licensors and is protected by intellectual property laws.'}
      </p>

      <h2>7. {es ? 'Limitación de responsabilidad' : 'Limitation of liability'}</h2>
      <p>
        {es
          ? 'ILLIUM no se responsabiliza por daños indirectos, incidentales o consecuentes derivados del uso del sitio o los productos.'
          : 'ILLIUM shall not be liable for indirect, incidental or consequential damages arising from use of the site or products.'}
      </p>

      <h2>8. {es ? 'Cambios' : 'Changes'}</h2>
      <p>
        {es
          ? 'Podemos actualizar estos términos en cualquier momento. Los cambios entran en vigor al publicarse en esta página.'
          : 'We may update these terms at any time. Changes take effect when posted on this page.'}
      </p>

      <h2>9. {es ? 'Contacto' : 'Contact'}</h2>
      <p>
        {es ? 'Escríbenos a ' : 'Write to '}
        <a href="mailto:legal@illium.health">legal@illium.health</a>
        {es ? ' para consultas legales.' : ' for legal inquiries.'}
      </p>
    </PageShell>
  );
}

// ── Privacy ───────────────────────────────────────────────
export function PrivacyPage() {
  const { locale } = useI18n();
  const es = locale === 'es';
  return (
    <PageShell title={es ? 'Política de privacidad' : 'Privacy Policy'} kicker="ILLIUM · LEGAL">
      <div className="not-prose flex items-center gap-2 mb-6 text-xs text-slate-400">
        <Lock className="h-4 w-4" />
        {es ? 'Última actualización: 13 de abril de 2026' : 'Last updated: April 13, 2026'}
      </div>

      <h2>1. {es ? 'Información que recopilamos' : 'Information we collect'}</h2>
      <ul>
        <li>{es ? 'Nombre, correo, teléfono WhatsApp y dirección de envío' : 'Name, email, WhatsApp phone, and shipping address'}</li>
        <li>{es ? 'Respuestas del quiz y productos que compraste' : 'Quiz answers and products you purchased'}</li>
        <li>{es ? 'IP, navegador y datos técnicos básicos' : 'IP, browser and basic technical data'}</li>
      </ul>

      <h2>2. {es ? 'Cómo la usamos' : 'How we use it'}</h2>
      <ul>
        <li>{es ? 'Procesar y enviar tus pedidos' : 'Process and ship your orders'}</li>
        <li>{es ? 'Generar recomendaciones personalizadas' : 'Generate personalized recommendations'}</li>
        <li>{es ? 'Calcular comisiones del programa de socios' : 'Calculate partner program commissions'}</li>
        <li>{es ? 'Notificaciones por WhatsApp (alertas de pedido)' : 'WhatsApp notifications (order alerts)'}</li>
      </ul>

      <h2>3. {es ? 'Con quién compartimos' : 'Who we share with'}</h2>
      <p>
        {es
          ? 'Con proveedores de confianza: Firebase (hosting/base de datos), Meta (WhatsApp Business), Groq (asistente IA). Nunca vendemos ni alquilamos tus datos.'
          : 'With trusted providers: Firebase (hosting/database), Meta (WhatsApp Business), Groq (AI assistant). We never sell or rent your data.'}
      </p>

      <h2>4. Cookies</h2>
      <p>
        {es
          ? 'Usamos almacenamiento local para preferencias (idioma, verificación de edad) y cookies técnicas para mantener tu sesión. No usamos tracking publicitario de terceros.'
          : 'We use local storage for preferences (language, age verification) and technical cookies to keep your session. We do not use third-party advertising trackers.'}
      </p>

      <h2>5. {es ? 'Tus derechos' : 'Your rights'}</h2>
      <p>
        {es
          ? 'Puedes solicitar acceso, corrección o eliminación de tus datos escribiéndonos a privacy@illium.health. Responderemos en un plazo máximo de 30 días.'
          : 'You may request access, correction or deletion of your data by writing to privacy@illium.health. We respond within 30 days.'}
      </p>

      <h2>6. {es ? 'Seguridad' : 'Security'}</h2>
      <p>
        {es
          ? 'Aplicamos cifrado TLS 1.3 en tránsito y cifrado en reposo para datos sensibles. Los pagos NO se almacenan en nuestros servidores.'
          : 'We apply TLS 1.3 encryption in transit and at-rest encryption for sensitive data. Payment details are NEVER stored on our servers.'}
      </p>

      <h2>7. {es ? 'Menores' : 'Minors'}</h2>
      <p>
        {es
          ? 'El sitio es exclusivo para mayores de 21 años. Si detectamos una cuenta de menor, será eliminada.'
          : 'The site is exclusive to users 21+. If we detect a minor account, it will be deleted.'}
      </p>

      <h2>8. {es ? 'Contacto' : 'Contact'}</h2>
      <p>
        <a href="mailto:privacy@illium.health">privacy@illium.health</a>
      </p>
    </PageShell>
  );
}

// ── Terms of Sale ───────────────────────────────────────────
export function TermsOfSalePage() {
  const { locale } = useI18n();
  const es = locale === 'es';
  return (
    <PageShell title={es ? 'Condiciones de Venta' : 'Terms of Sale'} kicker="ILLIUM · LEGAL">
      <h2>1. {es ? 'Solo para uso de investigación' : 'Research Use Only'}</h2>
      <p>
        {es
          ? 'Todos los productos ofrecidos por ILLIUM se venden exclusivamente para fines de investigación de laboratorio in vitro. No están aprobados para consumo humano, uso terapéutico ni uso veterinario. Los compradores deben ser investigadores, científicos o profesionales con licencia que operen dentro de un contexto de investigación legal.'
          : 'All products offered by ILLIUM are sold exclusively for in vitro laboratory and research purposes. They are not approved for human consumption, therapeutic use, or veterinary use. Purchasers must be licensed researchers, scientists, or professionals operating within a legal research context.'}
      </p>

      <h2>2. {es ? 'Requisito de edad' : 'Age Requirement'}</h2>
      <p>
        {es
          ? 'Debes tener al menos 21 años para comprar cualquier producto de este sitio web.'
          : 'You must be at least 21 years of age to purchase any product from this website.'}
      </p>

      <h2>3. {es ? 'Sin afirmaciones médicas' : 'No Medical Claims'}</h2>
      <p>
        {es
          ? 'ILLIUM no hace afirmación alguna de que sus productos diagnostiquen, traten, curen o prevengan ninguna enfermedad o condición médica. Todas las descripciones de productos se proporcionan únicamente como referencia informativa y científica.'
          : 'ILLIUM does not make any claims that its products diagnose, treat, cure, or prevent any disease or medical condition. All product descriptions are provided for informational and scientific reference only.'}
      </p>

      <h2>4. {es ? 'Cumplimiento de leyes locales' : 'Compliance with Local Laws'}</h2>
      <p>
        {es
          ? 'El comprador es el único responsable de asegurar que la compra y el uso de cualquier producto ILLIUM cumplan con todas las leyes y regulaciones locales, estatales, nacionales e internacionales aplicables.'
          : 'The buyer is solely responsible for ensuring that the purchase and use of any ILLIUM product complies with all applicable local, state, national, and international laws and regulations.'}
      </p>

      <h2>5. {es ? 'Limitación de responsabilidad' : 'Limitation of Liability'}</h2>
      <p>
        {es
          ? 'ILLIUM no será responsable de daños, pérdidas o consecuencias legales derivadas del mal uso, manejo inapropiado o uso no conforme de cualquier producto comprado a través de este sitio web.'
          : 'ILLIUM shall not be liable for any damages, losses, or legal consequences arising from the misuse, improper handling, or non-compliant use of any product purchased through this website.'}
      </p>

      <h2>6. {es ? 'Sin reventa para uso humano' : 'No Resale for Human Use'}</h2>
      <p>
        {es
          ? 'Queda estrictamente prohibida la reventa de productos ILLIUM para consumo humano o fines terapéuticos.'
          : 'Resale of ILLIUM products for human consumption or therapeutic purposes is strictly prohibited.'}
      </p>

      <h2>7. {es ? 'Contacto' : 'Contact'}</h2>
      <p>
        {es ? 'Escríbenos a ' : 'Write to '}
        <a href="mailto:legal@illium.health">legal@illium.health</a>
        {es ? ' para consultas legales.' : ' for legal inquiries.'}
      </p>
    </PageShell>
  );
}

// ── Lab Results / Certificates of Analysis (CoA) ────────────
export function LabResultsPage() {
  const { locale } = useI18n();
  const es = locale === 'es';
  const products = useAppStore((s) => s.products);
  return (
    <PageShell
      title={es ? 'Certificados de Análisis' : 'Certificates of Analysis'}
      kicker="ILLIUM · QUALITY"
    >
      <p>
        {es
          ? 'Todos los compuestos ILLIUM se prueban de forma independiente. A continuación encontrarás los Certificados de Análisis (CoA) más recientes por lote de cada compuesto, incluyendo resultados de HPLC (Cromatografía Líquida de Alta Resolución) y Espectrometría de Masas (MS).'
          : 'All ILLIUM compounds are independently tested. Below you will find the most recent Certificates of Analysis (CoA) for each product lot, including HPLC and Mass Spectrometry results.'}
      </p>

      <div className="not-prose mt-8 grid grid-cols-1 sm:grid-cols-2 gap-4">
        {products.length === 0 ? (
          <p className="text-sm text-slate-400">
            {es ? 'Cargando compuestos…' : 'Loading compounds…'}
          </p>
        ) : (
          products.map((p) => {
            const { name } = getLocalizedProduct(p, locale);
            return (
              <div
                key={p.id}
                className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5"
              >
                <div className="flex items-start gap-3">
                  <div className="h-10 w-10 rounded-xl bg-brand-500/15 border border-brand-500/30 flex items-center justify-center shrink-0">
                    <ShieldCheck className="h-5 w-5 text-brand-400" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-white text-base font-bold truncate">{name}</h3>
                    <p className="text-xs text-slate-400 mt-1">
                      {es ? 'Pureza' : 'Purity'}: 99%+ · {es ? 'Método' : 'Method'}: HPLC + MS
                    </p>
                    <Link
                      to={`/product/${p.id}`}
                      className="inline-block mt-3 text-xs font-semibold text-brand-400 hover:text-brand-300"
                    >
                      {es ? 'Ver compuesto →' : 'View compound →'}
                    </Link>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <h2>{es ? 'Solicitar el CoA de un lote' : 'Request a lot CoA'}</h2>
      <p>
        {es
          ? 'El Certificado de Análisis específico de tu lote se incluye con cada envío. Para solicitar el PDF del CoA de un lote concreto antes de comprar, escríbenos a '
          : 'The Certificate of Analysis specific to your lot is included with every shipment. To request the CoA PDF for a specific lot before purchasing, write to '}
        <a href="mailto:lab@illium.health">lab@illium.health</a>
        {es
          ? ' indicando el compuesto y el número de lote. También puedes verificar la autenticidad de tu producto escaneando el código QR de la etiqueta.'
          : ', indicating the compound and lot number. You can also verify your product’s authenticity by scanning the QR code on the label.'}
      </p>
    </PageShell>
  );
}
