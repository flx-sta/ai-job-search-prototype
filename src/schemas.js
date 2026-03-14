import { z } from 'zod';

/**
 * Zod Schema for job validation and type safety.
 * This ensures the complex nested JSON from jobs.jsonl matches expectations.
 */
export const JobSchema = z.object({
  id: z.string(),
  apply_url: z.string().optional(),
  job_information: z.object({
    title: z.string().optional(),
    description: z.string().optional(),
  }).optional().default({}),
  v5_processed_company_data: z.object({
    name: z.string().optional(),
    industries: z.array(z.string()).optional().default([]),
    is_non_profit: z.boolean().optional().default(false),
    is_public_company: z.boolean().optional().default(false),
    num_employees: z.string().optional(),
    total_funding_amount: z.string().optional(),
  }).optional().default({}),
  v7_processed_job_data: z.object({
    work_arrangement: z.object({
      workplace_type: z.string().optional(),
      commitment: z.array(z.string()).optional().default([]),
      individual_contributor_or_people_manager: z.string().optional(),
      workplace_locations: z.array(z.any()).optional().default([]),
    }).optional().default({}),
    compensation_and_benefits: z.object({
      salary: z.object({
        low: z.number().optional().nullable(),
        high: z.number().optional().nullable(),
        currency: z.string().optional(),
        frequency: z.string().optional(),
      }).optional(),
      benefits: z.record(z.any()).optional().default({}),
    }).optional().default({}),
    experience_requirements: z.object({
      seniority_level: z.string().optional(),
      min_years_breakdown: z.object({
        industry_and_role_yoe: z.number().optional().nullable(),
        management_and_leadership_yoe: z.number().optional().nullable(),
      }).optional(),
      security_clearance: z.string().optional(),
    }).optional().default({}),
    skills: z.object({
      explicit: z.array(z.string()).optional().default([]),
      inferred: z.array(z.string()).optional().default([]),
    }).optional().default({}),
    education: z.record(z.any()).optional().default({}),
    embedding_explicit_vector: z.array(z.number()).optional(),
    embedding_inferred_vector: z.array(z.number()).optional(),
    embedding_company_vector: z.array(z.number()).optional(),
  }).optional().default({}),
});
