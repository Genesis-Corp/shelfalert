const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const output = path.join(root, "public", "ocr");
const copies = [
  ["tesseract.js/dist/worker.min.js", "worker.min.js"],
  ["@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz", "lang/eng.traineddata.gz"],
  ...["lstm", "simd-lstm", "relaxedsimd-lstm"].flatMap(variant => [
    [`tesseract.js-core/tesseract-core-${variant}.wasm.js`, `core/tesseract-core-${variant}.wasm.js`],
    [`tesseract.js-core/tesseract-core-${variant}.wasm`, `core/tesseract-core-${variant}.wasm`],
  ]),
];

for (const [source, destination] of copies) {
  const from = path.join(root, "node_modules", source);
  const to = path.join(output, destination);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}

console.log("Local OCR assets prepared.");
