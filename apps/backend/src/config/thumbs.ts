import path from 'path';
import fs from 'fs/promises';
import sharp from 'sharp';
import type { Request, Response, NextFunction } from 'express';

// Miniaturas de fotos de producto para la tienda: /uploads/products/x.jpg?w=320
// devuelve una versión WebP de 320 px (la foto original es de 600 px y en el
// celular se muestra a ~170 px). Se genera la primera vez y queda guardada en
// uploads/thumbs, así que después sale directo del disco. Sin ?w (POS, ERP,
// TV) se sirve la original como siempre.
const UPLOADS = path.join(process.cwd(), 'uploads');
const ALLOWED_WIDTHS = new Set([160, 320]);
const SAFE_NAME = /^[\w-]+\.(jpe?g|png|webp)$/i;

export async function productThumb(req: Request, res: Response, next: NextFunction) {
  const w = Number(req.query['w']);
  const match = /^\/products\/([^/]+)$/.exec(req.path);
  if (!match || !ALLOWED_WIDTHS.has(w) || !SAFE_NAME.test(match[1])) return next();

  const src = path.join(UPLOADS, 'products', match[1]);
  const dir = path.join(UPLOADS, 'thumbs', String(w));
  const out = path.join(dir, match[1].replace(/\.\w+$/, '.webp'));
  try {
    await fs.access(out);
  } catch {
    try {
      await fs.mkdir(dir, { recursive: true });
      const tmp = `${out}.${process.pid}.tmp`;
      await sharp(src).resize(w, w, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 74 }).toFile(tmp);
      await fs.rename(tmp, out);
    } catch {
      return next(); // sin original o error: se sirve lo de siempre
    }
  }
  res.setHeader('Cache-Control', 'public, max-age=2592000, immutable');
  res.type('image/webp');
  return res.sendFile(out);
}
