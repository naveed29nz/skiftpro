import test from "node:test";
import assert from "node:assert/strict";
import { fodselsnummerValid, maskFodselsnummer } from "./fodselsnummer.js";

test("fødselsnummer accepts 11 digits with official check digits and masks the list", () => {
  assert.equal(fodselsnummerValid("15059000060"), true);
  assert.equal(fodselsnummerValid("150590 00060"), true);
  assert.equal(fodselsnummerValid("12345678901"), false);
  assert.equal(fodselsnummerValid("1505900006"), false);
  assert.equal(fodselsnummerValid(""), false);
  assert.equal(maskFodselsnummer("15059000060"), "•••••••0060");
  assert.equal(maskFodselsnummer(""), "");
});
