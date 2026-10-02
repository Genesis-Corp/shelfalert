// Choose a short product label from browser OCR output. Shelf labels often
// include prices and promotional text before the product name.
export function productTextFromOcr(text) {
  const lines = text.split(/\r?\n/).map(line => line.replace(/\s+/g, " ").trim()).filter(Boolean);
  const productLines = lines.filter(line => /[a-z]{2,}/i.test(line) && !/^(?:\$?\d+[.,\d]*|barcode|price|special|save|was|now|each|unit price|aisle|bay|sku|ean|gtin)\b/i.test(line));
  const name = (productLines.find(line => /[a-z]{3,}/i.test(line)) || "").replace(/\bIL\b$/i, "1L")
    // A trailing "G" on a round gram size (255G, 500G) is often read as a 6.
    .replace(/\b(\d{2,3}[05])6$/, "$1G");
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
  if (confidence < 70) return null;
  const match = text.trim().match(/^(\d{1,2})\s*[-–]\s*(\d{1,2})$/);
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

// Green shelf tickets are often a tiny fraction of a portrait photo, and other
// green things (packaging, produce) share the frame. Pick the ticket by shape:
// a wide, mostly-filled green block, then locate its text rows from the pixels.
const isTicketGreen = (r, g, b) => g > 65 && g > r * 1.13 && g > b * 1.35 && r > 35;

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
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1, aspect = bw / bh, fill = area / (bw * bh);
    if (bw * cell < 100 || bh * cell < 28 || aspect < 1.6 || aspect > 8 || fill < .4) continue;
    if (!best || area * fill > best.score) best = { score: area * fill, left: x0 * cell, top: y0 * cell, right: (x1 + 1) * cell, bottom: (y1 + 1) * cell };
  }
  return best && { left: best.left, top: best.top, right: best.right, bottom: best.bottom };
}

// Rows of dark print inside the ticket's left (white/green) area, top to bottom.
export function textBands(data, width, box) {
  const x0 = Math.round(box.left + (box.right - box.left) * .03), x1 = Math.round(box.left + (box.right - box.left) * .52);
  const lum = [];
  for (let y = box.top; y < box.bottom; y++) {
    let sum = 0;
    for (let x = x0; x < x1; x++) { const i = (y * width + x) * 4; sum += .299 * data[i] + .587 * data[i + 1] + .114 * data[i + 2]; }
    lum.push(sum / (x1 - x0));
  }
  const sorted = [...lum].sort((a, b) => a - b), median = sorted[sorted.length >> 1];
  const dark = Math.min(115, median * .6);
  const counts = [];
  for (let y = box.top; y < box.bottom; y++) {
    let n = 0;
    for (let x = x0; x < x1; x++) { const i = (y * width + x) * 4; if (.299 * data[i] + .587 * data[i + 1] + .114 * data[i + 2] < dark) n++; }
    counts.push(n);
  }
  const minCount = Math.max(2, (x1 - x0) * .05), bands = [];
  for (let i = 0; i < counts.length; i++) {
    if (counts[i] < minCount) continue;
    const last = bands[bands.length - 1];
    if (last && i - last[1] <= 2) last[1] = i; else bands.push([i, i]);
  }
  const minHeight = (box.bottom - box.top) * .07;
  return bands.filter(([a, b]) => b - a + 1 >= minHeight).map(([a, b]) => [box.top + a, box.top + b + 1]);
}

