import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { collection, getDocs, query, where } from "firebase/firestore";
import { auth, db, storage } from "./firebase";

export interface JobApplication {
  id: string;
  listingId: string;
  listingTitle: string;
  employerEmail: string;
  employerId: string;
  applicantEmail: string;
  applicantName: string;
  applicantPhone: string;
  coverLetter: string;
  resumeURL?: string;
  resumeName?: string;
  status: "pending" | "reviewed" | "accepted" | "rejected";
  createdAt: import("firebase/firestore").Timestamp;
  reviewedAt?: import("firebase/firestore").Timestamp;
  employerNotes?: string;
}

export async function submitApplication(data: {
  listingId: string;
  listingTitle: string;
  employerEmail: string;
  employerId: string;
  applicantEmail: string;
  applicantName: string;
  applicantPhone: string;
  coverLetter: string;
  resumeFile?: File | null;
}): Promise<void> {
  let resumeURL = "";
  let resumeName = "";

  if (data.resumeFile) {
    const ext = data.resumeFile.name.split(".").pop();
    resumeName = data.resumeFile.name;
    const path = `resumes/${data.applicantEmail.replace(/[^a-zA-Z0-9]/g, "_")}/${Date.now()}.${ext}`;
    const storageRef = ref(storage, path);
    await uploadBytes(storageRef, data.resumeFile);
    resumeURL = await getDownloadURL(storageRef);
  }

  const token = await auth.currentUser?.getIdToken(true);
  if (!token) {
    throw new Error("Please sign in again");
  }

  const res = await fetch("/api/submit-job-application", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ ...data, resumeURL, resumeName }),
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(typeof body.error === "string" ? body.error : "Failed to submit application");
  }
}

export async function updateApplicationStatus(
  applicationId: string,
  status: "pending" | "reviewed" | "accepted" | "rejected",
  employerNotes?: string,
  listingTitle?: string,
  applicantEmail?: string,
  employerEmail?: string
): Promise<void> {
  const token = await auth.currentUser?.getIdToken(true);
  if (!token) {
    throw new Error("Please sign in again");
  }

  const res = await fetch("/api/update-job-application", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      applicationId,
      status,
      employerNotes,
    }),
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(typeof body.error === "string" ? body.error : "Failed to update application");
  }

  void listingTitle;
  void applicantEmail;
  void employerEmail;
}

export async function hasApplied(listingId: string, email: string): Promise<boolean> {
  const q = query(
    collection(db, "jobApplications"),
    where("listingId", "==", listingId),
    where("applicantEmail", "==", email)
  );
  const snap = await getDocs(q);
  return !snap.empty;
}
