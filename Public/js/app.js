import { /* removed signInAnonymously */ } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { addDoc, collection, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { auth, db } from './firebase-config.js';
import { USE_FIREBASE_AUTH, waitForUserOnce, isAuthed } from "./auth-adapter.js";

// Start-Logic: respect USE_FIREBASE_AUTH flag. Do not force redirect when UI-login used.
const startApp = async () => {
    if (USE_FIREBASE_AUTH) {
        const user = await waitForUserOnce();
        if (!user) {
            window.location.href = "./login.html";
            return;
        }
        // only when firebase auth is used we run connection test that writes data
        await runConnectionTest(user);
        return;
    }

    // UI-login mode: optionally update status badge but don't redirect
    const authed = isAuthed();
    if (authed) {
        // if UI shows authed, we can attempt a non-writing status
        updateStatus(true, 'UI-Login aktiv (kein Firestore-Write)');
    } else {
        updateStatus(false, 'Nicht eingeloggt (UI-Login)');
    }
};

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
        // Wir schreiben in 'users/{uid}/connection_tests' (nur wenn Firebase-Auth aktiv)
            await addDoc(collection(db, 'users', user.uid, 'connection_tests'), {
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

// App starten
startApp().catch(err => {
    updateStatus(false, 'Init Fehler: ' + (err?.message || err));
});