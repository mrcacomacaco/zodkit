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

export async function generateMockURL(): Promise<string> {
	const faker = await getFaker();
	return faker.internet.url();
}

export async function generateMockUUID(): Promise<string> {
	const faker = await getFaker();
	return faker.string.uuid();
}

export async function generateMockPhone(): Promise<string> {
	const faker = await getFaker();
	return faker.phone.number();
}

export async function generateMockAddress(): Promise<string> {
	const faker = await getFaker();
	return faker.location.streetAddress();
}

export async function generateMockCity(): Promise<string> {
	const faker = await getFaker();
	return faker.location.city();
}

export async function generateMockCountry(): Promise<string> {
	const faker = await getFaker();
	return faker.location.country();
}

export async function generateMockCompany(): Promise<string> {
	const faker = await getFaker();
	return faker.company.name();
}

export async function generateMockJobTitle(): Promise<string> {
	const faker = await getFaker();
	return faker.person.jobTitle();
}

export async function generateMockPrice(): Promise<number> {
	const faker = await getFaker();
	return parseFloat(faker.commerce.price());
}

export async function generateMockProduct(): Promise<string> {
	const faker = await getFaker();
	return faker.commerce.productName();
}

export async function generateMockDescription(): Promise<string> {
	const faker = await getFaker();
	return faker.commerce.productDescription();
}

export async function generateMockSentence(): Promise<string> {
	const faker = await getFaker();
	return faker.lorem.sentence();
}

export async function generateMockParagraph(): Promise<string> {
	const faker = await getFaker();
	return faker.lorem.paragraph();
}

export async function generateMockImage(): Promise<string> {
	const faker = await getFaker();
	return faker.image.url();
}

export async function generateMockColor(): Promise<string> {
	const faker = await getFaker();
	return faker.color.human();
}

export async function generateMockIPAddress(): Promise<string> {
	const faker = await getFaker();
	return faker.internet.ipv4();
}

export async function generateMockUsername(): Promise<string> {
	const faker = await getFaker();
	return faker.internet.username();
}

export async function generateMockPassword(): Promise<string> {
	const faker = await getFaker();
	return faker.internet.password({ length: 16 });
}

/**
 * Pattern-based mock generator
 * Detects field name patterns and generates appropriate mock data
 */
export async function generateByPattern(fieldName: string): Promise<any> {
	const lowerField = fieldName.toLowerCase();

	// Email patterns
	if (lowerField.includes('email')) {
		return generateMockEmail();
	}

	// URL patterns
	if (lowerField.includes('url') || lowerField.includes('link') || lowerField.includes('website')) {
		return generateMockURL();
	}

	// UUID patterns
	if (lowerField.includes('uuid') || lowerField === 'id') {
		return generateMockUUID();
	}

	// Phone patterns
	if (lowerField.includes('phone') || lowerField.includes('mobile') || lowerField.includes('tel')) {
		return generateMockPhone();
	}

	// Date patterns
	if (
		lowerField.includes('date') ||
		lowerField.includes('createdat') ||
		lowerField.includes('updatedat')
	) {
		return generateMockDate();
	}

	// Name patterns
	if (lowerField.includes('name') && !lowerField.includes('username')) {
		return generateMockName();
	}

	// Username patterns
	if (lowerField.includes('username') || lowerField.includes('user')) {
		return generateMockUsername();
	}

	// Password patterns
	if (lowerField.includes('password') || lowerField.includes('pwd')) {
		return generateMockPassword();
	}

	// Address patterns
	if (lowerField.includes('address')) {
		return generateMockAddress();
	}

	// City patterns
	if (lowerField.includes('city')) {
		return generateMockCity();
	}

	// Country patterns
	if (lowerField.includes('country')) {
		return generateMockCountry();
	}

	// Company patterns
	if (lowerField.includes('company') || lowerField.includes('organization')) {
		return generateMockCompany();
	}

	// Job/Title patterns
	if (lowerField.includes('job') || lowerField.includes('title')) {
		return generateMockJobTitle();
	}

	// Price patterns
	if (
		lowerField.includes('price') ||
		lowerField.includes('cost') ||
		lowerField.includes('amount')
	) {
		return generateMockPrice();
	}

	// Product patterns
	if (lowerField.includes('product')) {
		return generateMockProduct();
	}

	// Description patterns
	if (lowerField.includes('description') || lowerField.includes('desc')) {
		return generateMockDescription();
	}

	// Image patterns
	if (
		lowerField.includes('image') ||
		lowerField.includes('img') ||
		lowerField.includes('photo') ||
		lowerField.includes('picture')
	) {
		return generateMockImage();
	}

	// Color patterns
	if (lowerField.includes('color') || lowerField.includes('colour')) {
		return generateMockColor();
	}

	// IP Address patterns
	if (lowerField.includes('ip')) {
		return generateMockIPAddress();
	}

	// Age patterns
	if (lowerField.includes('age')) {
		const faker = await getFaker();
		return faker.number.int({ min: 18, max: 80 });
	}

	// Quantity/Count patterns
	if (
		lowerField.includes('quantity') ||
		lowerField.includes('count') ||
		lowerField.includes('stock')
	) {
		const faker = await getFaker();
		return faker.number.int({ min: 0, max: 1000 });
	}

	// Boolean patterns
	if (
		lowerField.includes('is') ||
		lowerField.includes('has') ||
		lowerField.includes('active') ||
		lowerField.includes('enabled')
	) {
		return generateMockBoolean();
	}

	// Default: return a string
	return generateMockString();
}
