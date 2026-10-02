import { getAuth } from "@/server/auth/auth";

// Better Auths endpoints: /api/auth/sign-in/email, /sign-up/email, /verify-email, osv.
export async function GET(request: Request) {
  return getAuth().handler(request);
}

export async function POST(request: Request) {
  return getAuth().handler(request);
}
