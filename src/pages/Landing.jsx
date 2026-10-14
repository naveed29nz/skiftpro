import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeftRight,
  CalendarDays,
  MapPin,
  Menu,
  Receipt,
  Shield,
  Smartphone,
  Store,
  Ticket,
  X,
} from 'lucide-react';

const SIGNUP = '/login?mode=signup';

const features = [
  {
    icon: CalendarDays,
    title: 'Vaktliste',
    text: 'Ukeplan og dagens vakter samlet, så butikken ser hvem som er inne uten en egen chat-tråd.',
  },
  {
    icon: Smartphone,
    title: 'Mobil-app / PWA',
    text: 'Ansatte åpner SkiftPro i nettleseren og kan legge ikonet på hjemskjermen, som en app.',
  },
  {
    icon: MapPin,
    title: 'Stempling med GPS',
    text: 'Inn og ut registreres mot butikken. Vi lagrer avstand og et grovt punkt, ikke en nøyaktig sporlogg.',
  },
  {
    icon: ArrowLeftRight,
    title: 'Vaktbytte',
    text: 'Bytte av vakt skjer i systemet, med oversikt over hvem som tar passet.',
  },
  {
    icon: Receipt,
    title: 'Dagsoppgjør',
    text: 'Kveldens oppgjør gjøres i samme verktøy som vaktene, i stedet for på et løst ark.',
  },
  {
    icon: Ticket,
    title: 'Loddtelling',
    text: 'Telling av lodd hører med i oppgjøret, ikke i en egen perm.',
  },
  {
    icon: Store,
    title: 'Resultat per butikk',
    text: 'Se hvordan hver butikk ligger an, uten å blande tallene i ett regneark.',
  },
  {
    icon: Shield,
    title: 'Lønnstilgang styrt per rolle',
    text: 'Lønn vises bare for rollene du åpner for. Resten av staben ser vakter og egne timer.',
  },
];

const steps = [
  {
    n: '01',
    title: 'Opprett konto',
    text: 'Bli kunde og prøv gratis i 30 dager. Du setter opp organisasjonen selv.',
  },
  {
    n: '02',
    title: 'Legg inn butikk og vakter',
    text: 'Ansatte, vaktliste og vaktbytte samles på ett sted fra første uke.',
  },
  {
    n: '03',
    title: 'Stemple, gjør opp, følg med',
    text: 'GPS-stempling, dagsoppgjør, loddtelling og resultat per butikk i samme løp.',
  },
];

const faqs = [
  {
    q: 'Er prisen på 2 498 kr bekreftet?',
    a: 'Nei. Beløpet på denne siden er en placeholder og er merket IKKE BEKREFTET. Det er ikke en vedtatt pris, og du blir ikke fakturert det før prisen er avklart.',
  },
  {
    q: 'Hvordan blir jeg kunde?',
    a: 'Bruk «Bli kunde» for å opprette konto selv og prøve i 30 dager. Vil du heller snakke med oss først, send en melding til post@zastek.no.',
  },
  {
    q: 'Kan de ansatte bruke mobilen?',
    a: 'Ja. SkiftPro er en nettapp som kan installeres på telefonen (PWA), med vaktliste og stempling.',
  },
  {
    q: 'Hva lagres når noen stempler med GPS?',
    a: 'Avstand til butikken, om stemplingen var innenfor området, og grove koordinater. Den nøyaktige posisjonen lagres ikke. Detaljene står i personvernerklæringen.',
  },
  {
    q: 'Hvem kan se lønn?',
    a: 'Lønnstilgang styres per rolle. Arbeidsgiveren bestemmer hvem som ser lønnsgrunnlag, og hvem som bare ser egne timer og vakter.',
  },
  {
    q: 'Er SkiftPro et offisielt Narvesen-produkt?',
    a: 'Nei. Det er laget av en Narvesen-franchisetaker og drives av Zastek AS. Det er et uavhengig produkt, ikke et system fra Narvesen.',
  },
  {
    q: 'Hvor ligger dataene?',
    a: 'Innlogging og database ligger hos Supabase i EU (Frankfurt). Nettappen kjører på Vercel. Stripe og e-post tas i bruk senere.',
  },
];

