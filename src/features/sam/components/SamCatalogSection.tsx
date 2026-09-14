import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { listen } from '@tauri-apps/api/event';
import { Download, ShieldCheck, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/components/hooks/use-toast';
import {
  samCatalog,
  samDownloadFromCatalog,
  type SamCatalogEntry,
  type SamDownloadProgress,
} from '@/lib/tauriDb';

interface Props {
  /** Se llama tras descargar, para que la lista de modelos se recargue. */
  onDownloaded?: () => void;
}

/**
 * Modelos SAM que la app sabe descargar.
 *
 * Existe porque hasta ahora había que saber qué modelo buscar, encontrar un
 * export ONNX que hablara la firma correcta y bajarlo por fuera. Eso dejaba el
 * asistente de segmentación fuera del alcance de quien no sabe qué es un
 * `.onnx` — que es casi todo el mundo que anotaría un corpus clínico.
 *
 * Se enseñan **la licencia y las advertencias antes de descargar**, no después:
 * quien mete un modelo en un corpus clínico tiene que poder responder por él.
 */
export function SamCatalogSection({ onDownloaded }: Props) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [catalogo, setCatalogo] = useState<SamCatalogEntry[]>([]);
  const [bajando, setBajando] = useState<string | null>(null);
  const [avance, setAvance] = useState<SamDownloadProgress | null>(null);

  useEffect(() => {
    samCatalog().then(setCatalogo).catch(() => setCatalogo([]));
  }, []);

  useEffect(() => {
    const un = listen<SamDownloadProgress>('sam:download-progress', (e) => setAvance(e.payload));
    return () => {
      un.then((f) => f());
    };
  }, []);

  const descargar = useCallback(
    async (m: SamCatalogEntry) => {
      setBajando(m.id);
      setAvance(null);
      try {
        await samDownloadFromCatalog(m.id);
        toast({ title: t('sam.catalog.downloaded', { name: m.name }) });
        onDownloaded?.();
      } catch (e) {
        toast({ title: String(e), variant: 'destructive' });
      } finally {
        setBajando(null);
        setAvance(null);
      }
    },
    [onDownloaded, t, toast],
  );

  if (catalogo.length === 0) return null;

  return (
    <section className="space-y-2">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {t('sam.catalog.title')}
      </h4>

      {catalogo.map((m) => {
        const enCurso = bajando === m.id;
        const pct =
          avance && avance.totalBytes
            ? Math.round((avance.downloadedBytes / avance.totalBytes) * 100)
            : 0;

        return (
          <div key={m.id} className="space-y-2 rounded-lg border border-border/60 p-3">
            <div className="flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{m.name}</span>
                  {m.verified ? (
                    <span
                      className="flex items-center gap-1 text-[10px] text-emerald-600"
                      title={t('sam.catalog.verifiedHelp')}
                    >
                      <ShieldCheck className="h-3 w-3" />
                      {t('sam.catalog.verified')}
                    </span>
                  ) : (
                    <span
                      className="flex items-center gap-1 text-[10px] text-amber-600"
                      title={t('sam.catalog.unverifiedHelp')}
                    >
                      <ShieldAlert className="h-3 w-3" />
                      {t('sam.catalog.unverified')}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground">{m.description}</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-7 shrink-0 text-xs"
                onClick={() => descargar(m)}
                disabled={bajando !== null}
              >
                <Download className="mr-1 h-3 w-3" />
                {enCurso ? t('sam.catalog.downloading') : `${m.encoderMb + m.decoderMb} MB`}
              </Button>
            </div>

            <div className="flex flex-wrap gap-x-3 text-[11px] text-muted-foreground">
              <span>{t('sam.catalog.license', { license: m.license })}</span>
              <span>{t(`sam.catalog.domain.${m.domain}`, { defaultValue: m.domain })}</span>
              <a
                href={m.source}
                target="_blank"
                rel="noreferrer"
                className="underline hover:text-foreground"
              >
                {t('sam.catalog.source')}
              </a>
            </div>

            {/* Las advertencias van a la vista, no detrás de un desplegable: son
                lo que decide si este modelo sirve para lo que se va a hacer. */}
            {m.caveats.length > 0 && (
              <ul className="space-y-0.5">
                {m.caveats.map((c, i) => (
                  <li key={i} className="text-[11px] text-muted-foreground">
                    · {c}
                  </li>
                ))}
              </ul>
            )}

            {enCurso && (
              <div className="space-y-1">
                <Progress value={pct} className="h-1.5" />
                <p className="text-[11px] text-muted-foreground">
                  {t('sam.catalog.progress', {
                    part: t(`sam.catalog.part.${avance?.part ?? 'encoder'}`),
                    pct,
                  })}
                </p>
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}
