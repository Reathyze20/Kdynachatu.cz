/**
 * Uzavření registrace nových chat (CABIN_SIGNUP_ENABLED, issue #119).
 * Přihlášení, reset hesla a přijetí pozvánky se netýká.
 */
import type { RequestHandler } from "express";
import type { SignupStatusResponse } from "../../types";

export const CABIN_SIGNUP_CLOSED_MESSAGE = "Registrace nových chat je zatím uzavřená.";

/** Zavřená registrace → 403 dřív, než handler sáhne na DB. */
export function requireCabinSignupOpen(enabled: boolean): RequestHandler {
  return (_req, res, next) => {
    if (!enabled) {
      res.status(403).json({ message: CABIN_SIGNUP_CLOSED_MESSAGE });
      return;
    }
    next();
  };
}

/** GET /api/signup-status – veřejný stav pro frontend. */
export function signupStatusHandler(enabled: boolean): RequestHandler {
  return (_req, res) => {
    const body: SignupStatusResponse = { cabinSignupEnabled: enabled };
    res.json(body);
  };
}
