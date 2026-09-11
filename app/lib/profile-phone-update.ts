export type PhoneUpdateInput = {
  /** Trimmed incoming phone from the client. Undefined means the field was omitted. */
  incomingPhone?: string;
  clearPhone?: boolean;
  existingPhone: string;
  existingPhoneVerified: boolean;
};

export type PhoneUpdateResult = {
  phone: string;
  phoneNumber: string;
  phoneVerified: boolean;
  /** True when a previously verified number must be released from the registry. */
  releasePrevious: boolean;
};

/**
 * Phone verification is server-authoritative. Saving a different number, or
 * explicitly clearing the phone, always drops verification. Clients cannot
 * elevate phoneVerified.
 */
export function resolveProfilePhoneUpdate(input: PhoneUpdateInput): PhoneUpdateResult {
  const existingPhone = input.existingPhone.trim();
  const existingVerified = input.existingPhoneVerified === true;

  if (input.clearPhone === true) {
    return {
      phone: "",
      phoneNumber: "",
      phoneVerified: false,
      releasePrevious: existingVerified && !!existingPhone,
    };
  }

  if (input.incomingPhone === undefined) {
    return {
      phone: existingPhone,
      phoneNumber: existingPhone,
      phoneVerified: existingVerified,
      releasePrevious: false,
    };
  }

  const incoming = input.incomingPhone.trim();
  if (!incoming) {
    return {
      phone: "",
      phoneNumber: "",
      phoneVerified: false,
      releasePrevious: existingVerified && !!existingPhone,
    };
  }

  if (incoming === existingPhone) {
    return {
      phone: existingPhone,
      phoneNumber: existingPhone,
      phoneVerified: existingVerified,
      releasePrevious: false,
    };
  }

  return {
    phone: incoming,
    phoneNumber: incoming,
    phoneVerified: false,
    releasePrevious: existingVerified && !!existingPhone,
  };
}
