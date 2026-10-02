// Choose a short product label from browser OCR output. Shelf labels often
// include prices and promotional text before the product name.
export function productTextFromOcr(text) {
  const lines = text.split(/\r?\n/).map(line => line.replace(/\s+/g, " ").trim()).filter(Boolean);
  const productLines = lines.filter(line => /[a-z]{2,}/i.test(line) && !/^(?:\$?\d+[.,\d]*|barcode|price|special|save|was|now|each|unit price|aisle|bay|sku|ean|gtin)\b/i.test(line));
  const name = (productLines.find(line => /[a-z]{3,}/i.test(line)) || "").replace(/\bIL\b$/i, "1L")
    // A trailing "G" on a round gram size (255G, 500G) is often read as a 6.
    .replace(/\b(\d{1,3}[05])6$/, "$1G")
    // A leading 1 in a kg/litre size is often read as I.
    .replace(/\bI(KG|ML|L)$/i, "1$1")
    // Ticket abbreviations like S/MARE come out with a stray quote or dash in front.
    .replace(/^[^A-Z0-9]+/i, "").replace(/^([A-Z])['’`]/, "$1/");
  const size = text.match(/\b\d+(?:[.,]\d+)?\s?(?:kg|g|mg|ml|l|litres?|pack|pk)\b/i)?.[0];
  return [name, size && !name.toLowerCase().includes(size.toLowerCase()) ? size : ""].filter(Boolean).join(" ").slice(0, 120);
}

export function stockCodeFromOcr(text, confidence) {
  if (confidence < 40) return "";
  let first = text.toUpperCase().trim().split(/\s+/)[0]?.replace(/^[^A-Z0-9]+|[^A-Z0-9-]+$/g, "") || "";
  // Codes are either six digits or an "S" plus six digits; a leading S is often read as 8 or 5.
  if (/^[58]\d{6}$/.test(first)) first = `S${first.slice(1)}`;
  return /^[A-Z0-9][A-Z0-9-]{2,11}$/.test(first) && !/^\d{10,}$/.test(first) ? first : "";
}

export function ticketLocationFromOcr(text, confidence) {
  if (confidence < 40) return null;
  // Take the aisle-bay pair at the end of the line; a leading lone "0" from the row is ignored.
  const match = text.trim().match(/(?:^|\s)(\d{1,2})\s*[-–—]\s*(\d{1,2})$/);
  if (!match || +match[1] < 1 || +match[2] < 1) return null;
  return { aisle: String(+match[1]), bay: String(+match[2]) };
}

const stockMarker = /^\[\[ShelfAlert stock code: ([A-Z0-9-]{3,12})\]\](?:\n|$)/;
export function encodeGapNotes(stockCode, notes) {
  return `${stockCode ? `[[ShelfAlert stock code: ${stockCode}]]\n` : ""}${notes || ""}`;
}
export function decodeGapNotes(notes = "") {
  const match = notes.match(stockMarker);
  return { stockCode: match?.[1] || "", notes: match ? notes.slice(match[0].length) : notes };
}

// ─── Shelf-ticket detection ─────────────────────────────────────────────────
// Green shelf tickets are often a small part of a photo, and other green things
// (packaging, produce) share the frame. Pick the ticket by shape: a wide, mostly
// filled green block; then work out which way up it is and where its text rows
// and fields sit from the pixels themselves, since layouts shift slightly.

// Hue 70-175° (yellow-green to teal) with real saturation: covers the bright green
// of well-lit tickets and the minty teal they turn under cool shop lighting.
export function isTicketGreen(r, g, b) {
  if (g < 80 || g < r || g < b) return false;
  const d = g - Math.min(r, b);
  if (d / g < .3) return false;
  const hue = 60 * (2 + (b - r) / d);
  return hue >= 70 && hue <= 175;
}

export function findTicketBox(data, width, height, cell = 4) {
  const cw = Math.floor(width / cell), ch = Math.floor(height / cell);
  const mask = new Uint8Array(cw * ch);
  for (let cy = 0; cy < ch; cy++) for (let cx = 0; cx < cw; cx++) {
    let n = 0;
    for (let y = 0; y < cell; y++) for (let x = 0; x < cell; x++) {
      const i = ((cy * cell + y) * width + cx * cell + x) * 4;
      if (isTicketGreen(data[i], data[i + 1], data[i + 2])) n++;
    }
    if (n >= cell * cell * .3) mask[cy * cw + cx] = 1;
  }
  const seen = new Uint8Array(cw * ch);
  let best = null;
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || seen[start]) continue;
    const stack = [start]; seen[start] = 1;
    let area = 0, x0 = cw, x1 = 0, y0 = ch, y1 = 0;
    while (stack.length) {
      const k = stack.pop(), x = k % cw, y = (k - x) / cw;
      area++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (const n of [x > 0 && k - 1, x < cw - 1 && k + 1, y > 0 && k - cw, y < ch - 1 && k + cw]) {
        if (n !== false && mask[n] && !seen[n]) { seen[n] = 1; stack.push(n); }
      }
    }
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1, aspect = Math.max(bw, bh) / Math.min(bw, bh), fill = area / (bw * bh);
    // Tickets can be photographed sideways, so accept a tall block as well as a wide one.
    if (Math.max(bw, bh) * cell < 100 || Math.min(bw, bh) * cell < 28 || aspect < 1.6 || aspect > 8 || fill < .4) continue;
    if (!best || area * fill > best.score) best = { score: area * fill, left: x0 * cell, top: y0 * cell, right: (x1 + 1) * cell, bottom: (y1 + 1) * cell };
  }
  return best && { left: best.left, top: best.top, right: best.right, bottom: best.bottom };
}

