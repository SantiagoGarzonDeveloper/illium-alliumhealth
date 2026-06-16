import { useEffect, useState } from 'react';
import { loadStripe, type Stripe } from '@stripe/stripe-js';
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js';
import { httpsCallable } from 'firebase/functions';
import { cloudFunctions } from '@/lib/firebase';
import { Lock, CreditCard, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface StripeIntentItem {
  productId?: string;
  name: string;
  quantity: number;
  unitPrice: number;
}

interface CreateIntentResponse {
  clientSecret: string;
  intentId: string;
  amount: number;
  currency: string;
}

interface Props {
  publishableKey: string;
  items: StripeIntentItem[];
  couponCode: string | null;
  claimedTotal: number;
  shippingCost: number;
  customerEmail: string;
  locale: 'es' | 'en';
  /** Called when the card is successfully charged. Parent should then create the order doc and clear the cart. */
  onPaymentSuccess: (args: { intentId: string }) => void;
}

/**
 * Stripe Elements wrapper. Loads `stripe-js` lazily, creates a PaymentIntent
 * server-side, and renders the PaymentElement (cards + Apple/Google Pay).
 */
export function StripeCardForm(props: Props) {
  const [stripePromise, setStripePromise] = useState<Promise<Stripe | null> | null>(null);
  const [clientSecret, setClientSecret] = useState<string>('');
  const [intentId, setIntentId] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [loadingIntent, setLoadingIntent] = useState(true);

  useEffect(() => {
    if (!props.publishableKey) return;
    setStripePromise(loadStripe(props.publishableKey));
  }, [props.publishableKey]);

  useEffect(() => {
    let cancelled = false;
    setLoadingIntent(true);
    setError('');
    void (async () => {
      try {
        const fn = httpsCallable<unknown, CreateIntentResponse>(cloudFunctions, 'createStripePaymentIntent');
        const result = await fn({
          items: props.items,
          couponCode: props.couponCode,
          claimedTotal: props.claimedTotal,
          shippingCost: props.shippingCost,
          customerEmail: props.customerEmail,
          locale: props.locale,
        });
        if (cancelled) return;
        if (result.data?.clientSecret) {
          setClientSecret(result.data.clientSecret);
          setIntentId(result.data.intentId);
        } else {
          setError(props.locale === 'es' ? 'No se pudo iniciar el pago.' : 'Could not initialize payment.');
        }
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : 'Stripe error';
        setError(msg);
      } finally {
        if (!cancelled) setLoadingIntent(false);
      }
    })();
    return () => { cancelled = true; };
  }, [props.items, props.couponCode, props.claimedTotal, props.shippingCost, props.customerEmail, props.locale]);

  if (!props.publishableKey) {
    return (
      <div className="text-xs text-amber-200 bg-amber-500/10 border border-amber-500/30 p-3 rounded-xl">
        {props.locale === 'es'
          ? 'Stripe no está configurado. Avisa al administrador.'
          : 'Stripe is not configured. Please contact the administrator.'}
      </div>
    );
  }

  if (loadingIntent) {
    return (
      <div className="text-xs text-slate-300 py-6 text-center">
        {props.locale === 'es' ? 'Preparando pago seguro…' : 'Preparing secure payment…'}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-start gap-2 text-xs text-red-200 bg-red-500/10 border border-red-500/30 p-3 rounded-xl">
        <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
        <div>
          <p className="font-bold">{props.locale === 'es' ? 'Error iniciando pago' : 'Payment init error'}</p>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  if (!stripePromise || !clientSecret) return null;

  return (
    <Elements
      stripe={stripePromise}
      options={{
        clientSecret,
        appearance: {
          theme: 'night',
          variables: {
            colorPrimary: '#22c55e',
            colorBackground: '#0f172a',
            colorText: '#f1f5f9',
            colorDanger: '#ef4444',
            fontFamily: 'Inter, system-ui, sans-serif',
            borderRadius: '12px',
          },
        },
      }}
    >
      <StripeInner
        locale={props.locale}
        amount={props.claimedTotal}
        onPaymentSuccess={() => props.onPaymentSuccess({ intentId })}
      />
    </Elements>
  );
}

function StripeInner({
  locale,
  amount,
  onPaymentSuccess,
}: {
  locale: 'es' | 'en';
  amount: number;
  onPaymentSuccess: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string>('');

  const handlePay = async () => {
    if (!stripe || !elements) return;
    setSubmitting(true);
    setErr('');
    try {
      const { error: confirmError, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: {},
        redirect: 'if_required',
      });
      if (confirmError) {
        setErr(confirmError.message || (locale === 'es' ? 'Pago rechazado' : 'Payment failed'));
        return;
      }
      if (paymentIntent && paymentIntent.status === 'succeeded') {
        onPaymentSuccess();
      } else {
        setErr(locale === 'es' ? 'El pago no se completó.' : 'Payment did not complete.');
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error';
      setErr(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <PaymentElement />
      {err && (
        <div className="flex items-start gap-2 text-xs text-red-200 bg-red-500/10 border border-red-500/30 p-3 rounded-xl">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <p>{err}</p>
        </div>
      )}
      <Button
        type="button"
        onClick={handlePay}
        disabled={!stripe || !elements || submitting}
        className="w-full bg-gradient-to-r from-indigo-500 to-indigo-400 hover:from-indigo-400 hover:to-indigo-300 text-white rounded-full h-12 text-sm font-bold shadow-xl shadow-indigo-500/30"
      >
        <Lock className="h-4 w-4 mr-2" />
        {submitting
          ? (locale === 'es' ? 'Procesando…' : 'Processing…')
          : (locale === 'es' ? `Pagar $${amount.toFixed(2)}` : `Pay $${amount.toFixed(2)}`)}
        {!submitting && <CreditCard className="h-4 w-4 ml-2" />}
      </Button>
      <p className="text-[10px] text-slate-400 text-center flex items-center justify-center gap-1">
        <Lock className="h-3 w-3" />
        {locale === 'es' ? 'Pago seguro procesado por Stripe.' : 'Secure payment processed by Stripe.'}
      </p>
    </div>
  );
}
