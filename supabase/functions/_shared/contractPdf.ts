import { jsPDF } from "npm:jspdf@4.0.0";

export function foldNorwegian(value: string): string {
  return String(value || "")
    .replace(/æ/g, "ae")
    .replace(/ø/g, "o")
    .replace(/å/g, "a")
    .replace(/Æ/g, "Ae")
    .replace(/Ø/g, "O")
    .replace(/Å/g, "A")
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, "?");
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const size = 0x8000;
  for (let i = 0; i < bytes.length; i += size) {
    binary += String.fromCharCode(...bytes.subarray(i, i + size));
  }
  return btoa(binary);
}

function osloStamp(iso: string | null | undefined): string {
  if (!iso) return "-";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "-";
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

export interface ContractPdfInput {
  id: string;
  body: string;
  templateKey?: string | null;
  templateVersion?: number | string | null;
  contentSha256?: string | null;
  workerName?: string | null;
  orgName?: string | null;
  employeeSignedAt?: string | null;
  employeeSignedBy?: string | null;
  employerSignedAt?: string | null;
  employerSignedBy?: string | null;
  employerSignerName?: string | null;
  employerSignerEmail?: string | null;
  employerName?: string | null;
  events?: {
    event_type?: string;
    actor_id?: string | null;
    actor_role?: string | null;
    ip?: string | null;
    user_agent?: string | null;
    created_at?: string;
  }[];
}

export function buildSnapshotPdf(input: ContractPdfInput): Uint8Array {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const margin = 18;
  const pageW = 210;
  const pageH = 297;
  let y = margin;

  const write = (text: string, size = 10, bold = false, gap = 4) => {
    const safe = foldNorwegian(text);
    doc.setFont("Helvetica", bold ? "bold" : "normal");
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(safe || " ", pageW - margin * 2);
    for (const line of lines) {
      if (y > pageH - 16) {
        doc.addPage();
        y = margin;
      }
      doc.text(line, margin, y);
      y += size * 0.45;
    }
    y += gap;
  };

  write("Arbeidsavtale", 16, true, 6);
  write(`${input.orgName || "Arbeidsgiver"} og ${input.workerName || "Arbeidstaker"}`, 11, true, 3);
  write(`Dokument ${input.id}`, 9, false, 2);
  write(`Mal ${input.templateKey || "-"} versjon ${input.templateVersion ?? "-"}`, 9, false, 2);
  write(`SHA-256 av avtaleteksten: ${input.contentSha256 || "-"}`, 8, false, 6);
  write(input.body || "", 9, false, 8);

  doc.addPage();
  y = margin;
  write("Signeringssertifikat", 16, true, 4);
  write("Norwegian letters are transliterated in this PDF. The authoritative text is the frozen UTF-8 snapshot. The hash above is SHA-256 of that snapshot, not of this PDF file.", 9, false, 6);
  write(`Dokument-id: ${input.id}`, 10, false, 2);
  write(`Mal: ${input.templateKey || "-"} v${input.templateVersion ?? "-"}`, 10, false, 2);
  write(`Innhold SHA-256: ${input.contentSha256 || "-"}`, 9, false, 6);

  write("Signatarer", 13, true, 3);
  write(`Ansatt: ${input.workerName || "-"}`, 10, true, 1);
  write(`Bruker-id: ${input.employeeSignedBy || "-"}`, 9, false, 1);
  write(`Metode: e-postkode (simple_otp). Tid: ${osloStamp(input.employeeSignedAt)}`, 9, false, 4);
  write(`Arbeidsgiver: ${input.orgName || "-"}`, 10, true, 1);
  write(`Signatur: For ${input.orgName || "-"}: ${input.employerName || "-"}`, 10, true, 1);
  write(`Motsignert av: ${input.employerSignerName || "-"}`, 10, true, 1);
  write(`E-post: ${input.employerSignerEmail || "-"}`, 9, false, 1);
  write(`Motsignert av bruker-id: ${input.employerSignedBy || "-"}`, 9, false, 1);
  write(`Metode: e-postkode (simple_otp). Tid: ${osloStamp(input.employerSignedAt)}`, 9, false, 6);

  write("Hendelseslogg", 13, true, 3);
  for (const event of input.events || []) {
    write(
      `${osloStamp(event.created_at)}  ${event.event_type || "-"}  rolle=${event.actor_role || "-"}  aktor=${event.actor_id || "-"}  ip=${event.ip || "-"}`,
      8,
      false,
      1,
    );
    if (event.user_agent) write(`  ${event.user_agent}`, 7, false, 1);
  }

  return new Uint8Array(doc.output("arraybuffer"));
}