// The white barcode label sits at the lower left of an upright ticket. Returns how
// many clockwise quarter-turns bring the photographed ticket upright.
export function quarterTurnsToUpright(data, width, box) {
  let n = 0, sx = 0, sy = 0;
  for (let y = box.top; y < box.bottom; y += 2) for (let x = box.left; x < box.right; x += 2) {
    const i = (y * width + x) * 4, max = Math.max(data[i], data[i + 1], data[i + 2]), min = Math.min(data[i], data[i + 1], data[i + 2]);
    if (max > 140 && max - min < max * .2) { n++; sx += x; sy += y; }
  }
  if (n < 20) return 0;
  let p = [(sx / n - box.left) / (box.right - box.left), (sy / n - box.top) / (box.bottom - box.top)], best = 0, bestDistance = Infinity;
  for (let k = 0; k < 4; k++) {
    const d = (p[0] - .28) ** 2 + (p[1] - .65) ** 2;
    if (d < bestDistance - 1e-9) { bestDistance = d; best = k; }
    p = [1 - p[1], p[0]];
  }
  return best;
}

const luma = (data, i) => .299 * data[i] + .587 * data[i + 1] + .114 * data[i + 2];

// Rows of dark print inside the ticket's left (white/green) area, top to bottom.
export function textBands(data, width, box) {
  const x0 = Math.round(box.left + (box.right - box.left) * .03), x1 = Math.round(box.left + (box.right - box.left) * .5);
  const rowLuma = [];
  for (let y = box.top; y < box.bottom; y++) {
    let sum = 0;
    for (let x = x0; x < x1; x++) sum += luma(data, (y * width + x) * 4);
    rowLuma.push(sum / (x1 - x0));
  }
  const sorted = [...rowLuma].sort((a, b) => a - b), median = sorted[sorted.length >> 1];
  const dark = Math.min(115, median * .6);
  const counts = [];
  for (let y = box.top; y < box.bottom; y++) {
    let n = 0;
    for (let x = x0; x < x1; x++) if (luma(data, (y * width + x) * 4) < dark) n++;
    counts.push(n);
  }
  // Rows that are almost entirely dark are the plastic rim or ticket edge, not print.
  const minCount = Math.max(2, (x1 - x0) * .05), maxCount = (x1 - x0) * .85, bands = [];
  for (let i = 0; i < counts.length; i++) {
    if (counts[i] < minCount || counts[i] > maxCount) continue;
    const last = bands[bands.length - 1];
    if (last && i - last[1] <= 2) last[1] = i; else bands.push([i, i]);
  }
  const minHeight = (box.bottom - box.top) * .07;
  const found = bands.filter(([a, b]) => b - a + 1 >= minHeight).map(([a, b]) => [box.top + a, box.top + b + 1]);
  // How much of each band is ink: barcode bars are far denser than printed digits.
  const density = ([a, b]) => { let n = 0; for (let y = a; y < b; y++) for (let x = x0; x < x1; x++) if (luma(data, (y * width + x) * 4) < dark) n++; return n / ((b - a) * (x1 - x0)); };
  return { bands: found.map(b => ({ y: b, density: density(b) })), dark };
}

