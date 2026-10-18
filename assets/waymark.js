import { initializeApp, getApp, getApps } from "https://www.gstatic.com/firebasejs/13.0.0/firebase-app.js";

import {
  getAuth,
  GoogleAuthProvider,
  RecaptchaVerifier,
  signInWithPopup,
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
  apiKey: "AIzaSyDEvA6u-qaPVWX_hYgyd_rpn17DOgrgm8",
  authDomain: "way-mark-app.firebaseapp.com",
  projectId: "way-mark-app",
  storageBucket: "way-mark-app.firebasestorage.app",
  messagingSenderId: "746746866759",
  appId: "1:746746866759:web:715a0fcec40966157e9562",
  measurementId: "G-SZSLGEM065"
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
    let unsubscribe;

    unsubscribe = onAuthStateChanged(
      auth,
      (user) => {
        unsubscribe();
        resolve(user);
      },
      (error) => {
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

  const profile = await getProfile(user.uid);

  if (!profile?.onboardingComplete) {
    window.location.replace("onboarding.html");
    return;
  }

  window.location.replace("dashboard.html");
}

async function requireUser(options = {}) {
  const user = await waitForUser();

  if (!user) {
    const currentPage = window.location.pathname.split("/").pop();
    const next = currentPage && currentPage !== "login.html"
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
      console.warn("reCAPTCHA expired. Please verify again.");
    }
  });
}

export {
  app,
  auth,
  db,
  persistenceReady,
  waitForUser,
  getProfile,
  saveProfile,
  routeAfterLogin,
  requireUser,
  createRecaptcha,
  signInWithPopup,
  signInWithPhoneNumber,
  GoogleAuthProvider,
  googleProvider,
  signOut
};