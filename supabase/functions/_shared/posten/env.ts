const ENV_KEYS = [
  "SIGNING_PROVIDER",
  "IDURA_CLIENT_ID",
  "IDURA_CLIENT_SECRET",
  "SIGNICAT_CLIENT_ID",
  "SIGNICAT_CLIENT_SECRET",
  "POSTEN_SIGNERING_CERT_P12",
  "POSTEN_SIGNERING_CERT_PASSWORD",
  "POSTEN_SIGNERING_ENV",
];

export function signingEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const key of ENV_KEYS) {
    const value = Deno.env.get(key);
    if (value) env[key] = value;
  }
  return env;
}