// Horizontal runs of print in a row, split at word gaps, stopping where the green price block starts.
export function textRuns(data, width, box, y0, y1, dark, { from = box.left, stopAtPrice = true } = {}) {
  const rows = Math.max(1, y1 - y0), gap = Math.max(4, rows * .8), bw = box.right - box.left;
  let stop = box.right;
  for (let x = Math.round(box.left + bw * .3); stopAtPrice && x < box.right; x++) {
    let green = 0;
    for (let y = y0; y < y1; y++) { const i = (y * width + x) * 4; if (isTicketGreen(data[i], data[i + 1], data[i + 2])) green++; }
    if (green > rows * .6) { stop = x; break; }
  }
  const runs = [];
  for (let x = from; x < stop; x++) {
    let ink = 0;
    for (let y = y0; y < y1; y++) if (luma(data, (y * width + x) * 4) < dark) ink++;
    if (ink < 2) continue;
    const last = runs[runs.length - 1];
    if (last && x - last[1] <= gap) last[1] = x; else runs.push([x, x]);
  }
  // A thin dark line against the ticket edge is the border, not text.
  return runs.filter(([a, b]) => !(b - a < 3 && a - from < bw * .03)).map(([a, b]) => [a, b + 1]);
}

// Where the white barcode label begins in a row (left of it is black plastic or green border).
export function labelStart(data, width, box, y0, y1) {
  const rows = Math.max(1, y1 - y0);
  for (let x = box.left; x < box.right; x++) {
    let bright = 0;
    for (let y = y0; y < y1; y++) if (luma(data, (y * width + x) * 4) > 150) bright++;
    if (bright > rows * .5) return x;
  }
  return box.left;
}

// The barcode-number / aisle-bay row sits just below the stock row. Its print is
// light grey, so look for it with a looser ink threshold inside that window.
export function digitsBand(data, width, box, stockRow, dark) {
  const h = stockRow[1] - stockRow[0], bw = box.right - box.left;
  const top = Math.round(stockRow[1] + h * .3), bottom = Math.min(box.bottom, Math.round(stockRow[1] + h * 2.6));
  const x0 = labelStart(data, width, box, stockRow[0], stockRow[1]), x1 = Math.round(box.left + bw * .5), loose = Math.min(165, dark * 1.4);
  if (bottom - top < 4 || x1 - x0 < 10) return null;
  const minCount = Math.max(2, (x1 - x0) * .03), bands = [];
  for (let y = top; y < bottom; y++) {
    let n = 0;
    for (let x = x0; x < x1; x++) if (luma(data, (y * width + x) * 4) < loose) n++;
    if (n < minCount || n > (x1 - x0) * .85) continue;
    const last = bands[bands.length - 1];
    if (last && y - last[1] <= 2) last[1] = y; else bands.push([y, y]);
  }
  const first = bands.find(([a, b]) => b - a + 1 >= Math.max(4, h * .5));
  return first ? { y: [first[0], first[1] + 1], dark: loose, from: x0 } : null;
}

