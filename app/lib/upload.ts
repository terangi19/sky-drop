import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "./firebase";

export async function uploadImage(
  file: File,
  path: string
): Promise<string> {
  const storageRef = ref(storage, path);
  const snapshot = await uploadBytes(storageRef, file);
  return getDownloadURL(snapshot.ref);
}

export async function uploadImageDataURL(
  dataURL: string,
  path: string
): Promise<string> {
  const res = await fetch(dataURL);
  const blob = await res.blob();
  const file = new File([blob], "image.jpg", { type: "image/jpeg" });
  return uploadImage(file, path);
}
