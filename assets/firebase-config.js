// ==========================================================================
// Configuration Firebase — Lar'Allegria by Lara Rossoux
// ==========================================================================
// Config du projet Firebase "Lar-allegria" — déjà branchée. Voir le
// README.md pour la marche à suivre complète (Auth + Firestore + compte
// admin + déploiement).
import { initializeApp, deleteApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
  createUserWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
  getFirestore,
  doc, getDoc, getDocFromServer, setDoc, updateDoc, deleteDoc,
  collection, addDoc, getDocs, query, where, orderBy,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDjm0tOjFpQ3V5_zEYyKsMf_X7F9bLx1ek",
  authDomain: "lar-allegria.firebaseapp.com",
  projectId: "lar-allegria",
  storageBucket: "lar-allegria.firebasestorage.app",
  messagingSenderId: "34458197374",
  appId: "1:34458197374:web:0c7796accee50865dc672f"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

export {
  signInWithEmailAndPassword, signOut, onAuthStateChanged,
  updatePassword, reauthenticateWithCredential, EmailAuthProvider,
  createUserWithEmailAndPassword, initializeApp, deleteApp, getAuth,
  doc, getDoc, getDocFromServer, setDoc, updateDoc, deleteDoc,
  collection, addDoc, getDocs, query, where, orderBy,
  serverTimestamp
};

// Crée un compte Firebase Authentication (identifiant + mot de passe) sans
// déconnecter la personne actuellement connectée (Lara, l'admin). Le SDK
// Firebase connecte automatiquement le nouveau compte créé sur l'instance
// "auth" utilisée — on utilise donc une seconde instance d'app temporaire,
// isolée, qu'on détruit juste après. Retourne l'UID du nouveau compte.
export async function creerCompteMembre(identifiant, motDePasse) {
  const appTemp = initializeApp(firebaseConfig, 'temp-' + Date.now());
  const authTemp = getAuth(appTemp);
  try {
    const cred = await createUserWithEmailAndPassword(authTemp, identifiantVersEmail(identifiant), motDePasse);
    const uid = cred.user.uid;
    await signOut(authTemp);
    return uid;
  } finally {
    await deleteApp(appTemp);
  }
}

// Réinitialise le mot de passe d'un compte existant (utilisé par le super-
// administrateur pour changer le mot de passe de n'importe quel compte).
// On se connecte brièvement à ce compte avec son mot de passe ACTUEL connu
// (via une app temporaire isolée, sans déconnecter la personne en cours),
// puis on définit le nouveau mot de passe. C'est pour cela que le mot de
// passe en clair de chaque compte doit être conservé dans Firestore : sans
// Cloud Functions (plan Spark), il n'existe pas d'autre moyen de changer le
// mot de passe d'un compte tiers depuis le site.
export async function reinitialiserMotDePasseCompte(identifiant, ancienMotDePasse, nouveauMotDePasse) {
  const appTemp = initializeApp(firebaseConfig, 'temp-' + Date.now());
  const authTemp = getAuth(appTemp);
  try {
    const cred = await signInWithEmailAndPassword(authTemp, identifiantVersEmail(identifiant), ancienMotDePasse);
    await updatePassword(cred.user, nouveauMotDePasse);
    await signOut(authTemp);
  } finally {
    await deleteApp(appTemp);
  }
}

// Les identifiants membres/admin ne sont pas de vraies adresses e-mail.
// On les transforme en "faux e-mail" pour utiliser l'authentification
// Firebase par e-mail/mot de passe avec un simple identifiant
// (ex: "Lara" -> "lara@membres.lar-allegria.local").
export function identifiantVersEmail(identifiant) {
  return identifiant.trim().toLowerCase() + "@membres.lar-allegria.local";
}

// Transforme les liens (http://, https://, www.) présents dans un texte
// libre (bio, description, article de blog...) en liens cliquables, tout en
// échappant le reste du texte pour rester sûr vis-à-vis du HTML.
export function linkify(texte) {
  const echappe = (texte || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  return echappe.replace(/(https?:\/\/[^\s<]+|www\.[^\s<]+)/g, (match) => {
    const href = match.startsWith('http') ? match : 'https://' + match;
    return `<a href="${href}" target="_blank" rel="noopener noreferrer">${match}</a>`;
  });
}

// Interdit tout caractère spécial dans les identifiants et mots de passe
// (lettres avec ou sans accent, chiffres uniquement — pas d'espace, pas de
// ponctuation, pas de symbole).
const REGEX_SANS_CARACTERES_SPECIAUX = /^[A-Za-zÀ-ÖØ-öø-ÿ0-9]+$/;
export function identifiantValide(identifiant) {
  return REGEX_SANS_CARACTERES_SPECIAUX.test(identifiant || '');
}
export function motDePasseValide(motDePasse) {
  return REGEX_SANS_CARACTERES_SPECIAUX.test(motDePasse || '');
}

// Lecture d'un document avec plusieurs tentatives (absorbe un éventuel
// petit délai de propagation Firestore juste après une modification).
export async function getDocAvecReessai(refDoc, maxEssais = 3, delaiMs = 900) {
  let d = null;
  for (let i = 0; i < maxEssais; i++) {
    d = await getDoc(refDoc);
    if (d.exists()) return d;
    if (i < maxEssais - 1) await new Promise(r => setTimeout(r, delaiMs));
  }
  return d;
}
