import { productTextFromOcr, stockCodeFromOcr, ticketLocationFromOcr, encodeGapNotes, decodeGapNotes, nameSuggestion, isTicketGreen } from "./ocrUtils";

test("suggests the product and size while skipping shelf price labels", () => {
  expect(productTextFromOcr("SPECIAL\n$4.50\nBirds Eye Chicken Nuggets\n400g\nSAVE $1.00"))
    .toBe("Birds Eye Chicken Nuggets 400g");
});

test("reads a round gram size whose G was mistaken for a 6", () => {
  expect(productTextFromOcr("HUY FONG SRIRACHA SAUCE 2556")).toBe("HUY FONG SRIRACHA SAUCE 255G");
  expect(productTextFromOcr("FRISKIES ADULT SEVEN 700GM")).toBe("FRISKIES ADULT SEVEN 700GM");
});

test("returns no suggestion when the image has only a price and aisle marker", () => {
  expect(productTextFromOcr("$3.50\nAisle 4 Bay 2")).toBe("");
});

test("keeps the shelf-ticket wording and corrects the litre size read as letters", () => {
  expect(productTextFromOcr("C/BELLA CCNUT WTR COFFEE IL")).toBe("C/BELLA CCNUT WTR COFFEE 1L");
});

test("accepts a short stock code regardless of its first character and excludes barcodes", () => {
  expect(stockCodeFromOcr("S346039 |", 87)).toBe("S346039");
  expect(stockCodeFromOcr("A73421", 87)).toBe("A73421");
  expect(stockCodeFromOcr("734210", 87)).toBe("734210");
  expect(stockCodeFromOcr("9336243005320", 99)).toBe("");
  expect(stockCodeFromOcr("S346039", 30)).toBe("");
  expect(stockCodeFromOcr("571467", 59)).toBe("571467");
  expect(stockCodeFromOcr("8334469", 44)).toBe("S334469");
});

test("saves a stock code while keeping ordinary gap notes readable", () => {
  expect(decodeGapNotes(encodeGapNotes("S346039", "Check back stock"))).toEqual({stockCode: "S346039", notes: "Check back stock"});
  expect(decodeGapNotes("Check back stock")).toEqual({stockCode: "", notes: "Check back stock"});
});

test("reads aisle and bay from the short code below the print date", () => {
  expect(ticketLocationFromOcr("03-33", 95)).toEqual({ aisle: "3", bay: "33" });
  expect(ticketLocationFromOcr("25/05/26", 99)).toBeNull();
  expect(ticketLocationFromOcr("03-38", 30)).toBeNull();
  expect(ticketLocationFromOcr("0 07-24", 90)).toEqual({ aisle: "7", bay: "24" });
  expect(ticketLocationFromOcr("00-33", 95)).toBeNull();
});

test("recognises both bright green and minty teal ticket colours but not other colours", () => {
  expect(isTicketGreen(100, 200, 80)).toBe(true);
  expect(isTicketGreen(80, 200, 150)).toBe(true);
  expect(isTicketGreen(200, 60, 50)).toBe(false);
  expect(isTicketGreen(230, 230, 230)).toBe(false);
  expect(isTicketGreen(60, 90, 200)).toBe(false);
});

test("cleans ticket abbreviations and size misreads in the product suggestion", () => {
  expect(productTextFromOcr("-S'MARE TUNA IN OIL 956")).toBe("S/MARE TUNA IN OIL 95G");
  expect(productTextFromOcr("TMG SAUERKRAUT IKG")).toBe("TMG SAUERKRAUT 1KG");
});

test("only suggests a product name when the read is trustworthy", () => {
  expect(nameSuggestion({ text: "TMG SAUERKRAUT 1KG", confidence: 60, agreement: .91 })).toBe("TMG SAUERKRAUT 1KG");
  expect(nameSuggestion({ text: "FRIDRIEY ABUL OLVEN TUULM", confidence: 34, agreement: .79 })).toBe("");
  expect(nameSuggestion({ text: "", confidence: 90, agreement: 1 })).toBe("");
});
