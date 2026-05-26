"use client";

import { useState } from "react";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { storage } from "../lib/firebase";

interface Props {
  onUpload: (url: string, fileName: string, storagePath: string) => void;
}

export default function DigitalAssetUpload({ onUpload }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  async function handleUpload() {
    if (!file) return;
    setUploading(true);
    setProgress(0);
    try {
      const ext = file.name.split(".").pop();
      const path = `digital-assets/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
      const storageRef = ref(storage, path);
      const task = uploadBytesResumable(storageRef, file);
      task.on("state_changed", (snap) => {
        setProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100));
      });
      await task;
      const url = await getDownloadURL(storageRef);
      onUpload(url, file.name, path);
      setFile(null);
    } catch (e) {
      console.error("Upload failed:", e);
    }
    setUploading(false);
  }

  return (
    <div className="space-y-2">
      <input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)}
        className="w-full text-xs text-[var(--muted)] file:mr-2 file:rounded-lg file:border-0 file:bg-sky-500 file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-[var(--foreground)] hover:file:bg-sky-400" />
      {file && !uploading && (
        <button onClick={handleUpload}
          className="w-full rounded-xl bg-sky-500 py-2 text-xs font-bold text-[var(--foreground)] hover:bg-sky-400 transition">
          Upload File
        </button>
      )}
      {uploading && (
        <div className="space-y-1">
          <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-800">
            <div className="h-full rounded-full bg-sky-500 transition-all" style={{ width: `${progress}%` }} />
          </div>
          <p className="text-[10px] text-[var(--muted)]">{progress}%</p>
        </div>
      )}
    </div>
  );
}
