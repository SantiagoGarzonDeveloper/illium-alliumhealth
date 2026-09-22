/**
 * Cliente del backend propio (`/api.php`, en el mismo hosting del dominio).
 *
 * Sustituye a las Cloud Functions de Firebase, que quedaron caídas al cerrarse
 * la cuenta de facturación del proyecto (responden 503 y no se pueden
 * redesplegar). Todo lo que hay aquí funciona sin Firebase.
 */
import { auth } from '@/lib/firebase';

const API = '/api.php';

/** Llama al API propio. `conSesion` adjunta el token del usuario (acciones de admin). */
export async function llamarApi<T>(
  accion: string,
  datos: Record<string, unknown> = {},
  conSesion = false,
): Promise<T> {
  const cabeceras: Record<string, string> = { 'Content-Type': 'application/json' };
  if (conSesion) {
    const token = await auth.currentUser?.getIdToken();
    if (token) cabeceras.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(API, {
    method: 'POST',
    headers: cabeceras,
    body: JSON.stringify({ accion, ...datos }),
  });
  let cuerpo: unknown;
  try {
    cuerpo = await res.json();
  } catch {
    throw new Error(`El servidor respondió mal (HTTP ${res.status})`);
  }
  const obj = cuerpo as { ok?: boolean; error?: string };
  if (!res.ok && obj?.error) throw new Error(obj.error);
  return cuerpo as T;
}

export type ResumenPedido = {
  nombre: string;
  email: string;
  whatsapp?: string;
  pago?: string;
  total: number;
  items: Array<{ name: string; quantity: number; price: number }>;
};

/**
 * Avisa del pedido nuevo (correo al cliente, a los admins y WhatsApp).
 * Nunca lanza error: si el aviso falla, el pedido ya está guardado y no se
 * debe romper la pantalla de "gracias por tu compra".
 */
export async function avisarPedidoCreado(orderId: string, pedido: ResumenPedido): Promise<void> {
  try {
    await llamarApi('pedido-creado', { orderId, pedido });
  } catch (e) {
    console.warn('No se pudo enviar el aviso del pedido:', e);
  }
}
