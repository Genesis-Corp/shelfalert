// Choose a short product label from browser OCR output. Shelf labels often
// include prices and promotional text before the product name.
export function productTextFromOcr(text) {
  const lines = text.split(/\r?\n/).map(line => line.replace(/\s+/g, " ").trim()).filter(Boolean);
  const productLines = lines.filter(line => /[a-z]{2,}/i.test(line) && !/^(?:\$?\d+[.,\d]*|barcode|price|special|save|was|now|each|unit price|aisle|bay|sku|ean|gtin)\b/i.test(line));
  const name = productLines.find(line => /[a-z]{3,}/i.test(line)) || "";
  const size = text.match(/\b\d+(?:[.,]\d+)?\s?(?:kg|g|mg|ml|l|litres?|pack|pk)\b/i)?.[0];
  return [name, size && !name.toLowerCase().includes(size.toLowerCase()) ? size : ""].filter(Boolean).join(" ").slice(0, 120);
}

// Green shelf tickets are often a tiny fraction of a portrait photo. Locate
// their dense green rows and columns before reading the product-name strip.
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
    const rows = new Uint32Array(canvas.height);
    const cols = new Uint32Array(canvas.width);
    for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
      const i = (y * canvas.width + x) * 4;
      const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
      if (g > 65 && g > r * 1.13 && g > b * 1.35 && r > 35) { rows[y]++; cols[x]++; }
    }
    const span = (counts, threshold) => {
      let start = -1, best = [0, 0];
      for (let i = 0; i <= counts.length; i++) {
        if (i < counts.length && counts[i] >= threshold) { if (start < 0) start = i; }
        else if (start >= 0) { if (i - start > best[1] - best[0]) best = [start, i]; start = -1; }
      }
      return best;
    };
    const [top, bottom] = span(rows, canvas.width * .10);
    const [left, right] = span(cols, (bottom - top) * .07);
    if (bottom - top < 28 || right - left < 100 || (right - left) / (bottom - top) < 1.5) return null;
    const heading = document.createElement("canvas");
    const sourceX = left + (right - left) * .035, sourceY = top + (bottom - top) * .045;
    const sourceWidth = (right - left) * .77, sourceHeight = (bottom - top) * .42;
    heading.width = Math.min(2400, Math.round(sourceWidth * 4));
    heading.height = Math.round(heading.width * sourceHeight / sourceWidth);
    heading.getContext("2d").drawImage(canvas, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, heading.width, heading.height);
    return heading;
  } finally { bitmap.close(); }
}
