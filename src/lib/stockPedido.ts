/**
 * Descuento de inventario al cerrar un pedido.
 *
 * Antes lo hacía la Cloud Function `waOnOrderCreated`, caída desde que se cerró
 * la cuenta de facturación de Firebase. Ahora se hace desde la web, una sola
 * vez, justo después de guardar el pedido.
 *
 * Nota: las reglas de Firestore solo dejan tocar los productos a usuarios con
 * sesión iniciada. Si la compra es de un invitado, el descuento no se aplica y
 * queda avisado en la consola (el admin lo ajusta desde Inventario).
 */
import { doc, getDoc, updateDoc, addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';

export type LineaPedido = { productId?: string; name?: string; quantity?: number };

export type ResultadoStock = { aplicados: number; omitidos: number; motivo?: string };

/**
 * Descuenta el stock de cada producto del pedido y anota el movimiento en el
 * historial de inventario. Nunca lanza error: el pedido ya está guardado y la
 * pantalla de "gracias por tu compra" no debe romperse por esto.
 */
export async function aplicarStockDelPedido(orderId: string, lineas: LineaPedido[]): Promise<ResultadoStock> {
  const res: ResultadoStock = { aplicados: 0, omitidos: 0 };
  if (!auth.currentUser) {
    res.motivo = 'sin_sesion';
    res.omitidos = lineas.length;
    console.warn('[stock] compra de invitado: el inventario lo ajusta el admin desde el panel');
    return res;
  }

  for (const linea of lineas) {
    const pid = linea.productId;
    if (!pid) { res.omitidos++; continue; }
    try {
      const prodRef = doc(db, 'products', pid);
      const prod = await getDoc(prodRef);
      if (!prod.exists()) { res.omitidos++; continue; }
      const cantidad = Math.max(1, Math.round(Number(linea.quantity) || 1));
      const antes = Number(prod.data()?.stock) || 0;
      const despues = Math.max(0, antes - cantidad);
      await updateDoc(prodRef, { stock: despues });
      res.aplicados++;
      void addDoc(collection(db, 'inventoryLogs'), {
        productId: pid,
        productName: String(prod.data()?.name || linea.name || ''),
        type: 'sale',
        quantity: -cantidad,
        previousStock: antes,
        newStock: despues,
        note: `Pedido ${orderId.slice(0, 8)}`,
        createdAt: serverTimestamp(),
      }).catch(() => { /* el historial es informativo */ });
    } catch (e) {
      res.omitidos++;
      console.warn('[stock] no se pudo descontar', pid, e);
    }
  }

  // Marca del pedido (solo la puede escribir un admin; si falla, da igual).
  void updateDoc(doc(db, 'orders', orderId), { stockApplied: res.aplicados > 0 }).catch(() => { /* opcional */ });
  return res;
}
