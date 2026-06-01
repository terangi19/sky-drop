"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, db, onAuthStateChanged } from "../lib/firebase";

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
    let profileUnsub: (() => void) | undefined;

    const authUnsub = onAuthStateChanged(auth, (user) => {
      profileUnsub?.();
      profileUnsub = undefined;

      if (!user?.uid) {
        setUsername("");
        return;
      }

      profileUnsub = onSnapshot(
        doc(db, "profiles", user.uid),
        (snap) => {
          setUsername(snap.exists() ? String(snap.data()?.username || "") : "");
        },
        (error) => {
          console.error("ProfileContext snapshot error:", error);
        }
      );
    });

    return () => {
      authUnsub();
      profileUnsub?.();
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
