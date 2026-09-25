// Choose a short product label from browser OCR output. Shelf labels often
// include prices and promotional text before the product name.
export function productTextFromOcr(text) {
  const lines = text.split(/\r?\n/).map(line => line.replace(/\s+/g, " ").trim()).filter(Boolean);
  const productLines = lines.filter(line => /[a-z]{2,}/i.test(line) && !/^(?:\$?\d+[.,\d]*|barcode|price|special|save|was|now|each|unit price|aisle|bay|sku|ean|gtin)\b/i.test(line));
  const name = productLines.find(line => /[a-z]{3,}/i.test(line)) || "";
  const size = text.match(/\b\d+(?:[.,]\d+)?\s?(?:kg|g|mg|ml|l|litres?|pack|pk)\b/i)?.[0];
  return [name, size && !name.toLowerCase().includes(size.toLowerCase()) ? size : ""].filter(Boolean).join(" ").slice(0, 120);
}
