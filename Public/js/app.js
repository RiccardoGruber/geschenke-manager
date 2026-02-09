import { onAuthStateChanged, signInAnonymously } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { addDoc, collection, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { auth, db } from './firebase-config.js';
import { isLoggedIn } from "./auth-adapter.js";

/**
 * Wenn nicht eingeloggt, zurück zur Login-Seite.
 * (Aktuell UI-Login; später kann isLoggedIn() Firebase Auth nutzen.)
 */
if (!isLoggedIn()) {
  window.location.href = "./login.html";
}

// UI Referenzen
const statusBadge = document.getElementById('system-status');
const consoleOutput = document.getElementById('console-output');

// Status-Update Funktion
const updateStatus = (isOnline, message) => {
    if (isOnline) {
        statusBadge.className = "badge bg-success rounded-pill px-3 py-2";
        statusBadge.innerHTML = `<i class="bi bi-wifi me-1"></i> System Status: Online`;
        consoleOutput.className = "alert alert-success border small mt-2";
        consoleOutput.innerHTML = `<i class="bi bi-check-circle-fill me-2"></i> ${message}`;
        console.log("Firebase verbunden!"); 
    } else {
        statusBadge.className = "badge bg-danger rounded-pill px-3 py-2";
        statusBadge.innerHTML = `<i class="bi bi-exclamation-triangle-fill me-1"></i> System Status: Error`;
        consoleOutput.className = "alert alert-danger border small mt-2";
        consoleOutput.innerHTML = `<i class="bi bi-x-circle-fill me-2"></i> ${message}`;
    }
};

// Verbindungstest
const runConnectionTest = async (user) => {
    try {
        // Wir schreiben in 'connection_tests'
        await addDoc(collection(db, 'connection_tests'), {
            message: "Verbindungstest erfolgreich",
            timestamp: serverTimestamp(),
            userId: user.uid,
            userAgent: navigator.userAgent
        });
        
        updateStatus(true, "Firebase verbunden! Test-Dokument erstellt.");
    } catch (error) {
        console.error("Firestore Error:", error);
        updateStatus(false, "Datenbankfehler: " + error.message);
    }
};

// Start-Logik
const initApp = async () => {
    try {
        // 1. Authentifizierung (Anonym für den Start)
        await signInAnonymously(auth);
        
        // 2. Warten auf Auth-Bestätigung, dann Test starten
        onAuthStateChanged(auth, (user) => {
            if (user) {
                console.log("Angemeldet als:", user.uid);
                runConnectionTest(user);
            }
        });
    } catch (error) {
        updateStatus(false, "Auth Fehler: " + error.message);
    }
};

// App starten
initApp();