import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";

import { authenticateWithThrottle } from "@/core/auth/login-throttle";
import { prisma } from "@/core/database/prisma";
import { clientIdentifier } from "@/core/security/rate-limit";

const credentialsSchema = z.object({
  identifier: z.string().min(1),
  password: z.string().min(1),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  pages: { signIn: "/login" },
  session: { strategy: "jwt", maxAge: 8 * 60 * 60 },
  providers: [
    Credentials({
      credentials: {
        identifier: { label: "Phone or email", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, request) {
        const parsed = credentialsSchema.safeParse(credentials);
        if (!parsed.success) return null;

        // The throttling rule itself lives in core/auth/login-throttle.ts, where it can be tested
        // without booting NextAuth — see the note there on why only failures are counted.
        return authenticateWithThrottle({
          identifier: parsed.data.identifier,
          password: parsed.data.password,
          address: clientIdentifier(request),
        });
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user?.id) {
        const record = await prisma.user.findUnique({ where: { id: user.id }, select: { isPlatformAdmin: true } });
        token.isPlatformAdmin = record?.isPlatformAdmin ?? false;
      }
      return token;
    },
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      session.user.isPlatformAdmin = token.isPlatformAdmin ?? false;
      return session;
    },
  },
});
