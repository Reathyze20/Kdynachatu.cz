import "./env"; // musí zůstat první import
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import type { Express } from "express";
import prisma from "../../utils/prisma";
import { as, setupIntegrationFile, teardownIntegrationFile, type TestWorld } from "./harness";

// validate() předává dál výsledek Zod parsování (#472): pole mimo schéma se zahodí, výchozí hodnoty
// a transformace ze schématu se uplatní a pole, která routy legitimně čtou, schémata obsahují.

let app: Express;
let world: TestWorld;

before(async () => {
  ({ app, world } = await setupIntegrationFile());
});

after(teardownIntegrationFile);

describe("validate: fields outside the schema never reach the DB", () => {
  test("PATCH /api/users/me ignores role, cabinId and isSuperAdmin in the body", async () => {
    const res = await as(app, world.memberA).patch("/api/users/me").send({
      color: "#123abc",
      role: "admin",
      cabinId: world.cabinB.id,
      isSuperAdmin: true,
    });

    assert.equal(res.status, 200);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: world.memberA.id } });
    assert.equal(user.color, "#123abc");
    assert.equal(user.role, "user");
    assert.equal(user.cabinId, world.cabinA.id);
    assert.equal(user.isSuperAdmin, false);
  });

  test("POST /api/users creates the member in the admin's cabin, never the one in the body", async () => {
    const res = await as(app, world.adminA).post("/api/users").send({
      username: "nova-clenka",
      password: "dlouhe-heslo-123",
      cabinId: world.cabinB.id,
      isSuperAdmin: true,
    });

    assert.equal(res.status, 201);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: res.body.user.id } });
    assert.equal(user.cabinId, world.cabinA.id);
    assert.equal(user.isSuperAdmin, false);
  });
});

describe("validate: schema defaults and transforms apply", () => {
  test("POST /api/users without a role stores the schema default and the trimmed name", async () => {
    const res = await as(app, world.adminA).post("/api/users").send({
      username: "  Teta Bozena  ",
      password: "dlouhe-heslo-123",
    });

    assert.equal(res.status, 201);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: res.body.user.id } });
    assert.equal(user.username, "Teta Bozena");
    assert.equal(user.role, "user");
  });
});

describe("validate: fields the routes read are part of the schemas", () => {
  test("POST /api/notes keeps the threadId", async () => {
    const thread = await prisma.noteThread.create({
      data: { name: "Vlákno A", createdById: world.memberA.id, cabinId: world.cabinA.id },
    });

    const res = await as(app, world.memberA).post("/api/notes").send({ message: "Do vlákna", threadId: thread.id });

    assert.equal(res.status, 201);
    const note = await prisma.note.findUniqueOrThrow({ where: { id: res.body.id } });
    assert.equal(note.threadId, thread.id);
  });

  test("POST /api/diary/folders keeps the activityTag", async () => {
    const res = await as(app, world.memberA).post("/api/diary/folders").send({
      name: "Jarní výlet",
      startDate: "2027-04-01",
      endDate: "2027-04-03",
      activityTag: "turistika",
    });

    assert.equal(res.status, 201);
    const folder = await prisma.diaryFolder.findUniqueOrThrow({ where: { id: res.body.id } });
    assert.equal(folder.activityTag, "turistika");
  });

  test("POST /api/reconstruction keeps the company and task fields", async () => {
    const company = await as(app, world.memberA).post("/api/reconstruction").send({
      category: "company",
      title: "Pokrývač Novák",
      tag: "střecha",
      specialization: "Střechy a klempířina",
      email: "novak@example.test",
      phone: "+420 600 000 000",
    });
    const task = await as(app, world.memberA).post("/api/reconstruction").send({
      category: "task",
      title: "Natřít plot",
      deadline: "2027-05-31",
    });

    assert.equal(company.status, 201);
    assert.equal(task.status, 201);
    const savedCompany = await prisma.reconstructionItem.findUniqueOrThrow({ where: { id: company.body.id } });
    assert.equal(savedCompany.tag, "střecha");
    assert.equal(savedCompany.specialization, "Střechy a klempířina");
    assert.equal(savedCompany.email, "novak@example.test");
    assert.equal(savedCompany.phone, "+420 600 000 000");
    const savedTask = await prisma.reconstructionItem.findUniqueOrThrow({ where: { id: task.body.id } });
    assert.equal(savedTask.deadline?.toISOString().slice(0, 10), "2027-05-31");
  });
});
