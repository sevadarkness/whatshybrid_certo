// backend/src/prisma.js
// Singleton Prisma client to avoid creating multiple instances across the app.

const { PrismaClient } = require("@prisma/client");

/**
 * In development, multiple imports (or hot reloads) can create multiple Prisma
 * clients and exhaust connections. Use a global singleton.
 */
let prisma;

if (process.env.NODE_ENV === "production") {
  prisma = new PrismaClient();
} else {
  if (!global.__whatsHybridPrisma) {
    global.__whatsHybridPrisma = new PrismaClient();
  }
  prisma = global.__whatsHybridPrisma;
}

module.exports = prisma;
