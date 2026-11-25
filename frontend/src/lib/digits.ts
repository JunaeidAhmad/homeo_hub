/** Bangla digits (০-৯) as ASCII digits, so numbers typed on a Bangla keyboard work. */
export function toAsciiDigits(text: string): string {
  return text.replace(/[০-৯]/g, (digit) => String(digit.charCodeAt(0) - 0x09e6));
}
