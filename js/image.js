// Стискання фото перед збереженням: найдовша сторона до 1800 px, JPEG 85 %.
// Малі PNG (схеми, скріни) і GIF зберігаються як є, щоб не псувати чіткість.
export async function compressImage(file) {
  const raw = new Uint8Array(await file.arrayBuffer());
  const type = file.type || 'image/jpeg';
  if (type === 'image/gif' || type === 'image/svg+xml' || (type === 'image/png' && raw.length < 600 * 1024) || (type === 'image/webp' && raw.length < 400 * 1024)) {
    return { bytes: raw, ext: { 'image/gif': 'gif', 'image/svg+xml': 'svg', 'image/png': 'png', 'image/webp': 'webp' }[type], mime: type };
  }
  try {
    const bmp = await createImageBitmap(file);
    const max = 1800, k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * k), h = Math.round(bmp.height * k);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d');
    if (type === 'image/png') { g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); }
    g.drawImage(bmp, 0, 0, w, h);
    const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.85));
    const bytes = new Uint8Array(await blob.arrayBuffer());
    if (bytes.length < raw.length || k < 1) return { bytes, ext: 'jpg', mime: 'image/jpeg' };
  } catch (e) { console.warn('compress', e); }
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().slice(0, 5);
  return { bytes: raw, ext, mime: type };
}
