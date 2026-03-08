// To make this file work
//-> Rename the file to firebase-config.js
//-> Replace the placeholders below (API, etc.) with data from the Firebase Console
//Adjust and save locally only

// Import the functions you need from the SDKs you need
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "HIER_API_KEY_EINFÜGEN",
  authDomain: "projekt-name.firebaseapp.com",
  projectId: "projekt-name",
  storageBucket: "projekt-name.firebasestorage.app",
  messagingSenderId: "123456...",
  appId: "1:123456...",
};

// Initialize app
const app = initializeApp(firebaseConfig);

// Export services
export const db = getFirestore(app);
export const auth = getAuth(app);

