import type { SigningProvider } from "./provider.ts";

export const simpleOtpProvider: SigningProvider = {
  name: "simple_otp",
  active: true,
  inactiveMessage: "",
};
