import { describe, expect, it } from "vitest";
import { isPaymentRef, pastedPaymentRef, typedPaymentRef } from "./payment-ref";

describe("isPaymentRef", () => {
  it.each(["123456", "000000", "012345"])("accepts %s", (value) => {
    expect(isPaymentRef(value)).toBe(true);
  });

  it.each(["", "12345", "1234567", "12345a", "abcdef", "123 56", " 123456", "123456\n", "12.456", "-12345", "１２３４５６"])(
    "rejects %j",
    (value) => {
      expect(isPaymentRef(value)).toBe(false);
    },
  );
});

describe("typedPaymentRef", () => {
  it("drops anything that isn't a digit", () => {
    expect(typedPaymentRef("1a2b3c")).toBe("123");
    expect(typedPaymentRef("abc")).toBe("");
  });

  it("stops at 6 digits", () => {
    expect(typedPaymentRef("1234567")).toBe("123456");
  });

  it("keeps leading zeros", () => {
    expect(typedPaymentRef("012345")).toBe("012345");
  });
});

describe("pastedPaymentRef", () => {
  it("keeps the last 6 digits of a full reference", () => {
    expect(pastedPaymentRef("1234 567 890123")).toBe("890123");
    expect(pastedPaymentRef("Ref No. 0031-5592-7781")).toBe("927781");
  });

  it("leaves a shorter paste as it is", () => {
    expect(pastedPaymentRef("123")).toBe("123");
  });
});
