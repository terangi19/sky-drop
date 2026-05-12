import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyDwIex86XMiqO5FIxl_Uhck1pbCX8O32yI",
  authDomain: "sky-drop-de459.firebaseapp.com",
  databaseURL: "https://sky-drop-de459-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "sky-drop-de459",
  storageBucket: "sky-drop-de459.firebasestorage.app",
  messagingSenderId: "564551137643",
  appId: "1:564551137643:web:8d64159394b148fc09b42e",
  measurementId: "G-24M12L6HFB",
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);