import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function bearerToken(request: Request) {
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

export async function requireSyncUserId(request: Request) {
  const token = bearerToken(request);
  const syncApiKey = process.env.SYNC_API_KEY;

  if (syncApiKey && token && token === syncApiKey) {
    const email = process.env.ADMIN_EMAIL?.toLowerCase();

    if (!email) {
      throw new Error("Missing ADMIN_EMAIL");
    }

    const user = await prisma.user.upsert({
      where: { email },
      update: {},
      create: { email, name: "Sean" },
    });

    return user.id;
  }

  return requireUserId();
}
