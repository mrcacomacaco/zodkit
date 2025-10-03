/**
 * @fileoverview Faker utilities with dynamic import for bundle optimization
 * @module FakerUtils
 */

// Dynamic import wrapper for faker to reduce bundle size
let fakerInstance: any = null;

async function getFaker() {
	if (!fakerInstance) {
		try {
			const { faker } = await import('@faker-js/faker');
			fakerInstance = faker;
		} catch (_error) {
			// Fallback for when faker is not available
			console.warn('Faker not available, using simple fallbacks');
			fakerInstance = {
				lorem: { word: () => 'example' },
				number: { int: () => 42 },
				datatype: { boolean: () => true },
				date: { recent: () => new Date() },
				internet: { email: () => 'test@example.com' },
				person: { firstName: () => 'John', lastName: () => 'Doe' },
			};
		}
	}
	return fakerInstance;
}

export async function generateMockString(): Promise<string> {
	const faker = await getFaker();
	return faker.lorem.word();
}

export async function generateMockNumber(): Promise<number> {
	const faker = await getFaker();
	return faker.number.int({ min: 0, max: 100 });
}

export async function generateMockBoolean(): Promise<boolean> {
	const faker = await getFaker();
	return faker.datatype.boolean();
}

export async function generateMockDate(): Promise<Date> {
	const faker = await getFaker();
	return faker.date.recent();
}

export async function generateMockEmail(): Promise<string> {
	const faker = await getFaker();
	return faker.internet.email();
}

export async function generateMockName(): Promise<string> {
	const faker = await getFaker();
	return `${faker.person.firstName()} ${faker.person.lastName()}`;
}
