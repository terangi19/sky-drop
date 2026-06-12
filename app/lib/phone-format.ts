const NZ_MOBILE_PREFIXES = ["021", "022", "027", "028", "029", "020"];

export function formatNZPhone(input: string): string {
  const digits = input.replace(/\D/g, "");
  if (digits.startsWith("642") && digits.length >= 10) return `+${digits}`;
  if (digits.startsWith("64") && digits.length >= 10) return `+${digits}`;
  for (const prefix of NZ_MOBILE_PREFIXES) {
    if (digits.startsWith(prefix.slice(1)) && digits.length >= 10) return `+642${digits.slice(2)}`;
    if (digits.startsWith(prefix) && digits.length >= 8) return `+64${digits.slice(1)}`;
  }
  return "";
}

/** Firestore doc id for phoneRegistry (digits only). */
export function phoneRegistryDocId(phone: string): string {
  return phone.replace(/\D/g, "");
}

export function isValidNzMobile(phone: string): boolean {
  const digits = phone.replace(/\D/g, "");
  const local = digits.startsWith("64") && digits.length >= 10 ? `0${digits.slice(2)}` : digits;
  return NZ_MOBILE_PREFIXES.some((p) => local.startsWith(p)) && local.length >= 9 && local.length <= 11;
}
