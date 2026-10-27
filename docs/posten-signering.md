# Posten Signering

SkiftPro can send an employment contract as a **portal** signature job (asynchronous, more than one signer). The existing SkiftPro e-mail code stays the default and is unchanged when the organization keeps that setting.

Zastek AS (org.nr 938291144) is the **behandler**: the virksomhetssertifikat authenticates the API call, and Zastek signs the document package. The **sender** of the job is the customer. The customer's organization number, from `organizations.org_number`, is the organization in the API path and in the manifest. The customer is who the signer sees as the sender.

This change does not call Posten and does not e-mail employees.

## How a contract is sent

1. An admin sets **Signering** to Posten Signering. The choice is stored as `employer_settings.signing_provider = 'posten'`. `skiftpro` and the existing `simple_otp` both keep the e-mail code. Until the three secrets below are set, customers do not see Posten in that list. The list stays **E-postkode**, with BankID marked as not activated. Superadmin sees only “Posten Signering kommer snart.” Sending a contract still uses the e-mail code.
2. Once the certificate is configured, Posten is offered. It stays disabled, with a short explanation, when the customer card has no valid organization number.
3. Sending a draft creates one portal job with two signers, in order:
   - the employee, addressed by the fødselsnummer already stored encrypted on the worker card, notified by e-mail and SMS, signing for themselves
   - the employer admin from the customer card (admin e-mail and the phone on the card), notified by e-mail and SMS, signing on behalf of the company
4. The client allows at most 10 signers. A contract uses the two above.
5. Posten sends the e-mail and SMS. SkiftPro does not send its own signing invitation for these contracts.
6. `posten-signering-poll` polls `GET /api/{sender}/portal/signature-jobs?polling_queue=skiftpro`. It stores the job status on the contract. When the job is `COMPLETED_SUCCESSFULLY` it downloads the PAdES, saves it on the contract (`pdf_path` and `posten_pades_path`), and only then confirms the status. Kontrakter shows the status.
7. A contract marked `posten` cannot be completed with the SkiftPro one-time code. Contracts already on the e-mail code still use that code.

Direct signature jobs are not used.

## What you still need before test or production

The API cannot be used until all of the following exist. None of them are in this repository.

1. **Virksomhetssertifikat** for Zastek AS, org.nr 938291144, from Buypass or Commfides, RSA. Buy a test certificate and a separate production certificate. Posten only accepts TLS 1.2 with that certificate, and the same certificate signs the ASiC-E package. Commfides certificates must use the SHA-256 root. We do not have this certificate yet.
2. **Edge-function secrets** (Supabase, never a `VITE_` variable, never committed):
   - `POSTEN_SIGNERING_CERT_P12` — base64 of the `.p12` file
   - `POSTEN_SIGNERING_CERT_PASSWORD`
   - `POSTEN_SIGNERING_ENV` — `test` or `production`
3. **Apply** `supabase/migrations/20261026140000_posten_signering.sql` whenever you like. It is idempotent and does not change existing signing. Nothing calls the new functions until a portal job is created, which cannot happen without the secrets.
4. **Deploy** `update-contract-status`, `sign-contract`, `posten-signering-config`, and `posten-signering-poll`. Without the secrets these do not call Posten and do not change the e-mail code. Schedule the poll only after the migration.
5. **Each customer** registers at [signering.posten.no/registrering](https://signering.posten.no/registrering) and links Zastek AS as behandler. Until Posten has authorized that link, a job returns `BROKER_NOT_AUTHORIZED`. The customer card also needs a valid organization number, an admin e-mail, and a phone. The employee needs fødselsnummer, e-mail, and an 8-digit mobile number.
6. **Schedule** `posten-signering-poll` with the service-role key. Once a minute is safe. The function skips a sender until the `X-Next-permitted-poll-time` header, which is about 10 minutes in production when the queue is empty and a few seconds in test. Without the certificate the function returns `skipped` and does not call Posten.

```bash
curl -X POST "$SUPABASE_URL/functions/v1/posten-signering-poll" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{}'
```

Use the test certificate and `POSTEN_SIGNERING_ENV=test` (`https://api.difitest.signering.posten.no`) until a real test job has completed. Production is `https://api.signering.posten.no` and needs the production certificate plus the same customer registration in production.
