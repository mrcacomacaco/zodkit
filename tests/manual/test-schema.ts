import { z } from 'zod';

/**
 * Test schema for validation
 */
export const UserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string().min(1).max(100),
  age: z.number().int().min(0).max(150).optional(),
  role: z.enum(['admin', 'user', 'guest']).default('user'),
  createdAt: z.date().optional(),
});

export type User = z.infer<typeof UserSchema>;

/**
 * Nested schema for testing complexity
 */
export const PostSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(200),
  content: z.string(),
  author: UserSchema,
  tags: z.array(z.string()).optional(),
  published: z.boolean().default(false),
});

export type Post = z.infer<typeof PostSchema>;

/**
 * Union schema for testing
 */
export const ResponseSchema = z.union([
  z.object({
    success: z.literal(true),
    data: z.any(),
  }),
  z.object({
    success: z.literal(false),
    error: z.string(),
  }),
]);

export type Response = z.infer<typeof ResponseSchema>;