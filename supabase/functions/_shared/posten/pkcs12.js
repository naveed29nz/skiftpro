/**
 * PKCS#12 → PEM. `forge` is injected so the edge function can pass the Deno
 * npm build and unit tests can pass the Node package. The certificate bytes
 * never have a default and are never logged.
 */
export function materialFromPkcs12(forge, p12Base64, password) {
  if (!forge?.pkcs12) throw new Error("PKCS#12-leseren mangler.");
  const cleaned = String(p12Base64 || "").replace(/\s+/g, "");
  if (!cleaned || !password) {
    throw new Error("Virksomhetssertifikat eller passord mangler.");
  }
  let certificates;
  let key;
  try {
    const der = forge.util.decode64(cleaned);
    const asn1 = forge.asn1.fromDer(der);
    const p12 = forge.pkcs12.pkcs12FromAsn1(asn1, password);
    const shrouded = forge.pki.oids.pkcs8ShroudedKeyBag;
    const plain = forge.pki.oids.keyBag;
    const keyBags = p12.getBags({ bagType: shrouded })[shrouded] || [];
    const plainBags = p12.getBags({ bagType: plain })[plain] || [];
    key = keyBags[0]?.key || plainBags[0]?.key;
    const certBag = forge.pki.oids.certBag;
    certificates = (p12.getBags({ bagType: certBag })[certBag] || [])
      .map((bag) => bag.cert)
      .filter(Boolean);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/password|mac|invalid/i.test(message)) {
      throw new Error("Kunne ikke åpne virksomhetssertifikatet. Sjekk passordet.");
    }
    throw new Error("Virksomhetssertifikatet kunne ikke leses.");
  }
  if (!key) throw new Error("Virksomhetssertifikatet inneholder ingen privatnøkkel.");
  if (!certificates.length) throw new Error("Virksomhetssertifikatet inneholder ingen sertifikater.");
  return {
    certificatePem: forge.pki.certificateToPem(certificates[0]),
    privateKeyPem: forge.pki.privateKeyToPem(key),
    chainPem: certificates.slice(1).map((certificate) => forge.pki.certificateToPem(certificate)),
  };
}
