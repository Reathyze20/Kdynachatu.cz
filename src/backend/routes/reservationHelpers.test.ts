import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { calendarTodayIso, departureGate, handoverFault, handoverPhase, isPrimaryCollisionBlocked, nextFreeWeekend, pickMyStay, sanitizeCheckoutState } from "./reservationHelpers";

describe("calendarTodayIso (Europe/Prague)", () => {
  test("after local midnight it is already the new day, although UTC is still on the previous one", () => {
    assert.equal(calendarTodayIso(new Date("2027-07-09T21:59:00Z")), "2027-07-09");
    assert.equal(calendarTodayIso(new Date("2027-07-09T22:30:00Z")), "2027-07-10");
  });

  test("around the switch to summer time (28 March 2027)", () => {
    assert.equal(calendarTodayIso(new Date("2027-03-27T23:30:00Z")), "2027-03-28");
    assert.equal(calendarTodayIso(new Date("2027-03-28T01:30:00Z")), "2027-03-28");
  });
});

describe("nextFreeWeekend", () => {
  // Výsledek nesmí záviset na zóně serveru: produkce může běžet v UTC i v Europe/Prague.
  const originalTz = process.env.TZ;
  afterEach(() => {
    if (originalTz === undefined) delete process.env.TZ;
    else process.env.TZ = originalTz;
  });

  const todayAt = (instant: string) => calendarTodayIso(new Date(instant));
  const day = (iso: string) => new Date(iso); // @db.Date z Prismy = UTC půlnoc
  const stay = (from: string, to: string) => ({ dateFrom: day(from), dateTo: day(to) });

  for (const tz of ["UTC", "Europe/Prague"]) {
    describe(`server in ${tz}`, () => {
      beforeEach(() => {
        process.env.TZ = tz;
      });

      test("Saturday 00:30 in Prague (UTC still Friday): this weekend", () => {
        assert.deepEqual(nextFreeWeekend(todayAt("2027-07-09T22:30:00Z"), []), { start: "2027-07-10", end: "2027-07-11" });
      });

      test("Sunday 00:30 in Prague (UTC still Saturday): next weekend, not the one already half over", () => {
        assert.deepEqual(nextFreeWeekend(todayAt("2027-07-10T22:30:00Z"), []), { start: "2027-07-17", end: "2027-07-18" });
      });

      test("an occupied weekend is skipped", () => {
        assert.deepEqual(
          nextFreeWeekend(todayAt("2027-07-07T10:00:00Z"), [stay("2027-07-09", "2027-07-10")]),
          { start: "2027-07-17", end: "2027-07-18" },
        );
      });

      test("around the switch to summer time (28 March 2027)", () => {
        // Ne 28. 3. 01:30 v Praze, ještě před přechodem; víkend 3.–4. 4. je obsazený.
        assert.deepEqual(
          nextFreeWeekend(todayAt("2027-03-28T00:30:00Z"), [stay("2027-04-04", "2027-04-04")]),
          { start: "2027-04-10", end: "2027-04-11" },
        );
        // Pá 26. 3. ve 23:30 v Praze: víkend přes přechod je volný.
        assert.deepEqual(nextFreeWeekend(todayAt("2027-03-26T22:30:00Z"), []), { start: "2027-03-27", end: "2027-03-28" });
      });

      test("returns null when the next 26 weekends are taken", () => {
        assert.equal(nextFreeWeekend(todayAt("2027-07-07T10:00:00Z"), [stay("2027-07-01", "2028-02-01")]), null);
      });
    });
  }
});

describe("isPrimaryCollisionBlocked", () => {
  test("primary over an overlapping primary is blocked (409)", () => {
    assert.equal(isPrimaryCollisionBlocked("primary", true), true);
  });

  test("primary with no overlapping primary is allowed", () => {
    assert.equal(isPrimaryCollisionBlocked("primary", false), false);
  });

  test("backup never blocks, even over an overlapping primary", () => {
    assert.equal(isPrimaryCollisionBlocked("backup", true), false);
    assert.equal(isPrimaryCollisionBlocked("backup", false), false);
  });

  test("soft never blocks, even over an overlapping primary", () => {
    assert.equal(isPrimaryCollisionBlocked("soft", true), false);
    assert.equal(isPrimaryCollisionBlocked("soft", false), false);
  });
});

