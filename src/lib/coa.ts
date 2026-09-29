/** ¿El COA es un PDF? (si no, se trata como imagen). */
export function isPdfUrl(url: string): boolean {
  return /\.pdf($|[?#])/i.test(url) || /application\/pdf/i.test(url);
}
