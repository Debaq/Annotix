const REPO = 'Debaq/Annotix';
const CACHE_KEY = 'annotix-changelog';
const CACHE_TTL = 1000 * 60 * 30; // 30 minutos

export interface ChangelogEntry {
  hash: string;
  message: string;
}

interface CachedData {
  ts: number;
  entries: ChangelogEntry[];
}

/**
 * Obtiene los últimos 30 commits desde la API de GitHub.
 * Cachea en sessionStorage para no repetir la llamada en la misma sesión.
 */
export async function fetchChangelog(): Promise<ChangelogEntry[]> {
  // Leer cache
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (raw) {
      const cached: CachedData = JSON.parse(raw);
      if (Date.now() - cached.ts < CACHE_TTL) {
        return cached.entries;
      }
    }
  } catch { /* ignore */ }

  try {
    const res = await fetch(
      `https://api.github.com/repos/${REPO}/commits?per_page=30`,
      { headers: { Accept: 'application/vnd.github.v3+json' } },
    );

    if (!res.ok) return [];

    const data = await res.json();
    const entries: ChangelogEntry[] = data.map((c: any) => ({
      hash: (c.sha as string).slice(0, 7),
      message: (c.commit.message as string).split('\n')[0],
    }));

    // Guardar cache
    try {
      sessionStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), entries }));
    } catch { /* ignore */ }

    return entries;
  } catch {
    return [];
  }
}