describe("sanitizeCheckoutState", () => {
  test("returns undefined when nothing was sent (leave unchanged)", () => {
    assert.equal(sanitizeCheckoutState(undefined), undefined);
  });

  test("returns undefined for null or non-object input", () => {
    assert.equal(sanitizeCheckoutState(null), undefined);
    assert.equal(sanitizeCheckoutState("gas: full"), undefined);
    assert.equal(sanitizeCheckoutState(42), undefined);
  });

  test("returns an empty object when given an object with no valid keys", () => {
    assert.deepEqual(sanitizeCheckoutState({}), {});
    assert.deepEqual(sanitizeCheckoutState({ nonsense: true, foo: "bar" }), {});
  });

  test("keeps all valid fields", () => {
    const out = sanitizeCheckoutState({
      gas: "half",
      heatingOff: true,
      waterOff: false,
      broken: "kape kohoutek",
      leftBehind: "dřevo",
      note: "vítej",
    });
    assert.deepEqual(out, {
      gas: "half",
      heatingOff: true,
      waterOff: false,
      broken: "kape kohoutek",
      leftBehind: "dřevo",
      note: "vítej",
    });
  });

  test("accepts every valid gas level", () => {
    for (const gas of ["full", "half", "low", "empty"]) {
      assert.equal(sanitizeCheckoutState({ gas })?.gas, gas);
    }
  });

  test("drops an invalid gas value", () => {
    const out = sanitizeCheckoutState({ gas: "overflowing" });
    assert.deepEqual(out, {});
    assert.equal(out && "gas" in out, false);
  });

  test("drops fields with the wrong type", () => {
    const out = sanitizeCheckoutState({ heatingOff: "yes", waterOff: 1, broken: 5 });
    assert.deepEqual(out, {});
  });

  test("ignores unknown keys but keeps valid ones alongside them", () => {
    const out = sanitizeCheckoutState({ gas: "low", hacker: "drop table", note: "ok" });
    assert.deepEqual(out, { gas: "low", note: "ok" });
  });

  test("truncates long text fields to 1000 chars", () => {
    const long = "x".repeat(5000);
    const out = sanitizeCheckoutState({ broken: long, leftBehind: long, note: long });
    assert.equal(out?.broken?.length, 1000);
    assert.equal(out?.leftBehind?.length, 1000);
    assert.equal(out?.note?.length, 1000);
  });
});

describe("departureGate", () => {
  test("no stay of mine ends today → no banner", () => {
    assert.deepEqual(departureGate(null), { departingToday: false, departingReservationId: null });
  });

  test("my stay ends today and the handover is not done → banner with the reservation id", () => {
    assert.deepEqual(departureGate({ id: "r-1", isCheckoutCompleted: false }), {
      departingToday: true,
      departingReservationId: "r-1",
    });
  });

  test("handover completed (from the banner or the reservation detail) → no banner", () => {
    assert.deepEqual(departureGate({ id: "r-1", isCheckoutCompleted: true }), {
      departingToday: false,
      departingReservationId: null,
    });
  });
});

describe("handoverFault", () => {
  const at = new Date("2026-11-15T16:30:00.000Z");

  test("broken things from the last handover → fault with who and when", () => {
    assert.deepEqual(handoverFault({ broken: "  Kape kohoutek ", note: "x" }, "Petr", at), {
      text: "Kape kohoutek",
      reportedBy: "Petr",
      reportedAt: "2026-11-15T16:30:00.000Z",
    });
  });

  test("an empty or missing field means the next handover overwrote the fault", () => {
    assert.equal(handoverFault({ broken: "   " }, "Petr", at), null);
    assert.equal(handoverFault({ note: "Vše v pořádku" }, "Petr", at), null);
    assert.equal(handoverFault(null, "Petr", at), null);
  });
});

describe("handoverPhase and pickMyStay (tab Předávka)", () => {
  const today = "2027-07-10";
  const stay = (from: string, to: string, isCheckoutCompleted = false) => ({ from, to, isCheckoutCompleted });

  test("the handover window is the departure day and the day after it", () => {
    assert.equal(handoverPhase(today, "2027-07-08", "2027-07-10"), "departure");
    assert.equal(handoverPhase(today, "2027-07-07", "2027-07-09"), "departure");
    assert.equal(handoverPhase(today, "2027-07-06", "2027-07-08"), null);
    assert.equal(handoverPhase(today, "2027-07-09", "2027-07-12"), "ongoing");
    assert.equal(handoverPhase(today, "2027-07-11", "2027-07-12"), "upcoming");
  });

  test("an open handover wins over a finished one, then the ongoing stay, then the nearest upcoming", () => {
    const done = stay("2027-07-08", "2027-07-10", true);
    const open = stay("2027-07-07", "2027-07-09");
    const ongoing = stay("2027-07-09", "2027-07-12");
    const later = stay("2027-08-01", "2027-08-03");
    const sooner = stay("2027-07-20", "2027-07-22");
    assert.deepEqual(pickMyStay([later, done, ongoing, open, sooner], today), { ...open, phase: "departure" });
    assert.deepEqual(pickMyStay([later, done, ongoing, sooner], today), { ...done, phase: "departure" });
    assert.deepEqual(pickMyStay([later, ongoing, sooner], today), { ...ongoing, phase: "ongoing" });
    assert.deepEqual(pickMyStay([later, sooner], today), { ...sooner, phase: "upcoming" });
    assert.equal(pickMyStay([stay("2027-07-01", "2027-07-05")], today), null);
  });
});
