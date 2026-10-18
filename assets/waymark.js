import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/13.0.0/firebase-app.js";

import {
  getAuth,
  GoogleAuthProvider,
  RecaptchaVerifier,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signInWithPhoneNumber,
  setPersistence,
  browserLocalPersistence,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/13.0.0/firebase-auth.js";

import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/13.0.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDEvA6u-qa6PVWX_hYgydr_pn17DOgrgm8",
  authDomain: "way-mark-app.firebaseapp.com",
  projectId: "way-mark-app",
  storageBucket: "way-mark-app.firebasestorage.app",
  messagingSenderId: "746746866759",
  appId: "1:746746866759:web:2fd78631f814d63c7e9562",
  measurementId: "G-V0FYKMSJ93"
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

const auth = getAuth(app);
const db = getFirestore(app);

const googleProvider = new GoogleAuthProvider();

googleProvider.setCustomParameters({
  prompt: "select_account"
});

const persistenceReady = setPersistence(auth, browserLocalPersistence);

function waitForUser() {
  return new Promise((resolve, reject) => {
    const unsubscribe = onAuthStateChanged(
      auth,
      user => {
        unsubscribe();
        resolve(user);
      },
      error => {
        unsubscribe();
        reject(error);
      }
    );
  });
}

function profileRef(uid) {
  return doc(db, "users", uid);
}

async function getProfile(uid) {
  const snapshot = await getDoc(profileRef(uid));

  return snapshot.exists() ? snapshot.data() : null;
}

async function saveProfile(uid, data) {
  if (!auth.currentUser || auth.currentUser.uid !== uid) {
    throw new Error("You can only update your own profile.");
  }

  await setDoc(
    profileRef(uid),
    {
      ...data,
      updatedAt: serverTimestamp()
    },
    { merge: true }
  );
}

async function routeAfterLogin(user) {
  if (!user) {
    window.location.replace("login.html");
    return;
  }

  const next = new URLSearchParams(window.location.search).get("next");

  if (
    next &&
    /^[a-zA-Z0-9_-]+\.html$/.test(next) &&
    !["login.html", "index.html", "onboarding.html"].includes(next)
  ) {
    const profile = await getProfile(user.uid);

    if (!profile?.onboardingComplete) {
      window.location.replace("onboarding.html");
      return;
    }

    window.location.replace(next);
    return;
  }

  const profile = await getProfile(user.uid);

  window.location.replace(
    profile?.onboardingComplete
      ? "dashboard.html"
      : "onboarding.html"
  );
}

async function requireUser(options = {}) {
  await persistenceReady;

  const user = await waitForUser();

  if (!user) {
    const currentPage = window.location.pathname.split("/").pop();

    const next =
      currentPage && currentPage.endsWith(".html")
        ? `?next=${encodeURIComponent(currentPage)}`
        : "";

    window.location.replace(`login.html${next}`);
    return null;
  }

  if (options.checkOnboarding !== false) {
    const profile = await getProfile(user.uid);

    if (!profile?.onboardingComplete) {
      window.location.replace("onboarding.html");
      return null;
    }
  }

  return user;
}

function createRecaptcha(containerId) {
  return new RecaptchaVerifier(auth, containerId, {
    size: "normal",
    callback: () => {},
    "expired-callback": () => {
      console.warn("reCAPTCHA expired.");
    }
  });
}

export {
  app,
  auth,
  db,
  firebaseConfig,
  persistenceReady,
  waitForUser,
  getProfile,
  saveProfile,
  routeAfterLogin,
  requireUser,
  createRecaptcha,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signInWithPhoneNumber,
  GoogleAuthProvider,
  googleProvider,
  signOut
};