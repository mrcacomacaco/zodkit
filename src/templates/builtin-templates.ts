import { z } from 'zod';
import { SchemaTemplate } from '../core/schema-templates';

// User Authentication Template
export const UserAuthTemplate: SchemaTemplate = {
  id: 'tpl_user_auth_001',
  name: 'User Authentication Schema',
  description: 'Complete user authentication schema with validation for email, password, and profile data',
  version: '1.0.0',
  author: {
    name: 'Zodded Team',
    email: 'templates@zodded.dev',
    url: 'https://zodded.dev'
  },
  tags: ['authentication', 'user', 'security', 'validation', 'email', 'password'],
  category: 'authentication',
  difficulty: 'intermediate',
  rating: 4.8,
  downloads: 1250,
  schema: z.object({
    email: z.string().email('Invalid email format'),
    password: z.string()
      .min(8, 'Password must be at least 8 characters')
      .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/, 'Password must contain uppercase, lowercase, number and special character'),
    confirmPassword: z.string(),
    profile: z.object({
      firstName: z.string().min(1, 'First name is required'),
      lastName: z.string().min(1, 'Last name is required'),
      dateOfBirth: z.string().datetime().optional(),
      phoneNumber: z.string().regex(/^\+?[1-9]\d{1,14}$/, 'Invalid phone number').optional(),
      avatar: z.string().url('Invalid avatar URL').optional()
    }),
    preferences: z.object({
      newsletter: z.boolean().default(false),
      notifications: z.boolean().default(true),
      theme: z.enum(['light', 'dark', 'auto']).default('auto'),
      language: z.string().length(2, 'Language must be 2-letter code').default('en')
    }),
    metadata: z.object({
      source: z.string().optional(),
      referrer: z.string().optional(),
      ipAddress: z.string().regex(/^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/, 'Invalid IP address').optional(),
      userAgent: z.string().optional()
    }).optional()
  }).refine(data => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"]
  }),
  metadata: {
    framework: 'zod',
    compatibility: ['zod@^3.0.0'],
    language: 'typescript',
    size: 'medium',
    complexity: 18,
    performance: {
      validationSpeed: 'fast',
      memoryUsage: 'low',
      bundleSize: 2400
    },
    features: ['email-validation', 'password-strength', 'nested-objects', 'custom-refinement'],
    useCases: ['user-registration', 'login-forms', 'profile-management', 'account-creation'],
    industries: ['saas', 'e-commerce', 'social', 'productivity']
  },
  examples: [
    {
      id: 'basic-registration',
      title: 'Basic User Registration',
      description: 'Complete user registration with all required fields',
      code: `const UserAuthSchema = /* schema definition */;

const registrationData = {
  email: "user@example.com",
  password: "SecurePass123!",
  confirmPassword: "SecurePass123!",
  profile: {
    firstName: "John",
    lastName: "Doe",
    phoneNumber: "+1234567890"
  },
  preferences: {
    newsletter: true,
    theme: "dark"
  }
};

const result = UserAuthSchema.parse(registrationData);`,
      input: {
        email: "user@example.com",
        password: "SecurePass123!",
        confirmPassword: "SecurePass123!",
        profile: {
          firstName: "John",
          lastName: "Doe"
        }
      },
      output: {
        email: "user@example.com",
        password: "SecurePass123!",
        confirmPassword: "SecurePass123!",
        profile: {
          firstName: "John",
          lastName: "Doe"
        },
        preferences: {
          newsletter: false,
          notifications: true,
          theme: "auto",
          language: "en"
        }
      },
      explanation: 'Validates complete user registration data with strong password requirements and profile information',
      difficulty: 'beginner'
    }
  ],
  documentation: {
    overview: 'A comprehensive user authentication schema that handles user registration, login validation, and profile management with strong security practices.',
    installation: 'npm install zod',
    usage: 'Import the schema and use it to validate user authentication data in your registration and login forms.',
    api: [],
    faq: [],
    troubleshooting: [],
    migrations: []
  },
  dependencies: [
    {
      name: 'zod',
      version: '^3.0.0',
      type: 'required',
      description: 'TypeScript-first schema validation library'
    }
  ],
  customizations: [],
  created: new Date('2024-01-15'),
  updated: new Date('2024-01-20'),
  license: 'MIT',
  repository: 'https://github.com/zodded/templates',
  changelog: []
};

