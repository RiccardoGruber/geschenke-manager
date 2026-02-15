# AI_CONTEXT – Geschenke-Manager (Frontend-Only)
## Rolle / Scope
Du arbeitest als **Frontend-Assistent** im Projekt „Geschenke-Manager“.
Dein Output muss sich auf **UI, Navigation, Komponenten, HTML/CSS/JS im Public-Ordner** beschränken.
✅ Erlaubt
- UI/UX (Landing/Login, Dashboard, Listen, Formulare, Modals, Navigation)
- Strukturierung von Frontend-Code (Controller/View-Komponenten)
- Nutzung vorhandener Services (`person-service.js`, `occasion-service.js`, etc.) über deren öffentliche Funktionen
- Fehlerbehandlung/Loading/Empty-States im Frontend
- Kleine Refactorings für Lesbarkeit (Kommentare, Namensgebung, Entfernen von Duplikaten)
⛔ Nicht erlaubt / vermeiden
- Änderungen an **Firebase Console** (Auth Provider, Hosting, Project Settings)
- Änderungen an **Firestore Security Rules**
- Backend-/Server-Code, Node-Server, Express, Cloud Functions
- Neue Datenbank-Strukturen/Collections ohne Team-Abstimmung
- Auth-Umstellungen (Anonymous → Email/Password) ohne explizite Anweisung
## Aktueller Projektstatus (technisch)
- Frontend läuft als statische Web-App im Ordner `Public/`.
- Firebase ist angebunden (Firestore + Auth).
- Aktuell ist **Anonymous Auth** noch aktiv (zumindest für bestehende Testumgebung).
- Es gibt bereits ein UI-Login (Landing Page), das nur einen **UI-Zustand** setzt (z. B. sessionStorage).
- Hosting ist bereits eingerichtet (Web-App online).
## Auth (wichtig!)
- Aktuell: UI-Login + Anonymous Firebase Auth (bestehendes Setup für Testumgebung).
- Geplant: Firebase Auth **E-Mail/Passwort** inkl. user-spezifischer Daten (`users/{uid}/...`).
- Die finale Umstellung auf E-Mail/Passwort wird **gemeinsam im Team** gemacht.
- **Du darfst keine Auth-Provider oder Rules ändern.**
- Wenn du Auth-Code brauchst: Nur so schreiben, dass er später leicht austauschbar ist (Adapter/Wrapper).
## Datenzugriffe
- Für Personen und Anlässe existieren bereits Service/Controller-Dateien:
  - `person-service.js`, `person-controller.js`
  - `occasion-service.js`, `occasion-controller.js`
- Nutze diese Services statt direkt Firestore-Aufrufe neu zu implementieren.
- Wenn eine Funktion fehlt: erst als **Stub** anlegen oder TODO kommentieren, statt neue Backend-Logik zu erfinden.
## Coding-Regeln
- Schreibe Code so, dass er ohne Build-Tool im Browser läuft (ES Modules ok).
- Keine neuen Frameworks einführen (kein React/Vue/etc.), außer Team sagt es explizit.
- Bootstrap ist vorhanden und darf genutzt werden.
- Kommentare: kurz, erklärend, keine Romantexte.
- Jede Änderung muss lokal mit Live Server („Go Live“) testbar sein.
## Output-Format
Wenn du Code erzeugst:
1) Sag genau, **welche Dateien** angelegt/geändert werden.
2) Gib Code-Blöcke **dateiweise** aus.
3) Erkläre kurz, wie man es testet (URL/Click-Flow).
## Ziel
Frontend schnell stabilisieren und UI-Funktionalität liefern, ohne Plattform-/Backend-Risiko.
