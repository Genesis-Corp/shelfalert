import { productTextFromOcr } from "./ocrUtils";

test("suggests the product and size while skipping shelf price labels", () => {
  expect(productTextFromOcr("SPECIAL\n$4.50\nBirds Eye Chicken Nuggets\n400g\nSAVE $1.00"))
    .toBe("Birds Eye Chicken Nuggets 400g");
});

test("returns no suggestion when the image has only a price and aisle marker", () => {
  expect(productTextFromOcr("$3.50\nAisle 4 Bay 2")).toBe("");
});
