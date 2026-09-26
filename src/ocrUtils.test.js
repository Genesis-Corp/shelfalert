import { productTextFromOcr, stockCodeFromOcr, ticketLocationFromOcr, encodeGapNotes, decodeGapNotes } from "./ocrUtils";

test("suggests the product and size while skipping shelf price labels", () => {
  expect(productTextFromOcr("SPECIAL\n$4.50\nBirds Eye Chicken Nuggets\n400g\nSAVE $1.00"))
    .toBe("Birds Eye Chicken Nuggets 400g");
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
  expect(stockCodeFromOcr("S346039", 42)).toBe("");
});

test("saves a stock code while keeping ordinary gap notes readable", () => {
  expect(decodeGapNotes(encodeGapNotes("S346039", "Check back stock"))).toEqual({stockCode: "S346039", notes: "Check back stock"});
  expect(decodeGapNotes("Check back stock")).toEqual({stockCode: "", notes: "Check back stock"});
});

test("reads aisle and bay from the short code below the print date", () => {
  expect(ticketLocationFromOcr("03-33", 95)).toEqual({ aisle: "3", bay: "33" });
  expect(ticketLocationFromOcr("25/05/26", 99)).toBeNull();
  expect(ticketLocationFromOcr("03-38", 50)).toBeNull();
  expect(ticketLocationFromOcr("00-33", 95)).toBeNull();
});
