import test from "node:test";
import assert from "node:assert/strict";
import { inflateSync } from "node:zlib";
import { buildSnapshotPdf, contractSignatureLines, osloDate } from "../../supabase/functions/_shared/contractPdf.js";

function pdfText(bytes) {
  const raw = Buffer.from(bytes).toString("latin1");
  const map = new Map();
  for (const block of raw.match(/beginbfchar[\s\S]*?endbfchar/g) || []) {
    for (const pair of block.matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
      map.set(pair[1].toUpperCase(), pair[2].toUpperCase());
    }
  }
  const width = [...map.keys()][0]?.length || 4;
  let text = "";
  const source = Buffer.from(bytes);
  const marker = Buffer.from("stream");
  let cursor = 0;
  while (cursor < source.length) {
    const start = source.indexOf(marker, cursor);
    if (start < 0) break;
    let dataStart = start + marker.length;
    if (source[dataStart] === 0x0d) dataStart += 1;
    if (source[dataStart] === 0x0a) dataStart += 1;
    const end = source.indexOf(Buffer.from("endstream"), dataStart);
    if (end < 0) break;
    let stream = source.subarray(dataStart, end);
    try { stream = inflateSync(stream); } catch { /* already plain */ }
    const content = stream.toString("latin1");
    for (const hex of content.matchAll(/<([0-9A-Fa-f]+)>/g)) {
      const value = hex[1].toUpperCase();
      if (value.length % width !== 0) continue;
      for (let i = 0; i < value.length; i += width) {
        const unicode = map.get(value.slice(i, i + width));
        if (unicode) text += String.fromCodePoint(Number.parseInt(unicode, 16));
      }
    }
    cursor = end + 9;
  }
  return text;
}

test("the contract PDF renders Norwegian letters, section sign, and dashes", async () => {
  const sample = "æøå ÆØÅ § – —";
  const bytes = await buildSnapshotPdf({
    body: `arbeidsmiljøloven ${sample} Man–fre`,
    workerName: "TEST Naveed Zafar",
    employeeSignedAt: "2026-10-16T22:20:06.311Z",
    orgName: "Butikkdrift Nas AS",
    employerName: "Naveed Zafar",
    employerSignedAt: "2026-10-16T22:24:37.092Z",
  });
  const text = pdfText(bytes);
  assert.match(text, /æøå ÆØÅ § – —/);
  assert.match(text, /arbeidsmiljøloven/);
  assert.equal(text.includes("Signeringssertifikat"), false);
  assert.equal(text.includes("Hendelseslogg"), false);
  assert.match(text, /Signert elektronisk av TEST Naveed Zafar 17\.10\.2026/);
  assert.match(text, /For Butikkdrift Nas AS: Naveed Zafar, signert elektronisk 17\.10\.2026/);
});

test("signature lines stay off the contract until that party has signed", () => {
  assert.deepEqual(contractSignatureLines({
    workerName: "Kari",
    orgName: "Butikkdrift Nas AS",
    employerName: "Naveed Zafar",
  }), []);
  assert.equal(osloDate("2026-10-16T22:20:06.311Z"), "17.10.2026");
});
