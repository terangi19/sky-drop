"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import type { User } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { checkImage } from "../lib/nsfw";
import { kycSubmitErrorMessage, notifyKycSubmitted, submitKycPhoto } from "../lib/kyc-submit.client";
import { showToast } from "./Toast";

type Props = {
  user: User | null;
  onKycStatusChange?: (status: string) => void;
};

const KYC_DESCRIPTION =
  "To list items for sale on Sky Drop, complete ID verification — upload photos of your driver licence or passport (front and back). Phone verification is optional and adds a verified seller badge. You can still browse and buy items without completing seller verification.";

function KycCallout({ children }: { children: ReactNode }) {
  return (
    <div className="login-kyc-callout mt-6 rounded-xl border p-4">
      {children}
    </div>
  );
}

export default function LoginKycSection({ user, onKycStatusChange }: Props) {
  // KYC functionality hidden for now
  return null;
}
