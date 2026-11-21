import { Request, Response, NextFunction } from "express";
import { z, ZodError } from "zod";

/**
 * Middleware for validating request body (or route params) against a Zod schema
 */
export const validate = (schema: z.ZodSchema, source: "body" | "params" = "body") => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      schema.parse(req[source]);
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
