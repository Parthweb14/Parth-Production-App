// src/middleware.ts
// Auth + RBAC gate. Public routes: /login, static assets.
import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

const PUBLIC = [
  "/login",
  "/forgot-password",
  "/verify-email",
  "/invoice",
  "/change-email/complete",
  "/change-email/verify",
];
const COOKIE = "kp_session";

async function payloadFromToken(
  token?: string
): Promise<{ role: "admin" | "employee"; mustChangePwd?: boolean } | null> {
  if (!token) return null;
  try {
    const secretStr = process.env.AUTH_SECRET;
    if (!secretStr || secretStr.trim().length < 8) return null;
    const secret = new TextEncoder().encode(secretStr);
    const { payload } = await jwtVerify(token, secret);
    const role = payload.role as "admin" | "employee" | undefined;
    if (!role) return null;
    return { role, mustChangePwd: Boolean(payload.mustChangePwd) };
  } catch {
    return null;
  }
}

function sanitizeRedirect(path: string): string {
  if (/^\/(?!\/)/.test(path) && !path.startsWith("//")) return path;
  return "/";
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return NextResponse.next();
  }

  const token = req.cookies.get(COOKIE)?.value;
  const session = await payloadFromToken(token);

  if (!session) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirect", sanitizeRedirect(pathname));
    return NextResponse.redirect(url);
  }

  // Force password change before any other app route.
  if (session.mustChangePwd && pathname !== "/change-password") {
    const url = req.nextUrl.clone();
    url.pathname = "/change-password";
    url.searchParams.set("force", "1");
    return NextResponse.redirect(url);
  }

  const ADMIN_ONLY = [
    "/inventory",
    "/categories",
    "/orders",
    "/finance",
    "/employees",
    "/teams",
    "/settings",
    "/email-change-requests",
  ];
  if (session.role === "employee" && ADMIN_ONLY.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|uploads|api).*)"],
};