// Draw a region from the working-size photo, scale it to a height Tesseract reads
// well, and turn it into black print on white with a margin. Thresholding is local
// (each pixel against the average around it), so glare gradients, shadows and the
// plastic rim around the ticket do not wipe out or add print.
// `cut` scales the threshold: below 1 thins heavy print, above 1 recovers faint strokes.
// `stretch` widens condensed lettering so its characters separate.
function ocrCrop(source, scale, [x, y, w, h], { height, maxWidth, cut = 1, stretch = 1 }) {
  const factor = Math.min(height / h, maxWidth / (w * stretch));
  const pad = 16, cw = Math.max(1, Math.round(w * factor * stretch)), chh = Math.max(1, Math.round(h * factor));
  const canvas = document.createElement("canvas");
  canvas.width = cw + pad * 2; canvas.height = chh + pad * 2;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, x / scale, y / scale, w / scale, h / scale, pad, pad, cw, chh);
  const img = ctx.getImageData(pad, pad, cw, chh), grey = new Uint8Array(cw * chh);
  for (let i = 0; i < grey.length; i++) grey[i] = luma(img.data, i * 4);
  // Integral image for the local mean.
  const stride = cw + 1, integral = new Float64Array(stride * (chh + 1));
  for (let yy = 0; yy < chh; yy++) {
    let row = 0;
    for (let xx = 0; xx < cw; xx++) { row += grey[yy * cw + xx]; integral[(yy + 1) * stride + xx + 1] = integral[yy * stride + xx + 1] + row; }
  }
  const r = Math.max(8, Math.round(chh * .75)), ratio = .82 * cut, ink = new Uint8Array(cw * chh);
  for (let yy = 0; yy < chh; yy++) {
    const y0 = Math.max(0, yy - r), y1 = Math.min(chh, yy + r + 1);
    for (let xx = 0; xx < cw; xx++) {
      const x0 = Math.max(0, xx - r), x1 = Math.min(cw, xx + r + 1);
      const sum = integral[y1 * stride + x1] - integral[y0 * stride + x1] - integral[y1 * stride + x0] + integral[y0 * stride + x0];
      ink[yy * cw + xx] = grey[yy * cw + xx] < sum / ((x1 - x0) * (y1 - y0)) * ratio ? 1 : 0;
    }
  }
  // Drop dark edges (ticket border, price-block edge) touching any side.
  const share = (count, at) => { let n = 0; for (let k = 0; k < count; k++) n += ink[at(k)]; return n / count; };
  for (let xx = 0; xx < cw * .15 && share(chh, k => k * cw + xx) > .6; xx++) for (let k = 0; k < chh; k++) ink[k * cw + xx] = 0;
  for (let xx = cw - 1; xx > cw * .75 && share(chh, k => k * cw + xx) > .6; xx--) for (let k = 0; k < chh; k++) ink[k * cw + xx] = 0;
  for (let yy = 0; yy < chh * .2 && share(cw, k => yy * cw + k) > .6; yy++) for (let k = 0; k < cw; k++) ink[yy * cw + k] = 0;
  for (let yy = chh - 1; yy > chh * .8 && share(cw, k => yy * cw + k) > .6; yy--) for (let k = 0; k < cw; k++) ink[yy * cw + k] = 0;
  // Remove specks and thin vertical lines (tape edges, border fragments) so they are not read as characters.
  const seen = new Uint8Array(ink.length);
  for (let start = 0; start < ink.length; start++) {
    if (seen[start] || !ink[start]) continue;
    const stack = [start], cells = []; seen[start] = 1;
    let minX = cw, maxX = 0, minY = chh, maxY = 0;
    while (stack.length) {
      const k = stack.pop(), xx = k % cw, yy = (k - xx) / cw; cells.push(k);
      if (xx < minX) minX = xx; if (xx > maxX) maxX = xx; if (yy < minY) minY = yy; if (yy > maxY) maxY = yy;
      for (const n of [xx > 0 && k - 1, xx < cw - 1 && k + 1, yy > 0 && k - cw, yy < chh - 1 && k + cw]) if (n !== false && !seen[n] && ink[n]) { seen[n] = 1; stack.push(n); }
    }
    const bw = maxX - minX + 1, bh = maxY - minY + 1;
    if (cells.length < 12 || (bw <= Math.max(4, chh * .06) && bh > chh * .4 && bh > bw * 5)) for (const k of cells) ink[k] = 0;
  }
  for (let i = 0; i < ink.length; i++) { const v = ink[i] ? 0 : 255; img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255; }
  ctx.putImageData(img, pad, pad);
  return canvas;
}

function rotateQuarterTurns(source, turns) {
  const k = ((turns % 4) + 4) % 4;
  if (!k) return source;
  const canvas = document.createElement("canvas");
  canvas.width = k % 2 ? source.height : source.width; canvas.height = k % 2 ? source.width : source.height;
  const ctx = canvas.getContext("2d");
  ctx.translate(canvas.width / 2, canvas.height / 2); ctx.rotate(k * Math.PI / 2);
  ctx.drawImage(source, -source.width / 2, -source.height / 2);
  return canvas;
}

