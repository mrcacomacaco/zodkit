import { z } from 'zod';

// Large complex schema
export const UserProfileSchema = z.object({
	id: z.string().uuid(),
	email: z.string().email(),
	username: z.string().min(3).max(20),
	password: z.string().min(8).max(100),
	profile: z.object({
		firstName: z.string(),
		lastName: z.string(),
		avatar: z.string().url().optional(),
		bio: z.string().max(500).optional(),
		socialLinks: z.object({
			twitter: z.string().url().optional(),
			github: z.string().url().optional(),
			linkedin: z.string().url().optional(),
		}).optional(),
	}),
	preferences: z.object({
		theme: z.enum(['light', 'dark', 'auto']),
		language: z.string(),
		timezone: z.string(),
		notifications: z.object({
			email: z.boolean(),
			push: z.boolean(),
			sms: z.boolean(),
		}),
	}),
	metadata: z.object({
		createdAt: z.date(),
		updatedAt: z.date(),
		lastLogin: z.date().optional(),
		loginCount: z.number().int().min(0),
	}),
}).refine((data) => data.profile.firstName.length > 0, {
	message: 'First name is required',
});

export const PostSchema = z.object({
	id: z.string().uuid(),
	title: z.string().min(1).max(200),
	content: z.string(),
	author: z.string().uuid(),
	tags: z.array(z.string()),
	published: z.boolean(),
	publishedAt: z.date().optional(),
}).describe('Blog post schema');

export const CommentSchema = z.object({
	id: z.string().uuid(),
	postId: z.string().uuid(),
	author: z.string().uuid(),
	content: z.string().min(1).max(1000),
	createdAt: z.date(),
}).describe('Comment schema');
