export const AUTH_TOKEN_KEY = "metaverse:token";
export const AUTH_EMAIL_KEY = "metaverse:email";
// Set while the token is a guest's (joined a space from its link without an account).
const GUEST_KEY = "metaverse:guest";

export function getAuthToken() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

export function saveAuthToken(token: string, guest = false) {
  localStorage.setItem(AUTH_TOKEN_KEY, token);
  if (guest) localStorage.setItem(GUEST_KEY, "1");
  else localStorage.removeItem(GUEST_KEY);
}

export function removeAuthToken() {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(GUEST_KEY);
}

/** Whether the saved token is a guest's; signing in or up replaces it. */
export function isGuestSession() {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(GUEST_KEY) === "1" && !!localStorage.getItem(AUTH_TOKEN_KEY);
}

export function getAuthEmail() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(AUTH_EMAIL_KEY);
}

export function saveAuthEmail(email: string) {
  localStorage.setItem(AUTH_EMAIL_KEY, email);
}

export function removeAuthEmail() {
  localStorage.removeItem(AUTH_EMAIL_KEY);
}
