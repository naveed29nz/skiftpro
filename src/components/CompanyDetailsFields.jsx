import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { lookupCompanyName, orgNumberValid } from '@/lib/orgNumber';

export default function CompanyDetailsFields({ value, onChange, email, onEmailChange }) {
  const [lookupNote, setLookupNote] = useState('');

  const patch = (partial) => {
    onChange((current) => ({ ...current, ...partial }));
  };

  const lookupFromRegistry = async () => {
    const currentName = String(value.companyName || '').trim();
    if (currentName || !orgNumberValid(value.orgNumber)) return;
    setLookupNote('Henter firmanavn…');
    const name = await lookupCompanyName(value.orgNumber);
    if (!name) {
      setLookupNote('Fant ikke firmanavn. Skriv det inn selv.');
      return;
    }
    setLookupNote('');
    onChange((current) => (String(current.companyName || '').trim() ? current : { ...current, companyName: name }));
  };

  return (
    <>
      <div className="space-y-1.5">
        <Label htmlFor="company-name">Firmanavn</Label>
        <Input
          id="company-name"
          value={value.companyName}
          onChange={(event) => patch({ companyName: event.target.value })}
          autoComplete="organization"
          required
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="org-number">Organisasjonsnummer</Label>
        <Input
          id="org-number"
          inputMode="numeric"
          value={value.orgNumber}
          onChange={(event) => patch({ orgNumber: event.target.value })}
          onBlur={lookupFromRegistry}
          placeholder="9 siffer"
          required
        />
        <p className="text-xs text-slate-500">
          {lookupNote || '9 siffer. Firmanavn kan hentes fra Brønnøysundregistrene når feltet er tomt.'}
        </p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="contact-name">Kontaktperson</Label>
        <Input
          id="contact-name"
          value={value.contactName}
          onChange={(event) => patch({ contactName: event.target.value })}
          autoComplete="name"
          required
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="contact-phone">Telefon</Label>
        <Input
          id="contact-phone"
          type="tel"
          value={value.phone}
          onChange={(event) => patch({ phone: event.target.value })}
          autoComplete="tel"
          required
        />
      </div>
      {onEmailChange ? (
        <div className="space-y-1.5">
          <Label htmlFor="email">E-post</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => onEmailChange(event.target.value)}
            required
          />
        </div>
      ) : email ? (
        <div className="space-y-1.5">
          <Label htmlFor="email">E-post</Label>
          <Input id="email" type="email" value={email} readOnly className="bg-slate-100" />
        </div>
      ) : null}
      <div className="space-y-1.5">
        <Label htmlFor="store-count">Antall butikker</Label>
        <Input
          id="store-count"
          type="number"
          min="1"
          max="100"
          step="1"
          value={value.storeCount}
          onChange={(event) => patch({ storeCount: event.target.value })}
          required
        />
      </div>
    </>
  );
}