// API Response Template
export const ApiResponseTemplate: SchemaTemplate = {
  id: 'tpl_api_response_002',
  name: 'Standard API Response Schema',
  description: 'Standardized API response format with success/error handling, pagination, and metadata',
  version: '1.2.0',
  author: {
    name: 'Zodded Team',
    email: 'templates@zodded.dev'
  },
  tags: ['api', 'response', 'rest', 'pagination', 'error-handling'],
  category: 'api',
  difficulty: 'beginner',
  rating: 4.9,
  downloads: 2100,
  schema: z.union([
    // Success response
    z.object({
      success: z.literal(true),
      data: z.any(),
      pagination: z.object({
        page: z.number().min(1),
        limit: z.number().min(1).max(100),
        total: z.number().min(0),
        totalPages: z.number().min(0),
        hasNext: z.boolean(),
        hasPrev: z.boolean()
      }).optional(),
      metadata: z.object({
        timestamp: z.string().datetime(),
        requestId: z.string().uuid(),
        version: z.string(),
        executionTime: z.number().positive().optional()
      })
    }),
    // Error response
    z.object({
      success: z.literal(false),
      error: z.object({
        code: z.string(),
        message: z.string(),
        details: z.array(z.object({
          field: z.string().optional(),
          message: z.string(),
          code: z.string().optional()
        })).optional(),
        stack: z.string().optional()
      }),
      metadata: z.object({
        timestamp: z.string().datetime(),
        requestId: z.string().uuid(),
        version: z.string()
      })
    })
  ]),
  metadata: {
    framework: 'zod',
    compatibility: ['zod@^3.0.0'],
    language: 'typescript',
    size: 'medium',
    complexity: 15,
    performance: {
      validationSpeed: 'fast',
      memoryUsage: 'low',
      bundleSize: 1800
    },
    features: ['union-types', 'conditional-validation', 'uuid-validation', 'datetime-validation'],
    useCases: ['rest-apis', 'graphql-responses', 'microservices', 'api-gateways'],
    industries: ['saas', 'fintech', 'e-commerce', 'healthcare']
  },
  examples: [
    {
      id: 'success-response',
      title: 'Successful API Response',
      description: 'Example of a successful API response with data and pagination',
      code: `const ApiResponseSchema = /* schema definition */;

const successResponse = {
  success: true,
  data: [{ id: 1, name: "Item 1" }],
  pagination: {
    page: 1,
    limit: 10,
    total: 50,
    totalPages: 5,
    hasNext: true,
    hasPrev: false
  },
  metadata: {
    timestamp: new Date().toISOString(),
    requestId: crypto.randomUUID(),
    version: "1.0.0"
  }
};

const result = ApiResponseSchema.parse(successResponse);`,
      input: {
        success: true,
        data: [{ id: 1, name: "Item 1" }],
        metadata: {
          timestamp: "2024-01-20T10:00:00Z",
          requestId: "123e4567-e89b-12d3-a456-426614174000",
          version: "1.0.0"
        }
      },
      output: {
        success: true,
        data: [{ id: 1, name: "Item 1" }],
        metadata: {
          timestamp: "2024-01-20T10:00:00Z",
          requestId: "123e4567-e89b-12d3-a456-426614174000",
          version: "1.0.0"
        }
      },
      explanation: 'Validates successful API responses with consistent metadata structure',
      difficulty: 'beginner'
    }
  ],
  documentation: {
    overview: 'A standardized API response schema that ensures consistent response formats across your API endpoints.',
    installation: 'npm install zod',
    usage: 'Use this schema to validate and type your API responses, ensuring consistent error handling and metadata.',
    api: [],
    faq: [],
    troubleshooting: [],
    migrations: []
  },
  dependencies: [
    {
      name: 'zod',
      version: '^3.0.0',
      type: 'required',
      description: 'TypeScript-first schema validation library'
    }
  ],
  customizations: [],
  created: new Date('2024-01-10'),
  updated: new Date('2024-01-25'),
  license: 'MIT',
  changelog: []
};

