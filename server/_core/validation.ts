import { z } from "zod";

export const paginationInput = z.object({
  page: z.number().int().min(1).max(10_000).default(1),
  pageSize: z.number().int().min(1).max(100).default(25),
});

export const searchInput = z.object({
  query: z.string().trim().max(200).default(""),
});

export const customerFilterInput = paginationInput.extend({
  search: z.string().trim().max(200).default(""),
  segment: z.string().trim().max(80).optional(),
  minRisk: z.number().min(0).max(1).optional(),
  maxRisk: z.number().min(0).max(1).optional(),
});

export type CustomerFilterInput = z.infer<typeof customerFilterInput>;
