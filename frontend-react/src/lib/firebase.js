// Optional Firebase web integration. Everything here is a no-op unless VITE_FIREBASE_API_KEY is set.
// Only public web configuration is used in the browser; Admin credentials live on the server only.

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

export const firebaseConfigured = Boolean(config.apiKey && config.projectId && config.appId);
export const firebaseAppCheckConfigured = firebaseConfigured && Boolean(import.meta.env.VITE_FIREBASE_APP_CHECK_SITE_KEY);

let appPromise = null;

function getApp() {
  if (!firebaseConfigured) return Promise.resolve(null);
  if (!appPromise) {
    appPromise = import('firebase/app').then(async ({ initializeApp }) => {
      const app = initializeApp(config);
      const siteKey = import.meta.env.VITE_FIREBASE_APP_CHECK_SITE_KEY;
      if (siteKey) {
        const { initializeAppCheck, ReCaptchaV3Provider } = await import('firebase/app-check');
        initializeAppCheck(app, { provider: new ReCaptchaV3Provider(siteKey), isTokenAutoRefreshEnabled: true });
      }
      return app;
    });
  }
  return appPromise;
}

/** Privacy-conscious analytics: page views only, no user ids, no election or ballot data. */
export function initFirebaseAnalytics() {
  if (!firebaseConfigured || !config.measurementId) return;
  getApp().then(async (app) => {
    const { getAnalytics, isSupported, setAnalyticsCollectionEnabled } = await import('firebase/analytics');
    if (await isSupported()) {
      const analytics = getAnalytics(app);
      setAnalyticsCollectionEnabled(analytics, true);
    }
  }).catch(() => {});
}

let authPromise = null;

/** Firebase Auth instance (connected to the local Auth emulator when VITE_FIREBASE_AUTH_EMULATOR_HOST is set). */
export function getFirebaseAuth() {
  if (!authPromise) {
    authPromise = getApp().then(async (app) => {
      if (!app) throw Object.assign(new Error('Firebase is not configured for this deployment.'), { code: 'app/not-configured' });
      const { getAuth, connectAuthEmulator } = await import('firebase/auth');
      const auth = getAuth(app);
      const emulator = import.meta.env.VITE_FIREBASE_AUTH_EMULATOR_HOST;
      if (emulator) connectAuthEmulator(auth, `http://${emulator}`, { disableWarnings: true });
      return auth;
    });
  }
  return authPromise;
}

/** Where verification and password-reset emails send the user afterwards. */
function actionSettings() {
  return { url: `${window.location.origin}/login` };
}

/** Google sign-in through Firebase Authentication; returns a Firebase ID token for the backend to verify. */
export async function signInWithGoogle() {
  const auth = await getFirebaseAuth();
  const { GoogleAuthProvider, signInWithPopup } = await import('firebase/auth');
  const result = await signInWithPopup(auth, new GoogleAuthProvider());
  return result.user.getIdToken(true);
}

/** Creates a Firebase email/password account and sends the verification email. Returns the (unverified) user. */
export async function registerWithEmail(email, password) {
  const auth = await getFirebaseAuth();
  const { createUserWithEmailAndPassword, sendEmailVerification } = await import('firebase/auth');
  const { user } = await createUserWithEmailAndPassword(auth, email, password);
  await sendEmailVerification(user, actionSettings());
  return user;
}

/**
 * Signs in with Firebase email/password. Throws `auth/email-not-verified` (after keeping the user signed in to
 * Firebase so the verification email can be resent) when the address is not verified yet.
 */
export async function signInWithEmail(email, password) {
  const auth = await getFirebaseAuth();
  const { signInWithEmailAndPassword } = await import('firebase/auth');
  const { user } = await signInWithEmailAndPassword(auth, email, password);
  await user.reload();
  if (!user.emailVerified) {
    throw Object.assign(new Error('Email not verified'), { code: 'auth/email-not-verified' });
  }
  return user.getIdToken(true);
}

/** Re-checks the signed-in Firebase user; returns a fresh ID token once the email is verified, otherwise null. */
export async function verifiedIdTokenOrNull() {
  const auth = await getFirebaseAuth();
  const user = auth.currentUser;
  if (!user) return null;
  await user.reload();
  return user.emailVerified ? user.getIdToken(true) : null;
}

export async function resendVerificationEmail() {
  const auth = await getFirebaseAuth();
  const { sendEmailVerification } = await import('firebase/auth');
  if (!auth.currentUser) throw Object.assign(new Error('Sign in again first'), { code: 'auth/no-current-user' });
  await sendEmailVerification(auth.currentUser, actionSettings());
}

export async function sendPasswordReset(email) {
  const auth = await getFirebaseAuth();
  const { sendPasswordResetEmail } = await import('firebase/auth');
  await sendPasswordResetEmail(auth, email, actionSettings());
}

/** Email action links (verification / password reset) handled by the /auth/action page. */
export async function applyEmailVerification(oobCode) {
  const auth = await getFirebaseAuth();
  const { applyActionCode } = await import('firebase/auth');
  await applyActionCode(auth, oobCode);
}

export async function checkPasswordResetCode(oobCode) {
  const auth = await getFirebaseAuth();
  const { verifyPasswordResetCode } = await import('firebase/auth');
  return verifyPasswordResetCode(auth, oobCode);
}

export async function completePasswordReset(oobCode, newPassword) {
  const auth = await getFirebaseAuth();
  const { confirmPasswordReset } = await import('firebase/auth');
  await confirmPasswordReset(auth, oobCode, newPassword);
}

export async function firebaseSignOut() {
  if (!firebaseConfigured) return;
  try {
    const auth = await getFirebaseAuth();
    const { signOut } = await import('firebase/auth');
    await signOut(auth);
  } catch {
    /* already signed out */
  }
}

/** App Check token for protected endpoints (null when App Check is not configured). */
export async function appCheckToken() {
  const app = await getApp();
  if (!app || !import.meta.env.VITE_FIREBASE_APP_CHECK_SITE_KEY) return null;
  const { getAppCheck, getToken } = await import('firebase/app-check');
  return (await getToken(getAppCheck(app))).token;
}

/** Registers this browser for Firebase Cloud Messaging and returns its token (null if unavailable). */
export async function requestPushToken() {
  const app = await getApp();
  if (!app || !import.meta.env.VITE_FIREBASE_VAPID_KEY) return null;
  const { getMessaging, getToken, isSupported } = await import('firebase/messaging');
  if (!(await isSupported())) return null;
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return null;
  return getToken(getMessaging(app), { vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY });
}
