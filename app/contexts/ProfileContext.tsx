"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { auth, db, onAuthStateChanged } from "../lib/firebase";
import { BROWSE_POLL_MS, startVisibilityPolledFetch } from "../lib/polled-firestore";

interface ProfileContextType {
  username: string;
  setUsername: (username: string) => void;
}

const ProfileContext = createContext<ProfileContextType>({
  username: "",
  setUsername: () => {},
});

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const [username, setUsername] = useState("");

  useEffect(() => {
    let stopPoll: (() => void) | undefined;

    const authUnsub = onAuthStateChanged(auth, (user) => {
      stopPoll?.();
      stopPoll = undefined;

      if (!user?.uid) {
        setUsername("");
        return;
      }

      const uid = user.uid;
      let mounted = true;

      async function fetchProfile() {
        if (!mounted) return;
        try {
          const snap = await getDoc(doc(db, "profiles", uid));
          if (!mounted) return;
          setUsername(snap.exists() ? String(snap.data()?.username || "") : "");
        } catch (error) {
          console.error("ProfileContext fetch error:", error);
        }
      }

      const stop = startVisibilityPolledFetch(fetchProfile, BROWSE_POLL_MS);
      stopPoll = () => {
        mounted = false;
        stop();
      };
    });

    return () => {
      authUnsub();
      stopPoll?.();
    };
  }, []);

  return (
    <ProfileContext.Provider value={{ username, setUsername }}>
      {children}
    </ProfileContext.Provider>
  );
}

export function useProfile() {
  return useContext(ProfileContext);
}
