import { jsPDF } from "npm:jspdf@4.0.0";
import { adminClient, corsHeaders, handleOptions, json, requireUser } from "../_shared/auth.ts";
import { buildSnapshotPdf } from "../_shared/contractPdf.ts";

// Port of base44/functions/generateContractPDF.
// The caller must be allowed to read the contract (worker on the contract,
// a manager of its organization, or a super-admin). RLS enforces that.

Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const auth = await requireUser(req);
    if (auth instanceof Response) return auth;

    const body = await req.json().catch(() => ({}));
    const contractId = body.contract_id;
    if (!contractId) return json({ error: "Missing contract_id" }, 400);

    const sealed = await loadSealedPdf(auth.client, contractId);
    if (sealed instanceof Response) return sealed;
    if (sealed) {
      return new Response(sealed, {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="arbeidsavtale-${contractId}.pdf"`,
        },
      });
    }

    const loaded = await loadContract(auth.client, contractId);
    if (loaded instanceof Response) return loaded;
    const contract = loaded;

    let orgName = contract.org_name || "Arbeidsgiver";
    if (contract.org_id) {
      const { data: orgs } = await auth.client
        .from("organizations")
        .select("name")
        .eq("id", contract.org_id)
        .limit(1);
      if (orgs?.[0]?.name) orgName = orgs[0].name;
    }

    const bytes = buildContractPdf(contract, orgName);
    const filename = `kontrakt-${safeFile(contract.worker_name)}-${contract.start_date || "dato"}.pdf`;
    return new Response(bytes, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});

const CONTRACT_WITHOUT_RATE = "id, org_id, worker_id, worker_name, contract_type, status, org_name, worker_position, employment_percentage, weekly_hours, overtime_hours, full_time_hours_per_week, start_date, end_date, week_number, year, reason, notice_period_months, approved_by_worker_id, approved_at, generated_automatically, created_date, updated_date, created_by, template_key, template_version, contract_kind, content_sha256, pdf_sha256, employee_signed_at, employer_signed_at, signing_provider";

function isMissingRpc(error: { code?: string; message?: string } | null): boolean {
  const message = error?.message || "";
  return error?.code === "PGRST202" || /schema cache/i.test(message) || /could not find the function/i.test(message);
}

async function loadSealedPdf(client: any, contractId: string): Promise<Uint8Array | Response | null> {
  const doc = await client.rpc("contract_document", { p_id: contractId });
  if (isMissingRpc(doc.error)) return null;
  if (doc.error) return json({ error: doc.error.message }, 500);
  if (!doc.data) {
    const row = await client.from("contracts").select("id").eq("id", contractId).maybeSingle();
    if (row.error) return json({ error: row.error.message }, 500);
    if (!row.data) return json({ error: "Contract not found" }, 404);
    return json({ error: "Du har ikke tilgang til avtaleteksten" }, 403);
  }
  if (doc.data.pdf_path) {
    const file = await adminClient().storage.from("contracts").download(doc.data.pdf_path);
    if (!file.error && file.data) return new Uint8Array(await file.data.arrayBuffer());
  }
  if (!doc.data.body_snapshot) return null;
  const events = await client
    .from("contract_events")
    .select("event_type, actor_id, actor_role, ip, user_agent, created_at")
    .eq("contract_id", contractId)
    .order("created_at", { ascending: true });
  return buildSnapshotPdf({
    id: contractId,
    body: doc.data.body_snapshot,
    templateKey: doc.data.template_key,
    templateVersion: doc.data.template_version,
    contentSha256: doc.data.content_sha256,
    workerName: doc.data.field_values?.navn || doc.data.field_values?.ansatt_navn,
    orgName: doc.data.field_values?.selskap,
    employerName: doc.data.field_values?.signatur_navn,
    employeeSignedAt: null,
    employerSignedAt: null,
    events: events.data || [],
  });
}

// select * works until the wage migration is applied. After it, hourly_rate is
// revoked and comes back only for the caller's own contract (my_wage_info) or
// for an admin (contract_hourly_rates).
async function loadContract(client: any, contractId: string): Promise<Record<string, unknown> | Response> {
  const full = await client.from("contracts").select("*").eq("id", contractId).limit(1);
  if (!full.error) {
    if (!full.data?.length) return json({ error: "Contract not found" }, 404);
    return full.data[0];
  }
  const message = full.error.message || "";
  const denied = full.error.code === "42501" || /permission denied for column/i.test(message);
  if (!denied) return json({ error: message }, 500);

  const safe = await client.from("contracts").select(CONTRACT_WITHOUT_RATE).eq("id", contractId).limit(1);
  if (safe.error) return json({ error: safe.error.message }, 500);
  if (!safe.data?.length) return json({ error: "Contract not found" }, 404);
  const contract = safe.data[0];

  const own = await client.rpc("my_wage_info");
  const mine = (own.data || []).find((row: { kind?: string; id?: string; hourly_rate?: number }) => row.kind === "contract" && row.id === contractId);
  if (mine && mine.hourly_rate != null) {
    contract.hourly_rate = mine.hourly_rate;
    return contract;
  }
  const rates = await client.rpc("contract_hourly_rates");
  const rate = (rates.data || []).find((row: { id?: string; hourly_rate?: number }) => row.id === contractId);
  if (rate && rate.hourly_rate != null) contract.hourly_rate = rate.hourly_rate;
  return contract;
}

function safeFile(value: string | null | undefined): string {
  return String(value || "ansatt").replace(/[^\w.\-]+/g, "_");
}

function buildContractPdf(c: Record<string, unknown>, orgName: string): Uint8Array {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const margin = 25;
  const pageW = 210;
  const pageH = 297;
  let y = margin;

  function addText(text: string, size: number, bold: boolean, extraGap?: number) {
    if (y > pageH - 30) {
      doc.addPage();
      y = margin;
    }
    doc.setFont("Helvetica", bold ? "bold" : "normal");
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(text, pageW - margin * 2);
    doc.text(lines, margin, y);
    y += lines.length * (size * 0.4) + (extraGap ?? 2);
  }

  function addLine(yPos: number) {
    doc.setDrawColor(200);
    doc.line(margin, yPos, pageW - margin, yPos);
  }

  doc.setFontSize(16);
  doc.setFont("Helvetica", "bold");
  doc.text("Rammeavtale for tilkallingsvikar", margin, y);
  y += 12;

  addText("mellom", 11, false, 3);
  doc.setFont("Helvetica", "bold");
  doc.setFontSize(11);
  doc.text(orgName, margin, y);
  y += 5;
  doc.setFont("Helvetica", "normal");
  doc.text("(Arbeidsgiveren)", margin, y);
  y += 8;
  addText("og", 11, false, 3);
  doc.setFont("Helvetica", "bold");
  doc.setFontSize(11);
  doc.text(String(c.worker_name || "Arbeidstaker"), margin, y);
  y += 5;
  doc.setFont("Helvetica", "normal");
  doc.text("(Arbeidstakeren)", margin, y);
  y += 8;
  addText("(heretter omtalt som Ansettelsesavtalen)", 10, false, 4);

  y += 2;
  addLine(y);
  y += 3;
  addText("1. Arbeidsforhold", 13, true, 4);
  addText("Arbeidstaker kan tilkalles etter behov, og har full anledning til a takke nei til tilbudt arbeid. Fra og med det tidspunkt Arbeidstaker eventuelt aksepterer tilbudet og frem til det avtalte oppdraget er avsluttet, regulerer denne Arbeidsavtalen arbeidsforholdet mellom Partene.", 10, false, 3);
  addText("De vilkar og betingelser som gjelder i arbeidsforholdet er inntatt i denne Arbeidsavtalen og i Vedlegg 1. I Vedlegg 1 har Arbeidsgiveren inkludert lovpalagt informasjon som gjelder ved oppstart av arbeidsforholdet.", 10, false, 3);
  addText("Arbeidstakeren plikter, sa langt det er av betydning for arbeidsforholdet, a holde seg oppdatert pa og folge de til enhver tid gjeldende regler for Arbeidsgiveren, enten disse folger lover, forskrifter, interne retningslinjer og policyer eller instrukser mv. gitt av Arbeidsgiveren.", 10, false, 4);

  addLine(y);
  y += 3;
  addText("2. Stilling", 13, true, 4);
  addText("Arbeidstakeren er ansatt som selger, som for tiden innebaerer salg og kundeservice, renhold, varepafylling, tilberedning av mat og matsikkerhet.", 10, false, 4);

  addLine(y);
  y += 3;
  addText("3. Arbeidstid", 13, true, 4);
  addText("Arbeidsforholdet tiltres ved hvert avtalte oppdrag/tilkallingens begynnelse, og avsluttes uten forutgaende oppsigelse og uten oppsigelsesfrist etter endt tilkalling.", 10, false, 3);
  addText(`Den alminnelige arbeidstiden hos Arbeidsgiveren er ${c.full_time_hours_per_week || 37.5} timer per uke. Arbeidstiden plasseres i tidsrommet mellom kl 06:00 og kl 23:00. Daglig / ukentlig arbeidstid fastsettes for hvert enkelt oppdrag.`, 10, false, 3);
  addText("Arbeidstaker har rett pa pauser etter arbeidsmiljoloven § 10-9.", 10, false, 2);
  addText("Arbeidsgiver kan palegge arbeidstaker arbeid utover avtalt arbeidstid etter arbeidsmiljoloven § 10-6.", 10, false, 2);
  if (Number(c.overtime_hours) > 0) {
    addText("For overtidsarbeid utbetales overtidstillegg med minst 40 prosent i henhold til arbeidsmiljoloven § 10-6.", 10, false, 3);
  }
  addText("Arbeidstaker har bare rett til kompensasjon for overtidsarbeid som er palagt eller godkjent av naermeste overordnede. Ved merarbeid utbetales ikke overtidstillegg.", 10, false, 4);

  addLine(y);
  y += 3;
  addText("4. Arbeidssted", 13, true, 4);
  addText(`Arbeidssted er for tiden hovedsakelig ved ${orgName}. Arbeidsgiveren kan endre arbeidsstedet.`, 10, false, 4);

  addLine(y);
  y += 3;
  addText("5. Lonn", 13, true, 4);
  if (c.hourly_rate != null) {
    addText(`Ved tiltredelse er Arbeidstakerens ordinaere timelonn NOK ${Number(c.hourly_rate).toFixed(2)}.`, 10, false, 2);
  }
  addText("Arbeidstakeren skal kontrollere at alle utbetalinger fra Arbeidsgiveren er riktige og skal umiddelbart informere Arbeidsgiver om eventuelle feil. Partene er enige om at feil skal rettes opp og Arbeidstaker har ikke rett til a beholde belop mottatt som folge av feilutbetaling fra arbeidsgivers side.", 10, false, 4);

  addLine(y);
  y += 3;
  addText("6. Opphor", 13, true, 4);
  addText(`Hver av partene kan for utlop av den avtalte perioden si opp ansettelsesforholdet med en gjensidig oppsigelsesfrist pa ${c.notice_period_months || 1} maned. Oppsigelse skal gis skriftlig, og fristen regnes fra utlopet av maneden oppsigelsen fant sted.`, 10, false, 4);

  addLine(y);
  y += 3;
  addText("7. Taushetsplikt og tilbakelevering av Arbeidsgiverens eiendom", 13, true, 4);
  addText("Arbeidstaker er forpliktet til, sa vel i ansettelsestiden som etter dennes opphor, a bevare fullstendig taushet overfor uvedkommende om konfidensiell informasjon om teknologi, forretningsforhold, kunder, leverandorer eller forhold av intern art som Arbeidstaker er blitt kjent med i forbindelse med sitt ansettelsesforhold hos Arbeidsgiver.", 10, false, 3);
  addText("Arbeidsgivers eiendom skal tilbakeleveres til Arbeidsgiver ved arbeidsforholdets opphor eller pa foresporsel fra Arbeidsgiver.", 10, false, 4);

  addLine(y);
  y += 3;
  addText("8. Personvern", 13, true, 4);
  addText("For a kunne administrere Arbeidstakerens ansettelsesforhold ma Arbeidsgiveren behandle visse personopplysninger om Arbeidstakeren. Informasjon om hvilke opplysninger som behandles finnes i Arbeidsgiverens personvernerklaering.", 10, false, 4);

  addLine(y);
  y += 3;
  addText("9. Diverse", 13, true, 4);
  addText("Denne Ansettelsesavtalen trer i kraft med virkning fra signeringsdato og erstatter alle tidligere muntlige og skriftlige avtaler mellom Arbeidstakeren og Arbeidsgiveren i anledning ansettelsesforholdet.", 10, false, 3);
  addText("Partene er enige om at Ansettelsesavtalen skal justeres/endres ved eventuelle nye ufravikelige regler for ansettelsesforholdet.", 10, false, 4);

  y += 8;
  addLine(y);
  y += 8;

  const today = new Date().toLocaleDateString("no-NO", { day: "numeric", month: "long", year: "numeric" });
  doc.setFont("Helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Dato: " + today, margin, y);
  y += 8;
  doc.text("Sted: " + (orgName || "____________________"), margin, y);
  y += 14;
  doc.setFontSize(10);
  doc.text("_________________________________", margin, y);
  doc.text("_________________________________", margin + 95, y);
  y += 5;
  doc.text("Arbeidsgiver", margin, y);
  doc.text("Arbeidstaker", margin + 95, y);

  doc.addPage();
  y = margin;
  addText("BILAG: MIDLERTIDIG ANSETTELSESAVTALE (arbeidstidsskjema)", 13, true, 6);
  addText("Arbeidsgiver: " + orgName, 11, false, 2);
  addText("Arbeidstaker: " + String(c.worker_name || ""), 11, false, 2);
  addText("Grunnlag for midlertidig ansettelse: " + (c.reason === "vikar" ? "Vikariat ved sykefravaer" : "Sesongvariasjoner / ferieavvikling"), 11, false, 4);
  addText(`Periode: ${c.start_date || ""} til ${c.end_date || ""}`, 11, false, 2);
  addText(`Antall timer: ${c.weekly_hours || 0} timer per uke`, 11, false, 2);
  addText(`Herav ekstratimer: ${c.overtime_hours || 0} timer`, 11, false, 2);
  if (c.hourly_rate != null) {
    addText(`Timelonn: NOK ${Number(c.hourly_rate).toFixed(2)}`, 11, false, 4);
  }
  addText("Arbeidstaker bekrefter med dette a ha mottatt og godtatt vilkarene i denne midlertidige ansettelsesavtalen.", 10, false, 6);
  y += 4;
  doc.setFontSize(10);
  doc.text("Dato: ____________________", margin, y);
  y += 8;
  doc.text("_________________________________", margin, y);
  if (c.status === "godkjent" && c.approved_at) {
    doc.setTextColor(0, 128, 0);
    doc.text(`(Godkjent: ${c.approved_at})`, margin + 70, y);
    doc.setTextColor(0, 0, 0);
  }

  return new Uint8Array(doc.output("arraybuffer"));
}
