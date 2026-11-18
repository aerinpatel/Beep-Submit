// Zod Schemas for Structured LLM Tagging (lib/tagger/schema.ts)
// Enforces strict enum values preventing hallucinated roles or cities

import { z } from "zod";
import { ROLES, CITIES } from "../config";

export const PostTagSchema = z.object({
  id: z.string(),
  role: z.enum(ROLES, {
    errorMap: () => ({ message: `Role must be one of: ${ROLES.join(", ")}` }),
  }),
  city: z.enum(CITIES, {
    errorMap: () => ({ message: `City must be one of: ${CITIES.join(", ")}` }),
  }),
  isFresher: z.boolean(),
  confidence: z.number().min(0).max(1),
});

export const BatchTagResponseSchema = z.object({
  tags: z.array(PostTagSchema),
});

export type PostTag = z.infer<typeof PostTagSchema>;
export type BatchTagResponse = z.infer<typeof BatchTagResponseSchema>;
