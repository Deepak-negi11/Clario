export const AUTH_TOKEN_KEY = "metaverse:token";
export const AUTH_EMAIL_KEY = "metaverse:email";

export function getAuthToken() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

export function saveAuthToken(token: string) {
  localStorage.setItem(AUTH_TOKEN_KEY, token);
}

export function removeAuthToken() {
  localStorage.removeItem(AUTH_TOKEN_KEY);
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
