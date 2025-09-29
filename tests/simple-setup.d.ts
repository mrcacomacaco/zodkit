/**
 * @fileoverview Simple Test Setup
 * @module SimpleTestSetup
 *
 * Minimal test setup without complex dependencies
 */
import { z } from 'zod';
/**
 * Create a test schema for testing purposes
 */
export declare function createTestSchema(name: string, definition?: any): {
    name: string;
    schema: z.ZodObject<{
        [x: string]: any;
    }, z.core.$strip>;
    filePath: string;
    schemaType: string;
    complexity: number;
};
/**
 * Generate valid test data
 */
export declare function generateValidTestData(count?: number): any[];
/**
 * Generate invalid test data
 */
export declare function generateInvalidTestData(count?: number): any[];
/**
 * Simple schema validation test helper
 */
export declare function expectSchemaValidation(schema: z.ZodTypeAny, validData: any[], invalidData: any[]): void;
declare const _default: {
    createTestSchema: typeof createTestSchema;
    generateValidTestData: typeof generateValidTestData;
    generateInvalidTestData: typeof generateInvalidTestData;
    expectSchemaValidation: typeof expectSchemaValidation;
};
export default _default;
//# sourceMappingURL=simple-setup.d.ts.map