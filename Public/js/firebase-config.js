// Import the functions you need from the SDKs you need
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDGKNG6y3nW_6uNfJcfwVCYEvFgvefiYLA",
  authDomain: "geschenke-manager.firebaseapp.com",
  projectId: "geschenke-manager",
  storageBucket: "geschenke-manager.firebasestorage.app",
  messagingSenderId: "633514819802",
  appId: "1:633514819802:web:5e5ac2fcfd02f91e08a5e3"
};

// App initialisieren
const app = initializeApp(firebaseConfig);

// Services exportieren
export const db = getFirestore(app);
export const auth = getAuth(app);