// E-commerce Product Template
export const EcommerceProductTemplate: SchemaTemplate = {
  id: 'tpl_ecommerce_product_003',
  name: 'E-commerce Product Schema',
  description: 'Comprehensive e-commerce product schema with variants, pricing, inventory, and SEO metadata',
  version: '1.1.0',
  author: {
    name: 'Zodded Team',
    email: 'templates@zodded.dev'
  },
  tags: ['e-commerce', 'product', 'inventory', 'pricing', 'seo', 'variants'],
  category: 'e-commerce',
  difficulty: 'advanced',
  rating: 4.7,
  downloads: 890,
  schema: z.object({
    id: z.string().uuid(),
    sku: z.string().min(1, 'SKU is required'),
    name: z.string().min(1, 'Product name is required'),
    description: z.string().min(10, 'Description must be at least 10 characters'),
    shortDescription: z.string().max(200, 'Short description must be under 200 characters').optional(),
    category: z.object({
      id: z.string(),
      name: z.string(),
      slug: z.string(),
      parentId: z.string().optional()
    }),
    brand: z.object({
      id: z.string(),
      name: z.string(),
      logo: z.string().url().optional()
    }).optional(),
    pricing: z.object({
      basePrice: z.number().positive('Base price must be positive'),
      salePrice: z.number().positive().optional(),
      currency: z.string().length(3, 'Currency must be 3-letter code'),
      tax: z.object({
        rate: z.number().min(0).max(1),
        inclusive: z.boolean()
      }).optional()
    }),
    inventory: z.object({
      quantity: z.number().int().min(0),
      reserved: z.number().int().min(0).default(0),
      available: z.number().int().min(0),
      backorder: z.boolean().default(false),
      trackQuantity: z.boolean().default(true)
    }),
    variants: z.array(z.object({
      id: z.string(),
      sku: z.string(),
      attributes: z.record(z.string(), z.string()),
      pricing: z.object({
        basePrice: z.number().positive(),
        salePrice: z.number().positive().optional()
      }),
      inventory: z.object({
        quantity: z.number().int().min(0),
        available: z.number().int().min(0)
      }),
      images: z.array(z.string().url()).optional()
    })).optional(),
    images: z.array(z.object({
      id: z.string(),
      url: z.string().url(),
      alt: z.string(),
      primary: z.boolean().default(false),
      order: z.number().int().min(0).default(0)
    })),
    attributes: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
    dimensions: z.object({
      weight: z.number().positive().optional(),
      length: z.number().positive().optional(),
      width: z.number().positive().optional(),
      height: z.number().positive().optional(),
      unit: z.enum(['cm', 'in', 'mm']).default('cm')
    }).optional(),
    seo: z.object({
      title: z.string().max(60, 'SEO title should be under 60 characters').optional(),
      description: z.string().max(160, 'SEO description should be under 160 characters').optional(),
      keywords: z.array(z.string()).optional(),
      slug: z.string().regex(/^[a-z0-9-]+$/, 'Slug must contain only lowercase letters, numbers, and hyphens')
    }),
    status: z.enum(['draft', 'active', 'inactive', 'archived']).default('draft'),
    tags: z.array(z.string()).default([]),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime()
  }),
  metadata: {
    framework: 'zod',
    compatibility: ['zod@^3.0.0'],
    language: 'typescript',
    size: 'large',
    complexity: 35,
    performance: {
      validationSpeed: 'medium',
      memoryUsage: 'medium',
      bundleSize: 4200
    },
    features: ['nested-objects', 'arrays', 'enums', 'regex-validation', 'conditional-fields'],
    useCases: ['e-commerce-platforms', 'product-catalogs', 'inventory-management', 'marketplace-apis'],
    industries: ['e-commerce', 'retail', 'marketplace', 'b2b']
  },
  examples: [
    {
      id: 'simple-product',
      title: 'Simple Product',
      description: 'A basic product without variants',
      code: `const ProductSchema = /* schema definition */;

const product = {
  id: crypto.randomUUID(),
  sku: "SHIRT-001",
  name: "Cotton T-Shirt",
  description: "Comfortable cotton t-shirt perfect for everyday wear",
  category: {
    id: "cat-001",
    name: "Clothing",
    slug: "clothing"
  },
  pricing: {
    basePrice: 29.99,
    currency: "USD"
  },
  inventory: {
    quantity: 100,
    available: 95
  },
  images: [{
    id: "img-001",
    url: "https://example.com/shirt.jpg",
    alt: "Cotton T-Shirt",
    primary: true,
    order: 0
  }],
  attributes: {
    material: "100% Cotton",
    color: "Blue"
  },
  seo: {
    slug: "cotton-t-shirt"
  },
  status: "active",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
};

const result = ProductSchema.parse(product);`,
      input: {
        id: "123e4567-e89b-12d3-a456-426614174000",
        sku: "SHIRT-001",
        name: "Cotton T-Shirt",
        description: "Comfortable cotton t-shirt"
      },
      output: {
        id: "123e4567-e89b-12d3-a456-426614174000",
        sku: "SHIRT-001",
        name: "Cotton T-Shirt",
        description: "Comfortable cotton t-shirt",
        status: "draft",
        tags: []
      },
      explanation: 'Validates e-commerce product data with comprehensive metadata and inventory tracking',
      difficulty: 'intermediate'
    }
  ],
  documentation: {
    overview: 'A comprehensive e-commerce product schema that handles all aspects of product management including variants, pricing, inventory, and SEO.',
    installation: 'npm install zod',
    usage: 'Use this schema to validate product data in your e-commerce application, ensuring data consistency across your platform.',
    api: [],
    faq: [],
    troubleshooting: [],
    migrations: []
  },
  dependencies: [
    {
      name: 'zod',
      version: '^3.0.0',
      type: 'required',
      description: 'TypeScript-first schema validation library'
    }
  ],
  customizations: [],
  created: new Date('2024-01-05'),
  updated: new Date('2024-01-18'),
  license: 'MIT',
  changelog: []
};

