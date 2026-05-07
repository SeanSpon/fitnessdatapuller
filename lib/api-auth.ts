import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export function bearerToken(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const [scheme, token] = authorization.split(" ");
  return scheme?.toLowerCase() === "bearer" ? token : null;
}

export async function requireUserId() {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    throw new Error("Unauthorized");
  }

  return userId;
}

export async function getAdminSyncUser() {
  const email = process.env.ADMIN_EMAIL?.toLowerCase();

  if (!email) {
    throw new Error("Missing ADMIN_EMAIL");
  }

  return prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, name: "Sean" },
  });
}

export function hasSyncApiKey(request: Request) {
  const token = bearerToken(request);
  const syncApiKey = process.env.SYNC_API_KEY;

  return Boolean(syncApiKey && token && token === syncApiKey);
}

export async function requireSyncUserId(request: Request) {
  if (hasSyncApiKey(request)) {
    const user = await getAdminSyncUser();
    return user.id;
  }

  return requireUserId();
}
