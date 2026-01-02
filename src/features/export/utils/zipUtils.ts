// Utility functions for working with JSZip
// Currently minimal, can be extended as needed

export async function createZipFromFiles(
  files: Array<{ path: string; content: Blob | string }>
): Promise<Blob> {
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();

  files.forEach(({ path, content }) => {
    zip.file(path, content);
  });

  return await zip.generateAsync({ type: 'blob' });
}
