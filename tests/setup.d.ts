/**
 * @fileoverview Test Setup and Configuration
 * @module TestSetup
 *
 * Global test setup, utilities, and configuration for ZodKit testing infrastructure
 */
import { TestingInfrastructure } from '../src/core/testing-infrastructure';
import { Infrastructure } from '../src/core/infrastructure';
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
    line: number;
    column: number;
    schemaType: string;
    zodChain: string;
    complexity: number;
};
/**
 * Generate test data that conforms to a schema
 */
export declare function generateValidTestData(schema: z.ZodTypeAny, count?: number): any[];
/**
 * Generate test data that violates a schema
 */
export declare function generateInvalidTestData(schema: z.ZodTypeAny, count?: number): any[];
/**
 * Measure performance of schema validation
 */
export declare function measurePerformance(schema: z.ZodTypeAny, data: any[], iterations?: number): Promise<{
    avgTime: number;
    minTime: number;
    maxTime: number;
    throughput: number;
}>;
/**
 * Assert that a schema validates correctly
 */
export declare function expectSchemaValidation(schema: z.ZodTypeAny, validData: any[], invalidData: any[]): void;
/**
 * Create a performance benchmark suite
 */
export declare function createBenchmarkSuite(name: string, schemas: any[]): {
    name: string;
    schemas: any[];
    run: () => Promise<{
        schema: any;
        performance: {
            avgTime: number;
            minTime: number;
            maxTime: number;
            throughput: number;
        };
        complexity: any;
    }[]>;
};
/**
 * Mock schema discovery for testing
 */
export declare function mockSchemaDiscovery(schemas: any[]): {
    findSchemas: jest.Mock<any, any, any>;
    autoDiscover: jest.Mock<any, any, any>;
};
/**
 * Create a test case generator for property-based testing
 */
export declare function createPropertyTestGenerator(schema: z.ZodTypeAny): {
    generate: (count: number) => any[];
    generateValid: (count: number) => any[];
    generateInvalid: (count: number) => any[];
};
declare global {
    var testInfra: TestingInfrastructure;
    var infra: Infrastructure;
}
declare global {
    namespace jest {
        interface Matchers<R> {
            toValidateSuccessfully(data: any): R;
            toRejectWithError(data: any, expectedError?: string): R;
        }
    }
}
declare const _default: {
    createTestSchema: typeof createTestSchema;
    generateValidTestData: typeof generateValidTestData;
    generateInvalidTestData: typeof generateInvalidTestData;
    measurePerformance: typeof measurePerformance;
    expectSchemaValidation: typeof expectSchemaValidation;
    createBenchmarkSuite: typeof createBenchmarkSuite;
    mockSchemaDiscovery: typeof mockSchemaDiscovery;
    createPropertyTestGenerator: typeof createPropertyTestGenerator;
};
export default _default;
//# sourceMappingURL=setup.d.ts.map