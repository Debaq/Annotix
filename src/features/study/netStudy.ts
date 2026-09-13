// `net.request` para el tráfico que sale del webview (sección 3.7).
//
// La mayor parte del tráfico de Annotix sale del backend y ya pasa por
// `src-tauri/src/net`. Lo poco que pide la interfaz directamente se registra
// aquí, con la misma forma de evento: solo dominio y propósito.

import { studyLog } from './studyLog';
import type { NetPurpose } from './events';

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return 'unknown';
  }
}

/**
 * Envuelve un `fetch` del webview para registrarlo. Devuelve la respuesta tal
 * cual: el registro no puede cambiar el comportamiento de la llamada.
 */
export async function studyFetch(
  url: string,
  purpose: NetPurpose,
  init?: RequestInit,
): Promise<Response> {
  const bytesOut = typeof init?.body === 'string' ? new Blob([init.body]).size : 0;
  try {
    const res = await fetch(url, init);
    studyLog.emit('net.request', {
      host: hostOf(url),
      purpose,
      bytes_out: bytesOut,
      bytes_in: Number(res.headers.get('content-length') ?? 0),
      ok: res.ok,
    });
    return res;
  } catch (e) {
    studyLog.emit('net.request', {
      host: hostOf(url),
      purpose,
      bytes_out: bytesOut,
      bytes_in: 0,
      ok: false,
    });
    throw e;
  }
}
