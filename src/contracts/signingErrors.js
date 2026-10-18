export function mapSigningError(message) {
  const text = String(message || '').trim();
  if (/failed to fetch|networkerror|load failed|kunne ikke kontakte/i.test(text)) {
    return 'Kunne ikke kontakte serveren. Sjekk nettverket og prøv igjen.';
  }
  const counted = text.match(/Feil kode, prøv igjen – du har \d+ forsøk igjen/);
  if (counted) return counted[0];
  if (text.includes('Feil engangskode') || text.includes('Feil kode')) {
    return 'Feil kode, prøv igjen.';
  }
  if (text.includes('Koden er utløpt') || text.includes('Engangskoden er ugyldig eller utløpt')) {
    return 'Koden er utløpt, send ny kode';
  }
  if (text.includes('For mange forsøk')) {
    return 'For mange forsøk. Be om en ny kode.';
  }
  if (text.includes('Ny kode kan sendes')) {
    return 'Ny kode kan sendes om 30 sekunder';
  }
  return text || 'Signeringen feilet';
}
