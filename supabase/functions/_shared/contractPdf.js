import { fileURLToPath } from "node:url";

let fontBase64Promise;

function bytesToBase64(bytes) {
  let binary = "";
  const size = 0x8000;
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (let i = 0; i < view.length; i += size) {
    binary += String.fromCharCode(...view.subarray(i, i + size));
  }
  return btoa(binary);
}

async function notoSansBase64() {
  if (!fontBase64Promise) {
    fontBase64Promise = (async () => {
      const url = new URL("./fonts/NotoSans-Regular.ttf", import.meta.url);
      if (typeof Deno !== "undefined" && typeof Deno.readFile === "function") {
        return bytesToBase64(await Deno.readFile(url));
      }
      const { readFileSync } = await import("node:fs");
      return bytesToBase64(readFileSync(fileURLToPath(url)));
    })();
  }
  return fontBase64Promise;
}

async function loadJsPdf() {
  const specifier = typeof Deno === "undefined" ? "jspdf" : "npm:jspdf@4.0.0";
  const mod = await import(specifier);
  return mod.jsPDF;
}

export function osloDate(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Oslo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).formatToParts(date);
  const value = (type) => parts.find((part) => part.type === type)?.value || "";
  return `${value("day")}.${value("month")}.${value("year")}`;
}

function osloStamp(iso) {
  if (!iso) return "–";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "–";
  const oslo = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Oslo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).format(date);
  return `${date.toISOString()} / ${oslo} Europe/Oslo`;
}

async function openPdf() {
  const jsPDF = await loadJsPdf();
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const font = await notoSansBase64();
  doc.addFileToVFS("NotoSans-Regular.ttf", font);
  doc.addFont("NotoSans-Regular.ttf", "NotoSans", "normal");
  doc.setFont("NotoSans", "normal");
  return doc;
}

function writer(doc) {
  const margin = 18;
  const pageW = 210;
  const pageH = 297;
  let y = margin;
  return (text, size = 10, gap = 4) => {
    doc.setFont("NotoSans", "normal");
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(String(text ?? "") || " ", pageW - margin * 2);
    for (const line of lines) {
      if (y > pageH - 16) {
        doc.addPage();
        y = margin;
        doc.setFont("NotoSans", "normal");
        doc.setFontSize(size);
      }
      doc.text(line, margin, y);
      y += size * 0.45;
    }
    y += gap;
  };
}

export function contractSignatureLines({
  workerName,
  employeeSignedAt,
  orgName,
  employerName,
  employerSignedAt,
} = {}) {
  const lines = [];
  const employeeDate = osloDate(employeeSignedAt);
  const employerDate = osloDate(employerSignedAt);
  if (workerName && employeeDate) {
    lines.push(`Signert elektronisk av ${workerName} ${employeeDate}`);
  }
  if (orgName && employerName && employerDate) {
    lines.push(`For ${orgName}: ${employerName}, signert elektronisk ${employerDate}`);
  }
  return lines;
}

export async function buildSnapshotPdf(input) {
  const doc = await openPdf();
  const write = writer(doc);
  write(input.body || "", 10, 8);
  for (const line of contractSignatureLines(input)) write(line, 11, 2);
  return new Uint8Array(doc.output("arraybuffer"));
}

export async function buildSigningProofPdf(input) {
  const doc = await openPdf();
  const write = writer(doc);
  write("Signeringsbevis", 16, 4);
  write(`Dokument-id: ${input.id || "–"}`, 10, 2);
  write(`Mal: ${input.templateKey || "–"} v${input.templateVersion ?? "–"}`, 10, 2);
  write(`SHA-256 av avtaleteksten: ${input.contentSha256 || "–"}`, 9, 2);
  write(`SHA-256 av PDF-filen: ${input.pdfSha256 || "–"}`, 9, 6);
  write("Signatarer", 13, 3);
  write(`Ansatt: ${input.workerName || "–"}`, 10, 1);
  write(`Bruker-id: ${input.employeeSignedBy || "–"}`, 9, 1);
  write(`Tid: ${osloStamp(input.employeeSignedAt)}`, 9, 4);
  write(`Arbeidsgiver: ${input.orgName || "–"}`, 10, 1);
  write(`For ${input.orgName || "–"}: ${input.employerName || "–"}`, 10, 1);
  write(`Admin som motsignet: ${input.employerSignerName || "–"}`, 10, 1);
  write(`E-post: ${input.employerSignerEmail || "–"}`, 9, 1);
  write(`Bruker-id: ${input.employerSignedBy || "–"}`, 9, 1);
  write(`Tid: ${osloStamp(input.employerSignedAt)}`, 9, 6);
  write("Hendelseslogg", 13, 3);
  for (const event of input.events || []) {
    write(
      `${osloStamp(event.created_at)}  ${event.event_type || "–"}  rolle=${event.actor_role || "–"}  aktør=${event.actor_id || "–"}  ip=${event.ip || "–"}`,
      8,
      1,
    );
    if (event.user_agent) write(`  ${event.user_agent}`, 7, 1);
  }
  return new Uint8Array(doc.output("arraybuffer"));
}

export async function sha256Hex(bytes) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export { bytesToBase64 };
