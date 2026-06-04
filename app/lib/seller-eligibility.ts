/** Phone on file from a Firestore profile document. */

export function profilePhoneNumber(profile: Record<string, unknown> | null | undefined): string {

  if (!profile) return "";

  return String(profile.phone || profile.phoneNumber || "").trim();

}



/** Profile flags that mean the user completed phone verification in-app. */

export function profilePhoneMarkedVerified(profile: Record<string, unknown> | null | undefined): boolean {

  if (!profile) return false;

  return profile.phoneVerified === true || profile.verified === true;

}



/** True when the seller can list with Stripe (phone verified on profile or linked in Firebase Auth). */

export function profileHasVerifiedPhone(

  profile: Record<string, unknown> | null | undefined,

  authPhoneNumber?: string | null

): boolean {

  const authPhone = String(authPhoneNumber || "").trim();

  if (authPhone) return true;



  if (!profile) return false;

  const phone = profilePhoneNumber(profile);

  if (!phone) return false;

  return profilePhoneMarkedVerified(profile);

}



/** Why a user cannot create a paid listing (null = OK). */

export function getListingBlockReason(opts: {

  authEmailVerified: boolean;

  phone?: string;

  phoneVerified?: boolean;

  authPhoneNumber?: string | null;

  restricted?: boolean;

  profileExists?: boolean;

}): string | null {

  if (opts.restricted) {

    return "Your account is temporarily restricted.";

  }

  if (opts.profileExists === false) {

    return "Please complete your profile first.";

  }

  if (!opts.authEmailVerified) {

    return "Verify your email — check your inbox (and spam), then use “Refresh status” on Profile.";

  }



  const authPhone = String(opts.authPhoneNumber || "").trim();

  if (authPhone) return null;



  const phone = String(opts.phone || "").trim();

  const markedVerified = opts.phoneVerified === true;

  if (phone && markedVerified) return null;



  return "Add and verify your phone number in Identity verification on Profile.";

}



export function canCreateListing(opts: Parameters<typeof getListingBlockReason>[0]): boolean {

  return getListingBlockReason(opts) === null;

}


