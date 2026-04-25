export function sanitizeForFilename(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[^\w.-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80) || 'project';
}

export function timestampForFilename(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

export function buildModelDownloadName(opts: {
  projectName: string;
  variant: string;
  extension: string;
  date?: Date;
}): string {
  const proj = sanitizeForFilename(opts.projectName);
  const variant = sanitizeForFilename(opts.variant);
  const ts = timestampForFilename(opts.date);
  const ext = opts.extension.replace(/^\./, '');
  return `${proj}_${variant}_${ts}.${ext}`;
}

export function extensionFromPath(path: string): string {
  const m = path.match(/\.([A-Za-z0-9]+)$/);
  return m ? m[1] : 'bin';
}