// Configuration Schema Template
export const ConfigurationTemplate: SchemaTemplate = {
  id: 'tpl_configuration_004',
  name: 'Application Configuration Schema',
  description: 'Comprehensive application configuration schema with environment-specific settings, feature flags, and validation',
  version: '1.0.0',
  author: {
    name: 'Zodded Team',
    email: 'templates@zodded.dev'
  },
  tags: ['configuration', 'environment', 'settings', 'feature-flags', 'deployment'],
  category: 'configuration',
  difficulty: 'intermediate',
  rating: 4.6,
  downloads: 1450,
  schema: z.object({
    app: z.object({
      name: z.string().min(1),
      version: z.string().regex(/^\d+\.\d+\.\d+/, 'Version must be in semver format'),
      environment: z.enum(['development', 'staging', 'production', 'test']),
      debug: z.boolean().default(false),
      logLevel: z.enum(['error', 'warn', 'info', 'debug', 'trace']).default('info')
    }),
    server: z.object({
      host: z.string().default('localhost'),
      port: z.number().int().min(1).max(65535).default(3000),
      cors: z.object({
        origin: z.union([z.string(), z.array(z.string()), z.boolean()]).default('*'),
        credentials: z.boolean().default(false),
        methods: z.array(z.string()).default(['GET', 'POST', 'PUT', 'DELETE'])
      }),
      rateLimit: z.object({
        windowMs: z.number().positive().default(900000),
        max: z.number().positive().default(100),
        standardHeaders: z.boolean().default(true)
      }).optional()
    }),
    database: z.object({
      host: z.string(),
      port: z.number().int().min(1).max(65535),
      username: z.string(),
      password: z.string().min(1),
      database: z.string().min(1),
      ssl: z.boolean().default(false),
      pool: z.object({
        min: z.number().int().min(0).default(2),
        max: z.number().int().min(1).default(10),
        idle: z.number().int().positive().default(30000)
      }).optional()
    }),
    redis: z.object({
      host: z.string(),
      port: z.number().int().min(1).max(65535).default(6379),
      password: z.string().optional(),
      db: z.number().int().min(0).default(0),
      keyPrefix: z.string().optional()
    }).optional(),
    email: z.object({
      provider: z.enum(['smtp', 'sendgrid', 'ses', 'mailgun']),
      apiKey: z.string().optional(),
      from: z.string().email(),
      smtp: z.object({
        host: z.string(),
        port: z.number().int().min(1).max(65535),
        secure: z.boolean().default(false),
        auth: z.object({
          user: z.string(),
          pass: z.string()
        })
      }).optional()
    }).optional(),
    storage: z.object({
      provider: z.enum(['local', 's3', 'gcs', 'azure']),
      bucket: z.string().optional(),
      region: z.string().optional(),
      accessKey: z.string().optional(),
      secretKey: z.string().optional(),
      localPath: z.string().optional()
    }),
    monitoring: z.object({
      enabled: z.boolean().default(false),
      provider: z.enum(['datadog', 'newrelic', 'sentry']).optional(),
      apiKey: z.string().optional(),
      sampleRate: z.number().min(0).max(1).default(1)
    }).optional(),
    featureFlags: z.record(z.string(), z.boolean()).default({}),
    security: z.object({
      jwtSecret: z.string().min(32, 'JWT secret must be at least 32 characters'),
      jwtExpiry: z.string().default('1h'),
      bcryptRounds: z.number().int().min(10).max(15).default(12),
      csrfProtection: z.boolean().default(true),
      helmet: z.boolean().default(true)
    }),
    cache: z.object({
      ttl: z.number().int().positive().default(3600),
      maxSize: z.number().int().positive().default(1000),
      strategy: z.enum(['lru', 'lfu', 'ttl']).default('lru')
    }).optional()
  }).refine(data => {
    if (data.email?.provider === 'smtp' && !data.email.smtp) {
      return false;
    }
    return true;
  }, {
    message: "SMTP configuration is required when using SMTP provider",
    path: ["email", "smtp"]
  }),
  metadata: {
    framework: 'zod',
    compatibility: ['zod@^3.0.0'],
    language: 'typescript',
    size: 'large',
    complexity: 28,
    performance: {
      validationSpeed: 'medium',
      memoryUsage: 'medium',
      bundleSize: 3600
    },
    features: ['nested-objects', 'enums', 'defaults', 'custom-refinement', 'conditional-validation'],
    useCases: ['application-config', 'environment-settings', 'deployment-config', 'microservices'],
    industries: ['saas', 'enterprise', 'devtools', 'fintech']
  },
  examples: [
    {
      id: 'production-config',
      title: 'Production Configuration',
      description: 'Complete production configuration with all services',
      code: `const ConfigSchema = /* schema definition */;

const config = {
  app: {
    name: "MyApp",
    version: "1.2.3",
    environment: "production",
    debug: false,
    logLevel: "warn"
  },
  server: {
    host: "0.0.0.0",
    port: 8080,
    cors: {
      origin: ["https://myapp.com"],
      credentials: true
    }
  },
  database: {
    host: "db.myapp.com",
    port: 5432,
    username: "app_user",
    password: process.env.DB_PASSWORD,
    database: "myapp_prod",
    ssl: true
  },
  security: {
    jwtSecret: process.env.JWT_SECRET,
    jwtExpiry: "24h",
    bcryptRounds: 12
  },
  featureFlags: {
    newDashboard: true,
    experimentalFeature: false
  }
};

const result = ConfigSchema.parse(config);`,
      input: {
        app: {
          name: "MyApp",
          version: "1.0.0",
          environment: "production"
        },
        server: {
          port: 8080
        },
        database: {
          host: "localhost",
          port: 5432,
          username: "user",
          password: "pass",
          database: "myapp"
        },
        security: {
          jwtSecret: "very-long-secret-key-for-jwt-tokens"
        }
      },
      output: {
        app: {
          name: "MyApp",
          version: "1.0.0",
          environment: "production",
          debug: false,
          logLevel: "info"
        },
        server: {
          host: "localhost",
          port: 8080,
          cors: {
            origin: "*",
            credentials: false,
            methods: ["GET", "POST", "PUT", "DELETE"]
          }
        },
        database: {
          host: "localhost",
          port: 5432,
          username: "user",
          password: "pass",
          database: "myapp",
          ssl: false
        },
        security: {
          jwtSecret: "very-long-secret-key-for-jwt-tokens",
          jwtExpiry: "1h",
          bcryptRounds: 12,
          csrfProtection: true,
          helmet: true
        },
        featureFlags: {}
      },
      explanation: 'Validates comprehensive application configuration with environment-specific settings and security options',
      difficulty: 'intermediate'
    }
  ],
  documentation: {
    overview: 'A comprehensive configuration schema for modern applications with support for multiple databases, monitoring, and feature flags.',
    installation: 'npm install zod',
    usage: 'Use this schema to validate your application configuration, ensuring all required settings are present and valid.',
    api: [],
    faq: [],
    troubleshooting: [],
    migrations: []
  },
  dependencies: [
    {
      name: 'zod',
      version: '^3.0.0',
      type: 'required',
      description: 'TypeScript-first schema validation library'
    }
  ],
  customizations: [],
  created: new Date('2024-01-12'),
  updated: new Date('2024-01-22'),
  license: 'MIT',
  changelog: []
};

