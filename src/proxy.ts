import { NextResponse, type NextRequest } from "next/server";
import { checkBetaAccess, parseBetaUsers } from "@/lib/beta-access";

const users = parseBetaUsers(process.env.BETA_USERS);
const isProduction = process.env.NODE_ENV === "production";

export function proxy(request: NextRequest) {
  const decision = checkBetaAccess(
    request.headers.get("authorization"),
    users,
    isProduction,
  );
  if (decision === "allow") return NextResponse.next();
  if (decision === "closed") {
    return new NextResponse("Accès beta non configuré (BETA_USERS).", { status: 503 });
  }
  return new NextResponse("Accès réservé aux testeurs de la beta.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="DatavizRent beta", charset="UTF-8"' },
  });
}

export const config = {
  // Everything except static assets, the host health check and the cron
  // endpoint (which checks its own bearer token).
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/health|api/cron).*)"],
};
