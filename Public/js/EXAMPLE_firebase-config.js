//damit diese Datei funktioniert 
//-> Titel umbennen in firebase-config.js 
//-> Platzhalter unten (API, usw.) mit den Daten aus der Firebase Console ersetzen
//nur lokal anpassen und abspeichern

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
  appId: "1:123456..."
};

// App initialisieren
const app = initializeApp(firebaseConfig);

// Services exportieren
export const db = getFirestore(app);
export const auth = getAuth(app);