function detectOn(source) {
  const scale = Math.min(1, 1600 / Math.max(source.width, source.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(source.width * scale); canvas.height = Math.round(source.height * scale);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return { scale, width: canvas.width, data, box: findTicketBox(data, canvas.width, canvas.height) };
}

// Variants are tried in order until a read matches the field's strict format.
export const NAME_VARIANTS = [
  { height: 64, maxWidth: 2400, cut: 1, stretch: 1 },
  { height: 64, maxWidth: 2400, cut: 1, stretch: 1.3 },
  { height: 64, maxWidth: 2400, cut: 1.15, stretch: 1.3 },
  { height: 64, maxWidth: 2400, cut: 1.15, stretch: 1.6 },
];
export const STOCK_VARIANTS = [1.15, 1.3, 1, 1.45].map(cut => ({ height: 70, maxWidth: 800, cut }));
export const LOCATION_VARIANTS = [1.15, 1, 1.3, .85, 1.45].map(cut => ({ height: 70, maxWidth: 800, cut }));

// Returns lazy crop renderers for the ticket's name, stock code and aisle-bay
// fields (so only the variants actually needed are drawn), or null if no ticket.
export async function cropGreenShelfTicket(file) {
  const bitmap = await createImageBitmap(file);
  let source;
  try {
    // Work at a sensible size: full 12MP photos make every step slow on a handheld.
    const shrink = Math.min(1, 2200 / Math.max(bitmap.width, bitmap.height));
    source = document.createElement("canvas");
    source.width = Math.round(bitmap.width * shrink); source.height = Math.round(bitmap.height * shrink);
    source.getContext("2d").drawImage(bitmap, 0, 0, source.width, source.height);
  } finally { bitmap.close(); }
  let found = detectOn(source);
  if (!found.box) return null;
  const turns = quarterTurnsToUpright(found.data, found.width, found.box);
  if (turns) { source = rotateQuarterTurns(source, turns); found = detectOn(source); if (!found.box) return null; }
  const { scale, width, data, box } = found, bw = box.right - box.left, bh = box.bottom - box.top;
  if (bw / bh < 1.4) return null;

  // Ticket layout: product name; stock code / date row; barcode number / aisle-bay
  // row; barcode bars. The faint barcode-number row is often too light to count as a
  // band, so it falls back to the gap between the stock row and the barcode bars.
  const { bands, dark } = textBands(data, width, box);
  const name = bands[0]?.y, stockRow = bands[1]?.y;
  const digits = name && stockRow ? digitsBand(data, width, box, stockRow, dark) : null;
  const rows = {
    name: name || [box.top, box.top + bh * .27],
    stock: stockRow || [box.top + bh * .29, box.top + bh * .45],
    digits: digits?.y || [box.top + bh * .47, box.top + bh * .62],
  };
  const margin = Math.max(1, bh * .015);
  const span = ([a, b], trim = 0) => [Math.max(box.top, a - margin + trim), Math.min(box.bottom, b + margin)];
  const edges = (runs, fallback) => runs.length ? [runs[0][0], runs[runs.length - 1][1]] : fallback;

  const nameRuns = textRuns(data, width, box, rows.name[0], rows.name[1], dark, { stopAtPrice: false });
  const [nx0, nx1] = edges(nameRuns, [box.left + bw * .02, box.left + bw * .8]);
  const [ny0, ny1] = span(rows.name);
  const stockFrom = labelStart(data, width, box, rows.stock[0], rows.stock[1]);
  const stockRuns = textRuns(data, width, box, rows.stock[0], rows.stock[1], dark, { from: stockFrom });
  const [sx0, sx1] = stockRuns.length ? stockRuns[0] : [box.left + bw * .02, box.left + bw * .2];
  const [sy0, sy1] = span(rows.stock);
  const [ly0, ly1] = span(rows.digits);
  const digitRuns = textRuns(data, width, box, ly0, ly1, digits?.dark ?? dark * 1.4, { from: digits?.from ?? stockFrom });
  // The aisle-bay pair is the last block of print in the row, after the barcode number and a lone "0".
  const [lx0, lx1] = digitRuns.length ? digitRuns[digitRuns.length - 1] : [box.left + bw * .4, box.left + bw * .55];
  const pad = 3;
  return {
    heading: variant => ocrCrop(source, scale, [nx0 - pad, ny0, nx1 - nx0 + pad * 2, ny1 - ny0], variant),
    stock: variant => ocrCrop(source, scale, [sx0 - pad, sy0, sx1 - sx0 + pad * 2, sy1 - sy0], variant),
    location: variant => ocrCrop(source, scale, [lx0 - pad, ly0, lx1 - lx0 + pad * 2, ly1 - ly0], variant),
    box, turns, bands,
  };
}

const NAME_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 &/.,'%-+()";
const nextTick = () => new Promise(resolve => setTimeout(resolve, 0));

function editDistance(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]; row[0] = i;
    for (let j = 1; j <= b.length; j++) { const keep = row[j]; row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = keep; }
  }
  return row[b.length];
}
const similarity = (a, b) => 1 - editDistance(a, b) / Math.max(a.length, b.length, 1);