function ShiftMockup() {
  const rows = [
    ['Kari N.', '07:00–15:00', 'Kasse'],
    ['Ola H.', '15:00–22:00', 'Kasse'],
    ['Mina S.', '10:00–18:00', 'Varelager'],
  ];
  return (
    <div className="w-[220px] sm:w-[240px] rounded-[1.75rem] border-[7px] border-[#172554] bg-white shadow-2xl" aria-hidden="true">
      <div className="rounded-t-[1.2rem] bg-[#172554] px-4 pb-3 pt-4 text-white">
        <p className="text-[10px] uppercase tracking-[0.16em] text-blue-200">Mandag</p>
        <p className="text-sm font-semibold">Vaktliste</p>
      </div>
      <ul className="divide-y divide-slate-100 px-1">
        {rows.map(([name, time, role]) => (
          <li key={name} className="flex items-center justify-between px-3 py-2.5 text-[11px]">
            <span>
              <span className="block font-semibold text-slate-800">{name}</span>
              <span className="text-slate-500">{role}</span>
            </span>
            <span className="font-medium text-[#172554]">{time}</span>
          </li>
        ))}
      </ul>
      <div className="px-3 pb-3">
        <div className="rounded-xl bg-emerald-600 py-2 text-center text-[11px] font-semibold text-white">Stemple inn</div>
      </div>
    </div>
  );
}

