"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { auth, db, onAuthStateChanged } from "../lib/firebase";
import { isDevAuthEnabled, getMockUser } from "../lib/dev-auth";

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
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user?.uid) {
        try {
          const profileSnap = await getDoc(doc(db, "profiles", user.uid));
          if (profileSnap.exists()) {
            setUsername(profileSnap.data().username || user.displayName || user.email?.split("@")[0] || "");
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