// The reader's own confidence is unreliable on this condensed print, so pick the
// read that the other renderings most agree with.
export function consensusName(reads) {
  const usable = reads.filter(r => /[A-Z]{3,}.*[A-Z]{3,}/i.test(r.text) && r.text.length < 160);
  if (!usable.length) return { text: "", agreement: 0, confidence: Math.max(0, ...reads.map(r => r.confidence)) };
  const norm = r => productTextFromOcr(r.text).toUpperCase();
  let best = null;
  for (const r of usable) {
    const agreement = usable.length > 1 ? usable.filter(o => o !== r).reduce((sum, o) => sum + similarity(norm(r), norm(o)), 0) / (usable.length - 1) : 0;
    if (!best || agreement + r.confidence / 400 > best.score) best = { r, agreement, score: agreement + r.confidence / 400 };
  }
  return { text: best.r.text, agreement: best.agreement, confidence: best.r.confidence, canvas: best.r.canvas };
}

// A product-name suggestion worth putting in the form: the reader is fairly sure of
// it, or several renderings agree on it. Anything weaker is left for the user to type.
export function nameSuggestion({ text = "", confidence = 0, agreement = 0 }) {
  if (!text || !(confidence >= 45 || (agreement >= .9 && confidence >= 35))) return "";
  return productTextFromOcr(text);
}

// Reads the three fields, trying crop renderings and voting on the answer. `crops`
// is the result of cropGreenShelfTicket and `worker` a Tesseract worker.
export async function readTicketFields(worker, crops, { shouldStop = () => false } = {}) {
  const result = { name: { text: "", confidence: 0, agreement: 0, canvas: null }, stockCode: "", location: null, locationCanvas: null };
  await worker.setParameters({ tessedit_pageseg_mode: "7", tessedit_char_whitelist: NAME_CHARS });
  const reads = [];
  for (const variant of NAME_VARIANTS) {
    await nextTick(); if (shouldStop()) return result;
    const canvas = crops.heading(variant), { data } = await worker.recognize(canvas);
    reads.push({ text: data.text.trim(), confidence: data.confidence, canvas });
    // A confident first read of clean print needs no second opinion.
    if (reads.length === 1 && data.confidence >= 88) break;
  }
  result.name = consensusName(reads);
  result.name.canvas ||= reads[0]?.canvas;
  await worker.setParameters({ tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-" });
  const votes = new Map();
  for (const variant of STOCK_VARIANTS) {
    await nextTick(); if (shouldStop()) return result;
    const { data } = await worker.recognize(crops.stock(variant)), code = stockCodeFromOcr(data.text, data.confidence);
    // Real codes are six or seven characters; shorter reads are noise, not worth auto-filling.
    if (code.length < 5) continue;
    const vote = votes.get(code) || { count: 0, confidence: 0, strict: /^S?\d{6}$/.test(code) };
    vote.count++; vote.confidence += data.confidence; votes.set(code, vote);
  }
  result.stockCode = [...votes].sort(([, a], [, b]) => (b.strict - a.strict) || (b.count - a.count) || (b.confidence - a.confidence))[0]?.[0] || "";
  await worker.setParameters({ tessedit_char_whitelist: "0123456789-" });
  for (const variant of LOCATION_VARIANTS) {
    await nextTick(); if (shouldStop()) return result;
    const canvas = crops.location(variant), { data } = await worker.recognize(canvas), location = ticketLocationFromOcr(data.text, data.confidence);
    if (!result.locationCanvas) result.locationCanvas = canvas;
    if (location) { result.location = location; result.locationCanvas = canvas; break; }
  }
  return result;
}