function SettlementMockup() {
  return (
    <div className="overflow-hidden rounded-2xl border border-[#e7e0d4] bg-white shadow-lg" aria-hidden="true">
      <div className="flex items-center justify-between bg-[#172554] px-4 py-3 text-white">
        <p className="text-sm font-semibold">Dagsoppgjør</p>
        <p className="text-[11px] text-blue-200">Butikk 1</p>
      </div>
      <dl className="grid grid-cols-2 gap-px bg-[#e7e0d4] text-sm">
        {[
          ['Kontant', '4 280'],
          ['Kort', '18 640'],
          ['Lodd', '1 120'],
          ['Avvik', '0'],
        ].map(([label, value]) => (
          <div key={label} className="bg-[#fffcf8] px-4 py-3">
            <dt className="text-[11px] uppercase tracking-wide text-slate-500">{label}</dt>
            <dd className="font-semibold text-[#172554]">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export default function Landing() {
  const [menuOpen, setMenuOpen] = useState(false);

  const closeMenu = () => setMenuOpen(false);

  const submitContact = (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const subject = encodeURIComponent('SkiftPro – henvendelse');
    const body = encodeURIComponent(`Navn: ${data.get('name')}\nE-post: ${data.get('email')}\n\n${data.get('message')}`);
    window.location.href = `mailto:post@zastek.no?subject=${subject}&body=${body}`;
  };

  return (
    <div className="min-h-screen bg-[#f4f0e8] text-[#172554]">
      <header className="sticky top-0 z-40 border-b border-[#e7e0d4] bg-[#f4f0e8]/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4">
          <a href="#topp" className="font-serif text-xl tracking-tight">SkiftPro</a>
          <nav className="hidden items-center gap-6 text-sm md:flex" aria-label="Seksjoner">
            <a href="#funksjoner" className="hover:underline">Funksjoner</a>
            <a href="#historien" className="hover:underline">Historien</a>
            <a href="#slik" className="hover:underline">Slik virker det</a>
            <a href="#pris" className="hover:underline">Pris</a>
            <a href="#faq" className="hover:underline">FAQ</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link
              to={SIGNUP}
              className="hidden rounded-full border border-[#172554] px-3 py-2 text-sm font-semibold hover:bg-white sm:inline-flex"
            >
              Bli kunde
            </Link>
            <Link
              to="/login"
              className="rounded-full bg-[#172554] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0f1b40]"
            >
              Logg inn
            </Link>
            <button
              type="button"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#172554] md:hidden"
              aria-expanded={menuOpen}
              aria-controls="mobilmeny"
              onClick={() => setMenuOpen((open) => !open)}
            >
              <span className="sr-only">{menuOpen ? 'Lukk meny' : 'Åpne meny'}</span>
              {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
        {menuOpen && (
          <nav id="mobilmeny" className="border-t border-[#e7e0d4] px-4 py-3 md:hidden" aria-label="Mobilmeny">
            <div className="flex flex-col gap-3 text-sm">
              {[
                ['#funksjoner', 'Funksjoner'],
                ['#historien', 'Historien'],
                ['#slik', 'Slik virker det'],
                ['#pris', 'Pris'],
                ['#faq', 'FAQ'],
                ['#kontakt', 'Kontakt'],
              ].map(([href, label]) => (
                <a key={href} href={href} onClick={closeMenu} className="py-1">{label}</a>
              ))}
              <Link to={SIGNUP} onClick={closeMenu} className="py-1 font-semibold">Bli kunde</Link>
            </div>
          </nav>
        )}
      </header>

      <main id="topp">
        <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 pb-16 pt-10 md:grid-cols-2 md:pb-24 md:pt-16">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#9a3412]">For kiosk og convenience</p>
            <h1 className="mt-3 font-serif text-4xl leading-[1.12] tracking-tight md:text-5xl">
              Vaktplan, stempling, dagsoppgjør og loddtelling i ett – laget for kiosk og convenience
            </h1>
            <p className="mt-5 max-w-xl text-lg text-[#3f4a63]">
              Ett sted for vaktlisten, inn- og utstempling, kveldens oppgjør og loddtellingen. Bygget for butikker som holder åpent når andre har gått hjem.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link
                to={SIGNUP}
                className="inline-flex flex-col rounded-full bg-[#172554] px-6 py-3 text-white hover:bg-[#0f1b40]"
              >
                <span className="text-base font-semibold">Bli kunde</span>
                <span className="text-xs text-blue-100">Prøv gratis i 30 dager</span>
              </Link>
              <a href="#kontakt" className="inline-flex items-center justify-center rounded-full px-4 py-3 text-sm font-semibold underline-offset-4 hover:underline">
                Eller send en melding
              </a>
            </div>
            <ul className="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-sm text-[#3f4a63]">
              <li>30 dager gratis</li>
              <li>Pris per butikk</li>
              <li>Laget i Norge</li>
            </ul>
          </div>
          <div>
            <div className="relative">
              <img
                src="/marketing/hero-kiosk.jpg"
                alt="Illustrasjon av en lys kiosk med to stiliserte medarbeidere bak disken. Ikke et fotografi av virkelige personer."
                width="1280"
                height="720"
                fetchPriority="high"
                className="aspect-[16/9] w-full rounded-3xl object-cover shadow-xl"
              />
              <div className="pointer-events-none absolute bottom-3 right-3 hidden origin-bottom-right scale-90 drop-shadow-xl lg:block">
                <ShiftMockup />
              </div>
            </div>
            <div className="mt-4 flex justify-center lg:hidden">
              <ShiftMockup />
            </div>
            <p className="mt-3 text-xs text-[#5c677a]">Illustrasjon laget for SkiftPro. Ikke et fotografi, og ikke en virkelig person.</p>
          </div>
        </section>

        <section id="funksjoner" className="scroll-mt-20 border-t border-[#e7e0d4] bg-[#fffcf8] py-16 md:py-24">
          <div className="mx-auto max-w-6xl px-4">
            <h2 className="font-serif text-3xl md:text-4xl">Det butikken faktisk gjør på en dag</h2>
            <p className="mt-3 max-w-2xl text-[#3f4a63]">Åtte ting som i dag ofte ligger i meldinger, permer og regneark.</p>
            <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {features.map(({ icon: Icon, title, text }) => (
                <li key={title} className="rounded-2xl border border-[#e7e0d4] bg-[#f4f0e8] p-5">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                  <h3 className="mt-4 font-semibold">{title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-[#3f4a63]">{text}</p>
                </li>
              ))}
            </ul>
            <div className="mt-10 max-w-md">
              <SettlementMockup />
              <p className="mt-2 text-xs text-[#5c677a]">Forenklet skjermbilde av dagsoppgjøret. Tallene er eksempel.</p>
            </div>
          </div>
        </section>

        <section id="historien" className="scroll-mt-20 py-16 md:py-24">
          <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 md:grid-cols-2">
            <figure>
              <img
                src="/marketing/story-shift.jpg"
                alt="Illustrasjon av en stilisert person ved en pult etter stengetid. Ikke et fotografi av en virkelig person."
                width="960"
                height="720"
                loading="lazy"
                className="aspect-[4/3] w-full rounded-3xl object-cover shadow-lg"
              />
              <figcaption className="mt-2 text-xs text-[#5c677a]">Illustrasjon laget for SkiftPro. Ikke et fotografi, og ikke en virkelig person.</figcaption>
            </figure>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#9a3412]">Historien</p>
              <h2 className="mt-3 font-serif text-3xl md:text-4xl">Laget av en Narvesen-franchisetaker</h2>
              <div className="mt-5 space-y-4 text-[#3f4a63]">
                <p>
                  SkiftPro kommer fra hverdagen i kiosk: vaktlister i meldinger, stempling som ikke stemte med tiden folk faktisk sto i butikken, og et dagsoppgjør som tok kvelden.
                </p>
                <p>
                  En Narvesen-franchisetaker bygde verktøyet han selv manglet. Zastek AS står bak produktet. SkiftPro er ikke et offisielt Narvesen-system.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section id="slik" className="scroll-mt-20 border-y border-[#e7e0d4] bg-[#172554] py-16 text-white md:py-24">
          <div className="mx-auto max-w-6xl px-4">
            <h2 className="font-serif text-3xl md:text-4xl">Slik virker det</h2>
            <ol className="mt-10 grid gap-6 md:grid-cols-3">
              {steps.map((step) => (
                <li key={step.n} className="rounded-2xl border border-white/15 bg-white/5 p-6">
                  <p className="font-serif text-3xl text-amber-200">{step.n}</p>
                  <h3 className="mt-4 text-xl font-semibold">{step.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-blue-100">{step.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="pris" className="scroll-mt-20 py-16 md:py-24" aria-labelledby="pris-tittel">
          <div className="mx-auto max-w-xl px-4">
            <h2 id="pris-tittel" className="font-serif text-3xl md:text-4xl">Pris</h2>
            <p className="mt-3 text-[#3f4a63]">Foreløpig placeholder. Ikke en bekreftet pris.</p>
            <div className="mt-8 overflow-hidden rounded-3xl border-4 border-amber-500 bg-white shadow-lg">
              <p className="bg-amber-400 px-4 py-2 text-center text-sm font-bold tracking-wide text-amber-950">
                IKKE BEKREFTET · placeholder
              </p>
              <div className="p-6 md:p-8">
                <p className="text-sm font-semibold uppercase tracking-wide text-amber-800">Eksempel, ikke vedtatt</p>
                <p className="mt-3 font-serif text-5xl">2 498 kr</p>
                <p className="text-[#3f4a63]">per butikk / mnd</p>
                <p className="mt-6 rounded-2xl border-2 border-amber-500 bg-amber-50 px-4 py-3 text-base font-semibold text-amber-950">
                  Pris: 2 498 kr per butikk/mnd – IKKE BEKREFTET
                </p>
                <p className="mt-4 text-sm leading-relaxed text-[#3f4a63]">
                  Tallet er et stedfortreder. Det er ikke lagt inn som Stripe-pris, og det er ikke et tilbud du kan akseptere. Prøveperioden på 30 dager er det som gjelder når du oppretter konto.
                </p>
                <Link
                  to={SIGNUP}
                  className="mt-6 inline-flex rounded-full bg-[#172554] px-5 py-3 text-sm font-semibold text-white hover:bg-[#0f1b40]"
                >
                  Bli kunde / Prøv gratis i 30 dager
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section id="faq" className="scroll-mt-20 border-t border-[#e7e0d4] bg-[#fffcf8] py-16 md:py-24">
          <div className="mx-auto max-w-3xl px-4">
            <h2 className="font-serif text-3xl md:text-4xl">Spørsmål</h2>
            <div className="mt-8 divide-y divide-[#e7e0d4] border-y border-[#e7e0d4]">
              {faqs.map((item) => (
                <details key={item.q} className="group py-4">
                  <summary className="cursor-pointer list-none font-semibold marker:content-none [&::-webkit-details-marker]:hidden">
                    <span className="flex items-start justify-between gap-4">
                      {item.q}
                      <span aria-hidden="true" className="text-[#9a3412] group-open:rotate-45">+</span>
                    </span>
                  </summary>
                  <p className="mt-3 text-sm leading-relaxed text-[#3f4a63]">{item.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section id="kontakt" className="scroll-mt-20 py-16 md:py-24">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 md:grid-cols-2">
            <div>
              <h2 className="font-serif text-3xl md:text-4xl">Ta kontakt</h2>
              <p className="mt-4 text-[#3f4a63]">
                Spørsmål om butikker, prøveperioden eller avtalen sendes til <a className="font-semibold underline" href="mailto:post@zastek.no">post@zastek.no</a>.
              </p>
              <p className="mt-4 text-sm text-[#3f4a63]">Skjemaet åpner e-postprogrammet ditt. Vi lagrer ikke meldingen på denne siden.</p>
            </div>
            <form
              className="rounded-3xl border border-[#e7e0d4] bg-white p-6 shadow-sm"
              action="mailto:post@zastek.no"
              method="post"
              encType="text/plain"
              onSubmit={submitContact}
            >
              <div className="space-y-4">
                <label className="block text-sm font-semibold" htmlFor="kontakt-navn">
                  Navn
                  <input id="kontakt-navn" name="name" required autoComplete="name" className="mt-1 w-full rounded-xl border border-[#e7e0d4] bg-[#fffcf8] px-3 py-2 font-normal" />
                </label>
                <label className="block text-sm font-semibold" htmlFor="kontakt-epost">
                  E-post
                  <input id="kontakt-epost" name="email" type="email" required autoComplete="email" className="mt-1 w-full rounded-xl border border-[#e7e0d4] bg-[#fffcf8] px-3 py-2 font-normal" />
                </label>
                <label className="block text-sm font-semibold" htmlFor="kontakt-melding">
                  Melding
                  <textarea id="kontakt-melding" name="message" required rows={4} className="mt-1 w-full rounded-xl border border-[#e7e0d4] bg-[#fffcf8] px-3 py-2 font-normal" />
                </label>
                <button type="submit" className="rounded-full bg-[#172554] px-5 py-3 text-sm font-semibold text-white hover:bg-[#0f1b40]">
                  Send til post@zastek.no
                </button>
              </div>
            </form>
          </div>
        </section>
      </main>

      <footer className="bg-[#172554] text-blue-100">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="font-serif text-2xl text-white">SkiftPro</p>
            <p className="mt-2 text-sm">Zastek AS</p>
            <p className="text-sm">Org.nr. 938 291 144</p>
            <p className="text-sm">
              <a className="underline" href="mailto:post@zastek.no">post@zastek.no</a>
            </p>
          </div>
          <nav className="flex flex-wrap gap-x-5 gap-y-2 text-sm" aria-label="Juridisk">
            <Link className="underline" to="/personvern">Personvernerklæring</Link>
            <Link className="underline" to="/vilkar">Vilkår</Link>
            <Link className="underline" to="/databehandleravtale">Databehandleravtale</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
