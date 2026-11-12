// Where to go after signing in or up: the page that sent them there (a space's invite link), from
// ?next=. Only a path on this site, never another site's address.
export function safeNextPath(raw: string | null | undefined): string | null {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return null;
  return /[\s\\]/.test(raw) ? null : raw;
}

/** The ?next= path of the current page, or null. Browser only. */
export function nextPathFromUrl(): string | null {
  return safeNextPath(new URLSearchParams(window.location.search).get("next"));
}

/** A sign-in or sign-up link that comes back to `path` afterwards. */
export function authLink(page: "/signin" | "/signup", path: string | null): string {
  return path ? `${page}?next=${encodeURIComponent(path)}` : page;
}
