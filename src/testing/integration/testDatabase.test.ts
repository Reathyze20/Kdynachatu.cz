import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { withTestDatabase, type CommandRunner } from "./testDatabase";

type Call = { command: string; args: string[]; env: NodeJS.ProcessEnv };

/** Falešný spouštěč příkazů: nic nespouští, jen zaznamená volání; `fail` určí, který příkaz selže. */
function fakeRunner(fail?: (call: Call) => boolean): { run: CommandRunner; calls: Call[] } {
  const calls: Call[] = [];
  const run: CommandRunner = async (command, args, env) => {
    const call = { command, args, env };
    calls.push(call);
    if (fail?.(call)) throw new Error(`${command} ${args.join(" ")} selhal`);
  };
  return { run, calls };
}

const isMigration = (call: Call) => call.args.includes("migrate") && call.args.includes("deploy");
const isDocker = (call: Call) => call.command === "docker";
const quiet = () => undefined;
const SAFE_EXTERNAL_URL = "postgresql://u:p@postgres:5432/kdynachatu_test";

describe("withTestDatabase", () => {
  test("refuses the family's local DB on 5432 before touching any database", async () => {
    const { run, calls } = fakeRunner();
    let callbackRan = false;

    await assert.rejects(
      withTestDatabase(async () => { callbackRan = true; }, {
        env: { TEST_DATABASE_URL: "postgresql://cabin:x@localhost:5432/cabin_reservation" },
        run,
        log: quiet,
      }),
      /cabin_reservation/,
    );

    assert.deepEqual(calls, [], "no docker, no migration");
    assert.equal(callbackRan, false);
  });

  test("with TEST_DATABASE_URL: migrates that DB without Docker and hands the test env to the callback", async () => {
    const { run, calls } = fakeRunner();
    let uploadsExistedDuringCallback = false;

    const { result, env } = await withTestDatabase(
      async (env) => {
        uploadsExistedDuringCallback = fs.existsSync(env.UPLOADS_PATH!);
        return { result: "done", env };
      },
      { env: { TEST_DATABASE_URL: ` ${SAFE_EXTERNAL_URL} `, SMTP_HOST: "smtp.example", KEEP: "yes" }, run, log: quiet },
    );

    assert.equal(result, "done");
    assert.equal(calls.some(isDocker), false);
    assert.equal(calls.length, 1);
    assert.ok(isMigration(calls[0]));
    assert.equal(calls[0].env.DATABASE_URL, SAFE_EXTERNAL_URL);

    assert.equal(env.DATABASE_URL, SAFE_EXTERNAL_URL);
    assert.equal(env.NODE_ENV, "test");
    assert.equal(env.INTEGRATION_TEST_RUN, "1");
    assert.match(env.JWT_SECRET ?? "", /^[0-9a-f]{64}$/);
    assert.equal(env.SMTP_HOST, "");
    assert.equal(env.SMTP_USER, "");
    assert.equal(env.SMTP_PASS, "");
    assert.equal(env.KEEP, "yes", "the rest of the base env is passed through");
    assert.ok(uploadsExistedDuringCallback);
    assert.equal(fs.existsSync(env.UPLOADS_PATH!), false, "temporary uploads removed afterwards");
  });

  test("locally: starts a disposable postgres:16 on port 5433 before migrating, then removes it", async () => {
    const { run, calls } = fakeRunner();

    const env = await withTestDatabase(async (env) => env, { env: {}, run, log: quiet });

    assert.equal(env.DATABASE_URL, "postgresql://postgres:postgres@localhost:5433/kdynachatu_test");
    const dockerRun = calls.findIndex((c) => isDocker(c) && c.args[0] === "run");
    const migration = calls.findIndex(isMigration);
    assert.ok(dockerRun >= 0 && dockerRun < migration, "container starts before the migration");
    assert.ok(calls[dockerRun].args.includes("5433:5432"));
    assert.ok(calls[dockerRun].args.includes("postgres:16"));
    const container = calls[dockerRun].args[calls[dockerRun].args.indexOf("--name") + 1];
    assert.deepEqual(calls.at(-1)?.args, ["rm", "-f", container]);
  });

  test("cleans up the container and uploads when the callback fails", async () => {
    const { run, calls } = fakeRunner();
    let uploadsPath = "";

    await assert.rejects(
      withTestDatabase(async (env) => {
        uploadsPath = env.UPLOADS_PATH!;
        throw new Error("testy spadly");
      }, { env: {}, run, log: quiet }),
      /testy spadly/,
    );

    assert.deepEqual(calls.at(-1)?.args.slice(0, 2), ["rm", "-f"]);
    assert.ok(uploadsPath);
    assert.equal(fs.existsSync(uploadsPath), false);
  });

  test("cleans up the container when the migration fails and never runs the callback", async () => {
    const { run, calls } = fakeRunner(isMigration);
    let callbackRan = false;

    await assert.rejects(
      withTestDatabase(async () => { callbackRan = true; }, { env: {}, run, log: quiet }),
      /migrate deploy selhal/,
    );

    assert.equal(callbackRan, false);
    assert.deepEqual(calls.at(-1)?.args.slice(0, 2), ["rm", "-f"]);
  });
});
