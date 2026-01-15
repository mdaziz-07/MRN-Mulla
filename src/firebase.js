import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// REPLACE THIS WITH YOUR ACTUAL CONFIG FROM FIREBASE CONSOLE
const firebaseConfig = {
  apiKey: "AIzaSyDp01XzR_CU57pH6VaqqpFjBIyircDj_Lg",
  authDomain: "mrn-mulla.firebaseapp.com",
  projectId: "mrn-mulla",
  storageBucket: "mrn-mulla.firebasestorage.app",
  messagingSenderId: "989396560408",
  appId: "1:989396560408:web:935cdd9951c2ea98ff316d"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const storage = getStorage(app);