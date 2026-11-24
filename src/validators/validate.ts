import { Request, Response, NextFunction } from "express";
import { z, ZodError } from "zod";

/**
 * Middleware for validating request body (or route params / query) against a Zod schema.
 *
 * The parsed result replaces `req[source]` (#472): fields outside the schema are dropped (strip, not strict)
 * and schema defaults and transforms (trim, coerce) apply, so handlers only ever see validated data.
 */
export const validate = (schema: z.ZodSchema, source: "body" | "params" | "query" = "body") => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = schema.parse(req[source]);
      // defineProperty rather than assignment: Express 5 exposes `req.query` as a getter only.
      Object.defineProperty(req, source, { value: parsed, writable: true, enumerable: true, configurable: true });
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const errors = error.issues.map((err) => ({
          path: err.path.join("."),
          message: err.message,
        }));
        return res.status(400).json({
          message: "Chyba validace",
          errors,
        });
      }
      next(error);
    }
  };
};
