const WEIGHTS_1 = [3, 7, 6, 1, 8, 9, 4, 5, 2];
const WEIGHTS_2 = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];

export function fodselsnummerDigits(value) {
  return String(value || "").replace(/\s+/g, "");
}

function checkDigit(digits, weights) {
  const sum = weights.reduce((total, weight, index) => total + weight * Number(digits[index]), 0);
  const rest = 11 - (sum % 11);
  if (rest === 11) return 0;
  if (rest === 10) return null;
  return rest;
}

export function fodselsnummerValid(value) {
  const digits = fodselsnummerDigits(value);
  if (!/^\d{11}$/.test(digits)) return false;
  const first = checkDigit(digits, WEIGHTS_1);
  const second = checkDigit(digits, WEIGHTS_2);
  if (first == null || second == null) return false;
  return digits[9] === String(first) && digits[10] === String(second);
}

export function maskFodselsnummer(value) {
  const digits = fodselsnummerDigits(value);
  if (!digits) return "";
  const tail = digits.slice(-4);
  return `${"•".repeat(Math.max(digits.length - 4, 0))}${tail}`;
}
