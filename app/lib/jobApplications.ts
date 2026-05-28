import { addDoc, collection, doc, getDocs, query, serverTimestamp, Timestamp, updateDoc, where } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "./firebase";
import { createNotification } from "./notifications";

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
  createdAt: Timestamp;
  reviewedAt?: Timestamp;
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

  await addDoc(collection(db, "jobApplications"), {
    listingId: data.listingId,
    listingTitle: data.listingTitle,
    employerEmail: data.employerEmail,
    employerId: data.employerId,
    applicantEmail: data.applicantEmail,
    applicantName: data.applicantName,
    applicantPhone: data.applicantPhone,
    coverLetter: data.coverLetter,
    resumeURL,
    resumeName,
    status: "pending",
    createdAt: serverTimestamp(),
  });

  await createNotification({
    targetEmail: data.employerEmail,
    fromEmail: data.applicantEmail,
    type: "job_application",
    title: `New application for "${data.listingTitle}"`,
    message: `${data.applicantName} has applied for your job listing.`,
    listingId: data.listingId,
    listingTitle: data.listingTitle,
  });
}

export async function updateApplicationStatus(
  applicationId: string,
  status: "pending" | "reviewed" | "accepted" | "rejected",
  employerNotes?: string
): Promise<void> {
  const updateData: any = {
    status,
    reviewedAt: serverTimestamp(),
  };
  if (employerNotes !== undefined) updateData.employerNotes = employerNotes;
  await updateDoc(doc(db, "jobApplications", applicationId), updateData);
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
