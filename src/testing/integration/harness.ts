/**
 * Harness integračních testů: skutečná Express aplikace (createApp) nad skutečným PostgreSQL.
 * Každý testový soubor zavolá v `before` setupIntegrationFile() – vyprázdní DB a naseeduje
 * chatu A a chatu B, v každé správce a člena s ověřeným e-mailem.
 */
import "./env"; // musí zůstat první import
import request from "supertest";
import type { Express } from "express";
import type { Server } from "http";
import prisma from "../../utils/prisma";
import { hashPassword } from "../../utils/password";
import { signAuthToken } from "../../utils/authToken";
import { getIO } from "../../utils/socket";
import { createApp } from "../../backend/app";
import { assertSafeTestDatabaseName } from "./dbGuard";

export const TEST_PASSWORD = "integracni-test-heslo";

export interface TestUser {
  id: string;
  username: string;
  role: string;
  cabinId: string;
  /** `User.tokenVersion` při vytvoření (výchozí 0). Po zneplatnění relací (#485) starý token neprojde. */
  tokenVersion?: number;
}

export interface TestWorld {
  cabinA: { id: string };
  cabinB: { id: string };
  adminA: TestUser;
  memberA: TestUser;
  adminB: TestUser;
  memberB: TestUser;
}

/** Truncate všech aplikačních tabulek (kromě historie migrací). Guard ověří skutečně připojenou DB. */
export async function resetDatabase(): Promise<void> {
  const [{ name }] = await prisma.$queryRaw<{ name: string }[]>`SELECT current_database() AS name`;
  assertSafeTestDatabaseName(name);

  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = current_schema() AND tablename <> '_prisma_migrations'`;
  if (tables.length === 0) return;
  const list = tables.map((t) => `"${t.tablename}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}

async function createCabinUser(username: string, role: string, cabinId: string, passwordHash: string): Promise<TestUser> {
  const user = await prisma.user.create({
    data: {
      username,
      passwordHash,
      color: "#5d9b62",
      email: `${username}@example.test`,
      isEmailVerified: true,
      isVerified: true,
      role,
      cabinId,
    },
  });
  return { id: user.id, username, role, cabinId, tokenVersion: user.tokenVersion };
}

async function seedCabin(letter: "a" | "b", passwordHash: string) {
  const cabin = await prisma.cabin.create({ data: { name: `Chata ${letter.toUpperCase()}`, subdomain: `chata-${letter}` } });
  return {
    cabin: { id: cabin.id },
    admin: await createCabinUser(`spravce-${letter}`, "admin", cabin.id, passwordHash),
    member: await createCabinUser(`clen-${letter}`, "user", cabin.id, passwordHash),
  };
}

export async function seedTwoCabins(): Promise<TestWorld> {
  const passwordHash = await hashPassword(TEST_PASSWORD);
  const a = await seedCabin("a", passwordHash);
  const b = await seedCabin("b", passwordHash);
  return { cabinA: a.cabin, cabinB: b.cabin, adminA: a.admin, memberA: a.member, adminB: b.admin, memberB: b.member };
}

export interface TestWorldWithGuests extends TestWorld {
  guestA: TestUser;
  guestB: TestUser;
}

/** Host (role `guest`) v obou chatách. Jen na vyžádání: stávající testy počítají členy chaty bez hosta. */
export async function addGuests(world: TestWorld): Promise<TestWorldWithGuests> {
  const passwordHash = await hashPassword(TEST_PASSWORD);
  return {
    ...world,
    guestA: await createCabinUser("host-a", "guest", world.cabinA.id, passwordHash),
    guestB: await createCabinUser("host-b", "guest", world.cabinB.id, passwordHash),
  };
}

/** Token stejně, jak ho vydává aplikace (bez login endpointu a jeho rate limiteru), s verzí tokenu uživatele (#485). */
export function tokenFor(user: TestUser): string {
  return signAuthToken({
    id: user.id,
    username: user.username,
    role: user.role,
    cabinId: user.cabinId,
    isSuperAdmin: false,
    tokenVersion: user.tokenVersion ?? 0,
  });
}

/** HTTP klient přihlášený jako daný uživatel. */
export function as(app: Express, user: TestUser) {
  const auth = `Bearer ${tokenFor(user)}`;
  return {
    get: (path: string) => request(app).get(path).set("Authorization", auth),
    post: (path: string) => request(app).post(path).set("Authorization", auth),
    put: (path: string) => request(app).put(path).set("Authorization", auth),
    patch: (path: string) => request(app).patch(path).set("Authorization", auth),
    delete: (path: string) => request(app).delete(path).set("Authorization", auth),
  };
}

/** Zaznamená, do kterých Socket.IO roomů aplikace posílá události (emitToCabin → io.to(room).emit). */
export function recordRealtimeEmits() {
  const io = getIO();
  if (!io) throw new Error("Socket.IO není inicializované – zavolejte nejdřív setupIntegrationFile().");
  const emits: { room: string; event: string; data: unknown }[] = [];
  const originalTo = io.to.bind(io);
  io.to = ((room: Parameters<typeof io.to>[0]) => {
    const operator = originalTo(room);
    const originalEmit = operator.emit.bind(operator);
    operator.emit = ((event: string, ...args: unknown[]) => {
      emits.push({ room: String(room), event, data: args[0] });
      return originalEmit(event, ...(args as []));
    }) as typeof operator.emit;
    return operator;
  }) as typeof io.to;
  return { emits, restore: () => { io.to = originalTo; } };
}

/** Před každým testovým souborem: čistá DB, dvě chaty, aplikace a server (HTTP + Socket.IO) bez portu, cronu a rate limitů. */
export async function setupIntegrationFile(): Promise<{ app: Express; server: Server; world: TestWorld }> {
  await resetDatabase();
  const world = await seedTwoCabins();
  const { app, server } = createApp({ enableRateLimits: false });
  return { app, server, world };
}

export async function teardownIntegrationFile(): Promise<void> {
  await prisma.$disconnect();
}
