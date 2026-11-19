// User-facing messages for Firebase Authentication error codes and DigiVote's Firebase API errors.
const MESSAGES = {
  'auth/email-already-in-use': 'An account with this email already exists. Sign in instead, or reset your password.',
  'auth/invalid-credential': 'Incorrect email or password.',
  'auth/wrong-password': 'Incorrect email or password.',
  'auth/user-not-found': 'Incorrect email or password.',
  'auth/invalid-email': 'Enter a valid email address.',
  'auth/weak-password': 'Choose a stronger password (at least 6 characters; DigiVote recommends 10+ with letters and digits).',
  'auth/missing-password': 'Enter your password.',
  'auth/too-many-requests': 'Too many attempts. Wait a few minutes and try again.',
  'auth/user-disabled': 'This account has been disabled.',
  'auth/network-request-failed': 'Network error. Check your connection and try again.',
  'auth/popup-closed-by-user': 'The Google sign-in window was closed before finishing.',
  'auth/cancelled-popup-request': 'The Google sign-in window was closed before finishing.',
  'auth/popup-blocked': 'Your browser blocked the Google sign-in window. Allow pop-ups for this site.',
  'auth/unauthorized-domain': 'This site is not an authorized domain in the Firebase project.',
  'auth/operation-not-allowed': 'This sign-in method is not enabled in the Firebase project.',
  'auth/account-exists-with-different-credential': 'This email already uses another sign-in method. Sign in with that method first.',
  'auth/expired-action-code': 'This link has expired. Request a new one.',
  'auth/invalid-action-code': 'This link is invalid or has already been used. Request a new one.',
  'auth/email-not-verified': 'Verify your email address first. We sent a link to your inbox.',
  'auth/no-current-user': 'Sign in again to continue.',
  'app/not-configured': 'Firebase sign-in is not configured for this deployment.',
  EMAIL_NOT_VERIFIED: 'Verify your email address first. We sent a link to your inbox.',
  NO_ACCOUNT: 'No DigiVote account uses this email yet. Register an organization, or accept your invitation with its activation code.',
  ACTIVATION_REQUIRED: 'You have a pending invitation. Accept it on the Activate page with your activation code.',
  ALREADY_LINKED: 'This DigiVote account is already linked to a different sign-in.',
  EMAIL_IN_USE: 'A DigiVote account already uses this email. Sign in instead.',
  FIREBASE_TOKEN_EXPIRED: 'Your sign-in expired. Please sign in again.',
  FIREBASE_TOKEN_REVOKED: 'Your sign-in was revoked. Please sign in again.',
  FIREBASE_TOKEN_INVALID: 'Sign-in could not be verified. Please try again.',
  FIREBASE_DISABLED: 'Firebase sign-in is not enabled on the server.',
};

export function firebaseErrorMessage(error, fallback = 'Sign-in failed. Please try again.') {
  const apiCode = error?.response?.data?.code;
  if (apiCode && MESSAGES[apiCode]) return MESSAGES[apiCode];
  if (error?.response?.data?.message) return error.response.data.message;
  if (error?.code && MESSAGES[error.code]) return MESSAGES[error.code];
  return fallback;
}