// Event Schema Template
export const EventSchemaTemplate: SchemaTemplate = {
  id: 'tpl_event_schema_005',
  name: 'Event Tracking Schema',
  description: 'Comprehensive event tracking schema for analytics, user behavior tracking, and business intelligence',
  version: '1.0.0',
  author: {
    name: 'Zodded Team',
    email: 'templates@zodded.dev'
  },
  tags: ['analytics', 'events', 'tracking', 'business-intelligence', 'user-behavior'],
  category: 'analytics',
  difficulty: 'intermediate',
  rating: 4.5,
  downloads: 780,
  schema: z.object({
    eventId: z.string().uuid(),
    eventName: z.string().min(1, 'Event name is required'),
    eventType: z.enum(['page_view', 'click', 'form_submit', 'purchase', 'signup', 'login', 'logout', 'custom']),
    timestamp: z.string().datetime(),
    userId: z.string().optional(),
    sessionId: z.string().uuid(),
    user: z.object({
      id: z.string().optional(),
      email: z.string().email().optional(),
      isAuthenticated: z.boolean(),
      role: z.string().optional(),
      segment: z.string().optional(),
      properties: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional()
    }),
    page: z.object({
      url: z.string().url(),
      title: z.string(),
      path: z.string(),
      referrer: z.string().url().optional(),
      search: z.string().optional(),
      hash: z.string().optional()
    }),
    device: z.object({
      userAgent: z.string(),
      platform: z.string(),
      browser: z.string(),
      browserVersion: z.string(),
      os: z.string(),
      osVersion: z.string(),
      deviceType: z.enum(['desktop', 'mobile', 'tablet']),
      screenResolution: z.string().optional(),
      language: z.string(),
      timezone: z.string()
    }),
    location: z.object({
      ip: z.string().regex(/^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/, 'Invalid IP address'),
      country: z.string().length(2).optional(),
      region: z.string().optional(),
      city: z.string().optional(),
      coordinates: z.object({
        latitude: z.number().min(-90).max(90),
        longitude: z.number().min(-180).max(180)
      }).optional()
    }).optional(),
    properties: z.record(z.string(), z.union([
      z.string(),
      z.number(),
      z.boolean(),
      z.array(z.string()),
      z.object({})
    ])).optional(),
    revenue: z.object({
      amount: z.number().positive(),
      currency: z.string().length(3),
      productId: z.string().optional(),
      transactionId: z.string().optional()
    }).optional(),
    experiment: z.object({
      id: z.string(),
      variant: z.string(),
      name: z.string()
    }).optional(),
    source: z.object({
      campaign: z.string().optional(),
      medium: z.string().optional(),
      source: z.string().optional(),
      term: z.string().optional(),
      content: z.string().optional()
    }).optional(),
    version: z.string().default('1.0'),
    environment: z.enum(['development', 'staging', 'production']).default('production')
  }),
  metadata: {
    framework: 'zod',
    compatibility: ['zod@^3.0.0'],
    language: 'typescript',
    size: 'large',
    complexity: 32,
    performance: {
      validationSpeed: 'medium',
      memoryUsage: 'medium',
      bundleSize: 3800
    },
    features: ['nested-objects', 'enums', 'optional-fields', 'union-types', 'ip-validation'],
    useCases: ['analytics-platforms', 'event-tracking', 'user-behavior-analysis', 'a-b-testing'],
    industries: ['saas', 'e-commerce', 'media', 'gaming', 'fintech']
  },
  examples: [
    {
      id: 'page-view-event',
      title: 'Page View Event',
      description: 'Basic page view tracking event',
      code: `const EventSchema = /* schema definition */;

const pageViewEvent = {
  eventId: crypto.randomUUID(),
  eventName: "Page Viewed",
  eventType: "page_view",
  timestamp: new Date().toISOString(),
  sessionId: crypto.randomUUID(),
  user: {
    isAuthenticated: false
  },
  page: {
    url: "https://example.com/products",
    title: "Products - Example Store",
    path: "/products"
  },
  device: {
    userAgent: navigator.userAgent,
    platform: "Web",
    browser: "Chrome",
    browserVersion: "120.0.0",
    os: "Windows",
    osVersion: "10",
    deviceType: "desktop",
    language: "en-US",
    timezone: "America/New_York"
  },
  properties: {
    category: "e-commerce",
    section: "products"
  }
};

const result = EventSchema.parse(pageViewEvent);`,
      input: {
        eventId: "123e4567-e89b-12d3-a456-426614174000",
        eventName: "Page Viewed",
        eventType: "page_view",
        timestamp: "2024-01-20T10:00:00Z",
        sessionId: "987fcdeb-51a2-43d1-9f4e-123456789abc",
        user: {
          isAuthenticated: false
        },
        page: {
          url: "https://example.com",
          title: "Home",
          path: "/"
        },
        device: {
          userAgent: "Mozilla/5.0...",
          platform: "Web",
          browser: "Chrome",
          browserVersion: "120.0.0",
          os: "Windows",
          osVersion: "10",
          deviceType: "desktop",
          language: "en-US",
          timezone: "UTC"
        }
      },
      output: {
        eventId: "123e4567-e89b-12d3-a456-426614174000",
        eventName: "Page Viewed",
        eventType: "page_view",
        timestamp: "2024-01-20T10:00:00Z",
        sessionId: "987fcdeb-51a2-43d1-9f4e-123456789abc",
        user: {
          isAuthenticated: false
        },
        page: {
          url: "https://example.com",
          title: "Home",
          path: "/"
        },
        device: {
          userAgent: "Mozilla/5.0...",
          platform: "Web",
          browser: "Chrome",
          browserVersion: "120.0.0",
          os: "Windows",
          osVersion: "10",
          deviceType: "desktop",
          language: "en-US",
          timezone: "UTC"
        },
        version: "1.0",
        environment: "production"
      },
      explanation: 'Validates comprehensive event tracking data for analytics and user behavior analysis',
      difficulty: 'intermediate'
    }
  ],
  documentation: {
    overview: 'A comprehensive event tracking schema for capturing user behavior, page views, conversions, and business metrics.',
    installation: 'npm install zod',
    usage: 'Use this schema to validate event data before sending to your analytics platform, ensuring data quality and consistency.',
    api: [],
    faq: [],
    troubleshooting: [],
    migrations: []
  },
  dependencies: [
    {
      name: 'zod',
      version: '^3.0.0',
      type: 'required',
      description: 'TypeScript-first schema validation library'
    }
  ],
  customizations: [],
  created: new Date('2024-01-08'),
  updated: new Date('2024-01-19'),
  license: 'MIT',
  changelog: []
};

export const BuiltinTemplates = [
  UserAuthTemplate,
  ApiResponseTemplate,
  EcommerceProductTemplate,
  ConfigurationTemplate,
  EventSchemaTemplate
];