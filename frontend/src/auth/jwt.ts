export interface AccessTokenClaims {
  sub: string;
  company_id: string;
  company_name: string;
  role: string;
  currency: string;
  iat: number;
  exp: number;
}

// Decodes the JWT payload client-side. This does NOT verify the signature —
// it's only used to read display claims (company_name, role, ...) that the
// backend already vouched for by issuing the token. Trust boundary is the
// backend accepting/rejecting the token on each request, not this decode.
export function decodeToken(token: string): AccessTokenClaims | null {
  try {
    const payload = token.split(".")[1];
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
    const json = decodeURIComponent(
      atob(padded)
        .split("")
        .map((c) => "%" + c.charCodeAt(0).toString(16).padStart(2, "0"))
        .join(""),
    );
    return JSON.parse(json) as AccessTokenClaims;
  } catch {
    return null;
  }
}

export function isTokenExpired(claims: AccessTokenClaims): boolean {
  return claims.exp * 1000 < Date.now();
}
