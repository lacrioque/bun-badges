import { config } from "dotenv";
import * as path from "path";
import { mock } from "bun:test";

// Load test environment variables
config({ path: path.resolve(process.cwd(), "test.env") });

// Define test keys for deterministic crypto
export const TEST_KEYS = {
  privateKey: new Uint8Array(32).fill(1), // Fixed for tests
  publicKey: new Uint8Array(32).fill(2), // Fixed for tests
  signature: new Uint8Array(64).fill(3), // Fixed for tests
};

console.log("🔧 Unit test setup loading...");

// Create deterministic crypto mocks
mock.module("@noble/ed25519", () => {
  return {
    etc: {
      sha512Sync: (_data: Uint8Array) => {
        // Return a consistent hash for testing
        const hash = new Uint8Array(64);
        hash.fill(9);
        return hash;
      },
    },
    utils: {
      randomPrivateKey: (): Uint8Array => {
        return TEST_KEYS.privateKey.slice();
      },
      sha512: async (_data: Uint8Array) => {
        // Return a consistent hash for testing
        const hash = new Uint8Array(64);
        hash.fill(9);
        return hash;
      },
    },
    getPublicKey: async (_privateKey: Uint8Array): Promise<Uint8Array> => {
      // Return consistent test public key
      return TEST_KEYS.publicKey.slice();
    },
    sign: async (
      _message: Uint8Array,
      _privateKey: Uint8Array,
    ): Promise<Uint8Array> => {
      // Return consistent test signature
      return TEST_KEYS.signature.slice();
    },
    verify: async (
      _signature: Uint8Array,
      _message: Uint8Array,
      publicKey: Uint8Array,
    ): Promise<boolean> => {
      // For testing, always verify if using the test public key
      return (
        publicKey.length === TEST_KEYS.publicKey.length &&
        publicKey[0] === TEST_KEYS.publicKey[0]
      );
    },
  };
});

// Also mock the base64url from @scure/base
mock.module("@scure/base", () => {
  return {
    base64url: {
      decode: (_str: string): Uint8Array => {
        // Return test signature for any base64 input
        return TEST_KEYS.signature.slice();
      },
      encode: (_bytes: Uint8Array): string => {
        // Return consistent base64 string
        return "TEST_BASE64_SIGNATURE";
      },
    },
    base58: {
      decode: (_str: string): Uint8Array => {
        // If it looks like our test key encoding, return the test key
        return TEST_KEYS.publicKey.slice();
      },
      encode: (_bytes: Uint8Array): string => {
        // Return a consistent base58 string
        return "TEST_BASE58_KEY";
      },
    },
  };
});

// Create a function that returns a chainable mock
const createChainableMock = () => {
  const handler = {
    get: (_target: object, prop: string | symbol) => {
      if (prop === "array") {
        return () => new Proxy({}, handler);
      }
      return () => new Proxy({}, handler);
    },
  };
  return new Proxy({}, handler);
};

// Create drizzle-orm mock functions
const drizzleMocks = {
  eq: () => ({ operator: "eq" }),
  and: () => ({ operator: "and" }),
  gt: () => ({ operator: "gt" }),
  lt: () => ({ operator: "lt" }),
  ne: () => ({ operator: "ne" }),
  gte: () => ({ operator: "gte" }),
  lte: () => ({ operator: "lte" }),
  like: () => ({ operator: "like" }),
  ilike: () => ({ operator: "ilike" }),
  notLike: () => ({ operator: "not_like" }),
  notIlike: () => ({ operator: "not_ilike" }),
  between: () => ({ operator: "between" }),
  isNull: () => ({ operator: "is_null" }),
  isNotNull: () => ({ operator: "is_not_null" }),
  in: () => ({ operator: "in" }),
  notIn: () => ({ operator: "not_in" }),
  exists: () => ({ operator: "exists" }),
  notExists: () => ({ operator: "not_exists" }),
  // Add any other operators as needed
};

// Create drizzle-orm column types
const pgColumnTypes = {
  pgTable: () => createChainableMock(),
  text: () => createChainableMock(),
  varchar: () => createChainableMock(),
  uuid: () => createChainableMock(),
  timestamp: () => createChainableMock(),
  boolean: () => createChainableMock(),
  jsonb: () => createChainableMock(),
  integer: () => createChainableMock(),
  serial: () => createChainableMock(),
  numeric: () => createChainableMock(),
  date: () => createChainableMock(),
  time: () => createChainableMock(),
  PgArray: () => createChainableMock(),
};

// Mock drizzle-orm to fix import issues - use both named imports and module properties
mock.module("drizzle-orm", () => {
  return {
    ...drizzleMocks,
    relations: {
      oneToMany: () => ({}),
      manyToOne: () => ({}),
      manyToMany: () => ({}),
      // Add other relation types
    },
    sql: {
      raw: () => ({}),
    },
    // Add other exports as needed
  };
});

// Mock drizzle-orm/pg-core
mock.module("drizzle-orm/pg-core", () => {
  return {
    ...pgColumnTypes,
    // Add other exports as needed
  };
});

// Mock node_modules/drizzle-orm directly
// This is a more aggressive approach that might be needed for tests that import directly from node_modules
mock.module(
  "/Users/joeczarnecki/Code/rollercoaster.dev/bun-badges/node_modules/drizzle-orm/index.js",
  () => {
    return {
      ...drizzleMocks,
      relations: {
        oneToMany: () => ({}),
        manyToOne: () => ({}),
        manyToMany: () => ({}),
      },
      sql: {
        raw: () => ({}),
      },
    };
  },
);

// Mock the DatabaseService for tests that need database access
mock.module("@/services/db.service", () => {
  const dbMock = {
    insert: () => ({ values: () => Promise.resolve([]) }),
    select: () => ({
      from: () => ({ where: () => ({ limit: () => Promise.resolve([]) }) }),
    }),
  };

  return {
    DatabaseService: class {
      constructor() {
        // No initialization needed for mock
      }
      // Add any required methods that controllers might call
      db = dbMock;
    },
  };
});

console.log("✅ Unit test setup complete");
