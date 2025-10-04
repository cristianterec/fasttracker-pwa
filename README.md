# FastTrackers PWA

FastTrackers est une mini application PWA sans build tool qui aide les urgentistes à créer et suivre leurs patients tout en respectant le principe **privacy-by-design (Option A)** :

- le médecin saisit un nom de famille et un motif, mais **seul un code patient et le motif** partent sur Firestore ;
- les noms sont enregistrés localement (IndexedDB puis localStorage en secours) pour rester visibles sur l’appareil courant ;
- une bannière rappelle que les noms ne quittent jamais l’appareil.

## Démarrage

1. Créez un projet Firebase et mettez à jour `firebaseConfig` dans `src/js/main.js`.
2. Activez l’authentification par e-mail/mot de passe dans la console Firebase.
3. Déployez les règles Firestore ci-dessous pour empêcher tout champ `lastName` côté serveur.
4. Ouvrez `index.html` depuis un serveur statique (Vercel, Firebase Hosting, `npx serve`, etc.).

## Structure des modules

- `src/js/ids.js` : génération sécurisée des codes patients (`PX-7F3K9`).
- `src/js/localNames.js` : stockage local des noms (`saveLocalName`, `getLocalName`, `getManyLocalNames`).
- `src/js/patients.js` : appels Firestore (création + écoute temps réel) avec purge systématique de `lastName`.
- `src/js/ui.js` : rendu du tableau et toasts « Copier le code ».
- `src/js/main.js` : initialisation Firebase/Auth, formulaires et filtrage côté client.

## Règles Firestore à déployer

```text
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function signedIn() { return request.auth != null; }

    match /patients/{id} {
      allow create: if signedIn() &&
        request.resource.data.doctorId == request.auth.uid &&
        !("lastName" in request.resource.data);
      allow read: if signedIn() && resource.data.doctorId == request.auth.uid;
      allow update, delete: if signedIn() &&
        resource.data.doctorId == request.auth.uid &&
        !("lastName" in request.resource.data);
    }
  }
}
```

## Conseils d’utilisation

- Le tableau liste uniquement les patients du médecin connecté, classés du plus récent au plus ancien.
- Le champ de recherche filtre côté client (nom local ou motif).
- Si un nom local manque, utilisez l’action « Ajouter/Modifier le nom » : seules les données locales sont mises à jour.
- Utilisez le toast pour copier rapidement le code patient et l’inscrire dans le dossier médical.

## Développement

Le projet n’utilise aucun bundler : tout est en ES modules. Modifiez les fichiers dans `src/js/` puis rechargez le navigateur.