// Draw a region from the full-resolution photo, scale it to a height Tesseract
// reads well, and turn it into black print on white (Otsu threshold) with a margin.
function ocrCrop(bitmap, scale, x, y, w, h, targetHeight, maxWidth, { cut = 1, gray = false } = {}) {
  const factor = Math.min(targetHeight / h, maxWidth / w);
  const pad = 16, cw = Math.max(1, Math.round(w * factor)), chh = Math.max(1, Math.round(h * factor));
  const canvas = document.createElement("canvas");
  canvas.width = cw + pad * 2; canvas.height = chh + pad * 2;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, x / scale, y / scale, w / scale, h / scale, pad, pad, cw, chh);
  const img = ctx.getImageData(pad, pad, cw, chh), hist = new Uint32Array(256);
  const grey = new Uint8Array(cw * chh);
  for (let i = 0; i < grey.length; i++) { grey[i] = .299 * img.data[i * 4] + .587 * img.data[i * 4 + 1] + .114 * img.data[i * 4 + 2]; hist[grey[i]]++; }
  let total = grey.length, sumAll = 0; for (let t = 0; t < 256; t++) sumAll += t * hist[t];
  let wB = 0, sumB = 0, bestVar = -1, threshold = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t]; if (!wB) continue; const wF = total - wB; if (!wF) break;
    sumB += t * hist[t]; const mB = sumB / wB, mF = (sumAll - sumB) / wF, v = wB * wF * (mB - mF) ** 2;
    if (v > bestVar) { bestVar = v; threshold = t; }
  }
  threshold *= cut;
  // Drop dark ticket borders / price-block edges touching the left or right side.
  const darkColumn = x => { let n = 0; for (let y = 0; y < chh; y++) if (grey[y * cw + x] <= threshold) n++; return n > chh * .6; };
  const clearColumn = x => { for (let y = 0; y < chh; y++) grey[y * cw + x] = 255; };
  for (let x = 0; x < cw * .15 && darkColumn(x); x++) clearColumn(x);
  for (let x = cw - 1; x > cw * .75 && darkColumn(x); x--) clearColumn(x);
  if (gray) {
    let lo = 255, hi = 0; for (const v of grey) { if (v < lo) lo = v; if (v > hi) hi = v; }
    for (let i = 0; i < grey.length; i++) { const v = hi > lo ? (grey[i] - lo) * 255 / (hi - lo) : 255; img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255; }
    ctx.putImageData(img, pad, pad);
    return canvas;
  }
  for (let i = 0; i < grey.length; i++) { const v = grey[i] > threshold ? 255 : 0; img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255; }
  ctx.putImageData(img, pad, pad);
  return canvas;
}

export async function cropGreenShelfTicket(file) {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 900 / bitmap.width);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const box = findTicketBox(data, canvas.width, canvas.height);
    if (!box) return null;
    const bw = box.right - box.left, bh = box.bottom - box.top;
    // Ticket layout: product name, then stock code / date row, then barcode
    // number / aisle-bay row. Use the detected text rows, falling back to the
    // usual proportions if the print is too faint to find them.
    const bands = textBands(data, canvas.width, box);
    // The faint barcode-number row is often too light to count as a band, so
    // when only heading, stock row and barcode bars are found it is the gap.
    const [name, stockRow, locationRow] = bands.length >= 4 ? bands
      : bands.length === 3 ? [bands[0], bands[1], [bands[1][1], bands[2][0]]]
      : [[box.top, box.top + bh * .27], [box.top + bh * .29, box.top + bh * .45], [box.top + bh * .47, box.top + bh * .62]];
    const margin = bh * .02;
    const row = ([a, b]) => [Math.max(box.top, a - margin), Math.min(box.bottom, b + margin)];
    const [ny0, ny1] = row(name), [sy0, sy1] = row(stockRow);
    // Tickets are often photographed slightly tilted, so keep clear of the date row above.
    const ly0 = locationRow[0] + (locationRow[1] - locationRow[0]) * .15, ly1 = Math.min(box.bottom, locationRow[1] + margin);
    const headingBox = [box.left + bw * .005, ny0, bw * .85, ny1 - ny0, 90, 2400];
    const heading = ocrCrop(bitmap, scale, ...headingBox);
    // Alternative renderings for clipped or smudged print; the caller keeps the best read.
    const headingAlternates = [[48, .8], [64, .7]].map(([height, cut]) =>
      ocrCrop(bitmap, scale, headingBox[0], headingBox[1], headingBox[2], headingBox[3], height, 2400, { cut }));
    const stock = ocrCrop(bitmap, scale, box.left + bw * .005, sy0 + (sy1 - sy0) * .08, bw * .21, (sy1 - sy0) * .92, 70, 1200, { cut: .75 });
    // The aisle-bay pair follows the barcode number and a lone "0".
    const location = ocrCrop(bitmap, scale, box.left + bw * .385, ly0, bw * .15, ly1 - ly0, 70, 1200, { cut: .8 });
    return { heading, headingAlternates, stock, location, box, bands };
  } finally { bitmap.close(); }
}
