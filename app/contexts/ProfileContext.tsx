"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../lib/firebase";

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
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser?.uid) {
        try {
          const profileSnap = await getDoc(doc(db, "profiles", currentUser.uid));
          if (profileSnap.exists()) {
            setUsername(profileSnap.data().username || "");
          }
        } catch (error) {
          console.error(error);
        }
      } else {
        setUsername("");
      }
    });
    return () => unsubscribe();
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
