export interface ImageOptimizeOptions {
  /** Ancho máximo en px. Por defecto 1920. */
  maxWidth?: number;
  /** Alto máximo en px. Por defecto 1920. */
  maxHeight?: number;
  /** Calidad WebP entre 0 y 1. Por defecto 0.8. */
  quality?: number;
  /** Si un WebP ya pesa menos que esto, se envía sin recomprimir. Por defecto 250KB. */
  skipWebpUnderBytes?: number;
}

const DEFAULT_MAX_WIDTH = 1920;
const DEFAULT_MAX_HEIGHT = 1920;
const DEFAULT_QUALITY = 0.8;
const DEFAULT_SKIP_WEBP_BYTES = 250 * 1024;

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('No se pudo leer la imagen'));
    img.src = src;
  });
}

/**
 * Redimensiona y convierte una imagen a WebP usando canvas en el navegador.
 * Los PDF, GIF animados, SVG y archivos no-imagen se devuelven intactos.
 * Si algo falla o el resultado pesa más que el original, devuelve el original.
 */
export async function optimizeImageFile(
  file: File,
  options: ImageOptimizeOptions = {}
): Promise<File> {
  const maxWidth = options.maxWidth ?? DEFAULT_MAX_WIDTH;
  const maxHeight = options.maxHeight ?? DEFAULT_MAX_HEIGHT;
  const quality = options.quality ?? DEFAULT_QUALITY;
  const skipWebpUnderBytes = options.skipWebpUnderBytes ?? DEFAULT_SKIP_WEBP_BYTES;

  if (!file.type.startsWith('image/')) return file;
  if (file.type === 'image/gif' || file.type === 'image/svg+xml') return file;
  if (file.type === 'image/webp' && file.size <= skipWebpUnderBytes) return file;

  let objectUrl: string | undefined;
  try {
    objectUrl = URL.createObjectURL(file);
    const img = await loadImageElement(objectUrl);

    const scale = Math.min(1, maxWidth / img.naturalWidth, maxHeight / img.naturalHeight);
    const targetWidth = Math.max(1, Math.round(img.naturalWidth * scale));
    const targetHeight = Math.max(1, Math.round(img.naturalHeight * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;

    const ctx = canvas.getContext('2d');
    if (!ctx) return file;

    ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/webp', quality)
    );

    if (!blob || blob.type !== 'image/webp' || blob.size >= file.size) {
      return file;
    }

    const baseName = file.name.replace(/\.[^.]+$/, '');
    return new File([blob], `${baseName}.webp`, {
      type: 'image/webp',
      lastModified: Date.now(),
    });
  } catch {
    return file;
  } finally {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}

/** Optimiza una lista de archivos conservando el orden. */
export async function optimizeImageFiles(
  files: File[],
  options: ImageOptimizeOptions = {}
): Promise<File[]> {
  return Promise.all(files.map((file) => optimizeImageFile(file, options)));
}
