/** Players give the last 6 digits of their payment reference. Kept as text so leading zeros survive. */
export const PAYMENT_REF_ERROR = "Enter the last 6 digits of your reference number";

export const isPaymentRef = (value: string) => /^\d{6}$/.test(value);

const digitsOf = (value: string) => value.replace(/\D/g, "");

export const typedPaymentRef = (value: string) => digitsOf(value).slice(0, 6);

/** A paste is usually the whole reference, so this keeps its end rather than its start. */
export const pastedPaymentRef = (value: string) => digitsOf(value).slice(-6);
