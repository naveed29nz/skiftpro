export function mapSigningError(message) {
  const text = String(message || '');
  if (text.includes('Feil engangskode')) {
    return 'Feil kode. Sjekk e-posten og prøv igjen.';
  }
  if (text.includes('Engangskoden er ugyldig eller utløpt')) {
    return 'Koden er utløpt. Be om en ny kode.';
  }
  if (text.includes('For mange forsøk')) {
    return 'For mange forsøk. Be om en ny kode.';
  }
  return text || 'Signeringen feilet';
}
