import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { jsPDF } from 'npm:jspdf@4.0.0';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const contractId = body.contract_id;
    if (!contractId) return Response.json({ error: 'Missing contract_id' }, { status: 400 });

    const contracts = await base44.entities.Contract.filter({ id: contractId });
    if (!contracts.length) return Response.json({ error: 'Contract not found' }, { status: 404 });

    const c = contracts[0];

    // Hent ferskeste organisasjonsnavn
    let orgName = c.org_name || 'Arbeidsgiver';
    if (c.org_id) {
      const orgs = await base44.entities.Organization.filter({ id: c.org_id });
      if (orgs[0]?.name) orgName = orgs[0].name;
    }

    const doc = new jsPDF({ unit: 'mm', format: 'a4' });

    const margin = 25;
    const pageW = 210;
    const pageH = 297;
    let y = margin;

    function addText(text, size, bold, extraGap) {
      if (y > pageH - 30) { doc.addPage(); y = margin; }
      doc.setFont('Helvetica', bold ? 'bold' : 'normal');
      doc.setFontSize(size);
      const lines = doc.splitTextToSize(text, pageW - margin * 2);
      doc.text(lines, margin, y);
      y += (lines.length * (size * 0.4)) + (extraGap || 2);
    }

    function addField(label, value, size) {
      if (y > pageH - 30) { doc.addPage(); y = margin; }
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(size || 11);
      doc.text(label, margin, y);
      const lw = doc.getTextWidth(label);
      doc.setFont('Helvetica', 'normal');
      doc.text(String(value), margin + lw + 2, y);
      y += 6;
    }

    function addLine(yPos) {
      doc.setDrawColor(200);
      doc.line(margin, yPos, pageW - margin, yPos);
    }

    // ---- HEADER ----
    doc.setFontSize(16);
    doc.setFont('Helvetica', 'bold');
    doc.text('Rammeavtale for tilkallingsvikar', margin, y);
    y += 12;

    addText('mellom', 11, false, 3);

    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(orgName, margin, y);
    y += 5;
    doc.setFont('Helvetica', 'normal');
    doc.text('(Arbeidsgiveren)', margin, y);
    y += 8;

    addText('og', 11, false, 3);

    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(c.worker_name || 'Arbeidstaker', margin, y);
    y += 5;
    doc.setFont('Helvetica', 'normal');
    doc.text('(Arbeidstakeren)', margin, y);
    y += 8;

    addText('(heretter omtalt som Ansettelsesavtalen)', 10, false, 4);

    // ---- 1. ARBEIDSFORHOLD ----
    y += 2;
    addLine(y); y += 3;
    addText('1. Arbeidsforhold', 13, true, 4);

    addText('Arbeidstaker kan tilkalles etter behov, og har full anledning til a takke nei til tilbudt arbeid. Fra og med det tidspunkt Arbeidstaker eventuelt aksepterer tilbudet og frem til det avtalte oppdraget er avsluttet, regulerer denne Arbeidsavtalen arbeidsforholdet mellom Partene.', 10, false, 3);

    addText('De vilkar og betingelser som gjelder i arbeidsforholdet er inntatt i denne Arbeidsavtalen og i Vedlegg 1. I Vedlegg 1 har Arbeidsgiveren inkludert lovpalagt informasjon som gjelder ved oppstart av arbeidsforholdet.', 10, false, 3);

    addText('Arbeidstakeren plikter, sa langt det er av betydning for arbeidsforholdet, a holde seg oppdatert pa og folge de til enhver tid gjeldende regler for Arbeidsgiveren, enten disse folger lover, forskrifter, interne retningslinjer og policyer eller instrukser mv. gitt av Arbeidsgiveren.', 10, false, 4);

    // ---- 2. STILLING ----
    addLine(y); y += 3;
    addText('2. Stilling', 13, true, 4);
    addText('Arbeidstakeren er ansatt som selger, som for tiden innebaerer salg og kundeservice, renhold, varepafylling, tilberedning av mat og matsikkerhet.', 10, false, 4);

    // ---- 3. ARBEIDSTID ----
    addLine(y); y += 3;
    addText('3. Arbeidstid', 13, true, 4);

    addText('Arbeidsforholdet tiltres ved hvert avtalte oppdrag/tilkallingens begynnelse, og avsluttes uten forutgaende oppsigelse og uten oppsigelsesfrist etter endt tilkalling.', 10, false, 3);

    const hoursText = `Den alminnelige arbeidstiden hos Arbeidsgiveren er ${c.full_time_hours_per_week || 37.5} timer per uke. Arbeidstiden plasseres i tidsrommet mellom kl 06:00 og kl 23:00. Daglig / ukentlig arbeidstid fastsettes for hvert enkelt oppdrag.`;
    addText(hoursText, 10, false, 3);

    addText('Arbeidstaker har rett pa pauser etter arbeidsmiljoloven \u00a7 10-9.', 10, false, 2);
    addText('Arbeidsgiver kan palegge arbeidstaker arbeid utover avtalt arbeidstid etter arbeidsmiljoloven \u00a7 10-6.', 10, false, 2);

    if (c.overtime_hours > 0) {
      addText(`For overtidsarbeid utbetales overtidstillegg med minst 40 prosent i henhold til arbeidsmiljoloven \u00a7 10-6.`, 10, false, 3);
    }

    addText('Arbeidstaker har bare rett til kompensasjon for overtidsarbeid som er palagt eller godkjent av naermeste overordnede. Ved merarbeid utbetales ikke overtidstillegg.', 10, false, 4);

    // ---- 4. ARBEIDSSTED ----
    addLine(y); y += 3;
    addText('4. Arbeidssted', 13, true, 4);
    addText(`Arbeidssted er for tiden hovedsakelig ved ${orgName}. Arbeidsgiveren kan endre arbeidsstedet.`, 10, false, 4);

    // ---- 5. LØNN ----
    addLine(y); y += 3;
    addText('5. Lonn', 13, true, 4);
    addText(`Ved tiltredelse er Arbeidstakerens ordinaere timelonn NOK ${(c.hourly_rate || 0).toFixed(2)}.`, 10, false, 2);

    addText('Arbeidstakeren skal kontrollere at alle utbetalinger fra Arbeidsgiveren er riktige og skal umiddelbart informere Arbeidsgiver om eventuelle feil. Partene er enige om at feil skal rettes opp og Arbeidstaker har ikke rett til a beholde belop mottatt som folge av feilutbetaling fra arbeidsgivers side.', 10, false, 4);

    // ---- 6. OPPHØR ----
    addLine(y); y += 3;
    addText('6. Opphor', 13, true, 4);
    addText(`Hver av partene kan for utlop av den avtalte perioden si opp ansettelsesforholdet med en gjensidig oppsigelsesfrist pa ${c.notice_period_months || 1} maned. Oppsigelse skal gis skriftlig, og fristen regnes fra utlopet av maneden oppsigelsen fant sted.`, 10, false, 4);

    // ---- 7. TAUSHETSPLIKT ----
    addLine(y); y += 3;
    addText('7. Taushetsplikt og tilbakelevering av Arbeidsgiverens eiendom', 13, true, 4);
    addText('Arbeidstaker er forpliktet til, sa vel i ansettelsestiden som etter dennes opphor, a bevare fullstendig taushet overfor uvedkommende om konfidensiell informasjon om teknologi, forretningsforhold, kunder, leverandorer eller forhold av intern art som Arbeidstaker er blitt kjent med i forbindelse med sitt ansettelsesforhold hos Arbeidsgiver.', 10, false, 3);
    addText('Arbeidsgivers eiendom skal tilbakeleveres til Arbeidsgiver ved arbeidsforholdets opphor eller pa foresporsel fra Arbeidsgiver.', 10, false, 4);

    // ---- 8. PERSONVERN ----
    addLine(y); y += 3;
    addText('8. Personvern', 13, true, 4);
    addText('For a kunne administrere Arbeidstakerens ansettelsesforhold ma Arbeidsgiveren behandle visse personopplysninger om Arbeidstakeren. Informasjon om hvilke opplysninger som behandles finnes i Arbeidsgiverens personvernerklaering.', 10, false, 4);

    // ---- 9. DIVERSE ----
    addLine(y); y += 3;
    addText('9. Diverse', 13, true, 4);
    addText('Denne Ansettelsesavtalen trer i kraft med virkning fra signeringsdato og erstatter alle tidligere muntlige og skriftlige avtaler mellom Arbeidstakeren og Arbeidsgiveren i anledning ansettelsesforholdet.', 10, false, 3);
    addText('Partene er enige om at Ansettelsesavtalen skal justeres/endres ved eventuelle nye ufravikelige regler for ansettelsesforholdet.', 10, false, 4);

    y += 8;
    addLine(y); y += 8;

    // ---- SIGNATURES ----
    const today = new Date().toLocaleDateString('no-NO', { day: 'numeric', month: 'long', year: 'numeric' });

    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('Dato: ' + today, margin, y); y += 8;
    doc.text('Sted: ' + (orgName || '____________________'), margin, y); y += 14;

    doc.setFontSize(10);
    doc.text('_________________________________', margin, y);
    doc.text('_________________________________', margin + 95, y);
    y += 5;
    doc.text('Arbeidsgiver', margin, y);
    doc.text('Arbeidstaker', margin + 95, y);
    y += 10;

    // ---- BILAG ----
    doc.addPage();
    y = margin;
    addText('BILAG: MIDLERTIDIG ANSETTELSESAVTALE (arbeidstidsskjema)', 13, true, 6);

    addText('Arbeidsgiver: ' + orgName, 11, false, 2);
    addText('Arbeidstaker: ' + (c.worker_name || ''), 11, false, 2);
    addText('Grunnlag for midlertidig ansettelse: ' + (c.reason === 'vikar' ? 'Vikariat ved sykefravaer' : 'Sesongvariasjoner / ferieavvikling'), 11, false, 4);

    addText(`Periode: ${c.start_date || ''} til ${c.end_date || ''}`, 11, false, 2);
    addText(`Antall timer: ${c.weekly_hours || 0} timer per uke`, 11, false, 2);
    addText(`Herav ekstratimer: ${c.overtime_hours || 0} timer`, 11, false, 2);
    addText(`Timelonn: NOK ${(c.hourly_rate || 0).toFixed(2)}`, 11, false, 4);

    addText('Arbeidstaker bekrefter med dette a ha mottatt og godtatt vilkarene i denne midlertidige ansettelsesavtalen.', 10, false, 6);

    y += 4;
    doc.setFontSize(10);
    doc.text('Dato: ____________________', margin, y);
    y += 8;
    doc.text('_________________________________', margin, y);
    if (c.status === 'godkjent' && c.approved_at) {
      doc.setTextColor(0, 128, 0);
      doc.text(`(Godkjent: ${c.approved_at})`, margin + 70, y);
      doc.setTextColor(0, 0, 0);
    }

    const pdfBytes = doc.output('arraybuffer');

    return new Response(pdfBytes, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="kontrakt-${c.worker_name || 'ansatt'}-${c.start_date || 'dato'}.pdf"`,
      },
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});