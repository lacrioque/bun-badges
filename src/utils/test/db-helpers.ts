import { db } from "@/db/config";
import {
  issuerProfiles,
  badgeClasses,
  badgeAssertions,
  signingKeys,
  verificationCodes,
  revokedTokens,
} from "@/db/schema";
import { users } from "@/db/schema/index";
import { sql, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { createMockContext } from "./mock-context";
import { OB2BadgeAssertion } from "@/services/verification.service";
import { OpenBadgeCredential } from "@/models/credential.model";
import {
  getOB2AssertionJson,
  getOB3CredentialJson,
  updateOB2AssertionJson,
  updateOB3CredentialJson,
} from "../../../tests/helpers/test-utils";

/**
 * Test data interface
 */
export interface TestData {
  user: any;
  issuer: any;
  badge: any;
  assertion: any;
  signingKey: any;
}

/**
 * Helper to generate test data for integration tests
 * Uses a transaction to ensure data consistency and proper order of creation
 */
export async function seedTestData() {
  console.log("Seeding fresh test data...");

  try {
    // Clear existing data first
    await clearTestData();

    // Start a transaction
    const result = await db.transaction(async (tx) => {
      console.log("Creating test user...");

      // 1. Create a test user first
      const userId = crypto.randomUUID();
      await tx.insert(users).values({
        userId: userId,
        email: "test@example.com",
        passwordHash: "hashed_password",
        name: "Test User",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      console.log("Creating test issuer...");

      // 2. Create a test issuer profile
      const issuerId = crypto.randomUUID();
      await tx.insert(issuerProfiles).values({
        issuerId: issuerId,
        name: "Test Issuer",
        url: "https://example.org",
        description: "A test issuer for integration tests",
        email: "issuer@example.org",
        ownerUserId: userId, // Reference to the user we just created
        issuerJson: {
          "@context": "https://w3id.org/openbadges/v2",
          type: "Issuer",
          id: "https://example.org/issuer",
          name: "Test Issuer",
          url: "https://example.org",
          email: "issuer@example.org",
          description: "A test issuer for integration tests",
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      console.log("Creating test badge...");

      // 3. Create a test badge class
      const badgeId = crypto.randomUUID();
      await tx.insert(badgeClasses).values({
        badgeId: badgeId,
        issuerId: issuerId,
        name: "Test Badge",
        description: "A test badge for integration tests",
        imageUrl: "https://example.org/badge.png",
        criteria: "Earn this badge by completing integration tests",
        badgeJson: {
          "@context": "https://w3id.org/openbadges/v2",
          type: "BadgeClass",
          id: "https://example.org/badges/test-badge",
          name: "Test Badge",
          description: "A test badge for integration tests",
          image: "https://example.org/badge.png",
          criteria: {
            narrative: "Earn this badge by completing integration tests",
          },
          issuer: "https://example.org/issuer",
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      console.log("Creating test signing key...");

      // 4. Create test signing keys
      // First key
      const keyId1 = await createTestSigningKey(issuerId, tx);

      // Get the public key multibase for use in assertions
      const signingKeyInfo = await tx
        .select()
        .from(signingKeys)
        .where(sql`key_id = ${keyId1}`)
        .execute();
      const publicKeyMultibase =
        signingKeyInfo[0]?.publicKeyMultibase ||
        "z6MksSBa6fJgGBw4m3WxoLLHJ4mji9iodcYQXJmF7xT9wFQZ";

      console.log("Creating test signing key...");

      // Second key with slight variation for testing multiple keys
      const keyId2 = crypto.randomUUID();
      await tx.insert(signingKeys).values({
        keyId: keyId2,
        issuerId: issuerId,
        // Use different multibase values
        publicKeyMultibase: "z6MkrJVSNvnYyRKhJ5kJGcECFNLKNH7K2HdpYyZyTgRGZZ9B",
        privateKeyMultibase:
          "z3u2DLdPxfnAvY2Z1iK9LUqs2KyaQtKDFsXEQD8jEEqiYjWQzJisSvDqYVZ4kzRG4XA5yxcVBrkgtk9ntegCbD1KR",
        controller: `did:key:z6MkrJVSNvnYyRKhJ5kJGcECFNLKNH7K2HdpYyZyTgRGZZ9B`,
        type: "Ed25519VerificationKey2020",
        keyInfo: {
          "@context": "https://w3id.org/security/v2",
          id: `did:key:z6MkrJVSNvnYyRKhJ5kJGcECFNLKNH7K2HdpYyZyTgRGZZ9B#z6MkrJVSNvnYyRKhJ5kJGcECFNLKNH7K2HdpYyZyTgRGZZ9B`,
          type: "Ed25519VerificationKey2020",
          controller: `did:key:z6MkrJVSNvnYyRKhJ5kJGcECFNLKNH7K2HdpYyZyTgRGZZ9B`,
          publicKeyMultibase:
            "z6MkrJVSNvnYyRKhJ5kJGcECFNLKNH7K2HdpYyZyTgRGZZ9B",
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      console.log("Creating test assertion...");

      // 5. Create a test badge assertion
      const assertionId = crypto.randomUUID();
      await tx.insert(badgeAssertions).values({
        assertionId: assertionId,
        badgeId: badgeId,
        issuerId: issuerId,
        recipientType: "email",
        recipientIdentity: "recipient@example.com",
        recipientHashed: false,
        issuedOn: new Date(),
        evidenceUrl: "https://example.org/evidence",
        revoked: false,
        assertionJson: {
          "@context": "https://w3id.org/openbadges/v2",
          type: "Assertion",
          id: `https://example.org/assertions/${assertionId}`,
          recipient: {
            type: "email",
            identity: "recipient@example.com",
            hashed: false,
          },
          badge: "https://example.org/badges/test-badge",
          issuedOn: new Date().toISOString(),
          verification: {
            type: "hosted",
          },
          evidence: "https://example.org/evidence",
          // Add OB3 proof for verification tests
          proof: {
            type: "DataIntegrityProof",
            cryptosuite: "eddsa-rdfc-2022",
            created: new Date().toISOString(),
            verificationMethod: `did:key:${publicKeyMultibase}#${publicKeyMultibase}`,
            proofPurpose: "assertionMethod",
            proofValue:
              "z4oey5q2M3XKaxup3tmzN4DRFTLVqpLMweBrSxMY2xnrHmKYhBrTuxmTcBNwDiond5bnVKXdK7xRMCa2Z2GuRQcKS",
          },
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Return all created IDs for test usage
      return {
        userId,
        issuerId,
        badgeId,
        assertionId,
        signingKeyId1: keyId1,
        signingKeyId2: keyId2,

        // Also provide the nested structure for backward compatibility
        user: { userId },
        issuer: { issuerId },
        badge: { badgeId },
        assertion: { assertionId },
        signingKey: { keyId: keyId1 },
      };
    });

    console.log("✅ Fresh test data created successfully");
    return result;
  } catch (error) {
    console.error("Error seeding test data:", error);
    throw error;
  }
}

/**
 * Seed test verification code
 */
export async function seedVerificationCode(
  username: string,
  code: string = "123456",
) {
  const expiresAt = new Date();
  expiresAt.setMinutes(expiresAt.getMinutes() + 5);

  const [verificationCode] = await db
    .insert(verificationCodes)
    .values({
      id: nanoid(),
      username,
      code,
      expiresAt,
      attempts: [],
    })
    .returning();

  return verificationCode;
}

/**
 * Clear test data from the database
 * This deletes all test data in the correct order to avoid foreign key constraints
 */
export async function clearTestData() {
  console.log("🧹 Clearing test data from database...");
  try {
    // Disable foreign key checks (for PostgreSQL)
    await db.execute(sql`SET session_replication_role = 'replica'`);

    try {
      // Get a list of existing tables
      const tablesResult = await db.execute(sql`
        SELECT tablename FROM pg_tables
        WHERE schemaname = 'public'
        AND tablename IN ('badge_assertions', 'badge_classes', 'signing_keys', 
                         'issuer_profiles', 'verification_codes', 'revoked_tokens', 'users')
      `);

      const existingTables = tablesResult.rows.map((row) => row.tablename);
      console.log(`Existing tables: ${existingTables.join(", ") || "none"}`);

      // If we have any tables, delete data from them
      if (existingTables.length > 0) {
        // Clear data individually from each table to handle tables that might not exist
        if (existingTables.includes("badge_assertions")) {
          await db.delete(badgeAssertions);
        }

        if (existingTables.includes("badge_classes")) {
          await db.delete(badgeClasses);
        }

        if (existingTables.includes("signing_keys")) {
          await db.delete(signingKeys);
        }

        if (existingTables.includes("issuer_profiles")) {
          await db.delete(issuerProfiles);
        }

        if (existingTables.includes("verification_codes")) {
          await db.delete(verificationCodes);
        }

        if (existingTables.includes("revoked_tokens")) {
          await db.delete(revokedTokens);
        }

        if (existingTables.includes("users")) {
          await db.delete(users);
        }

        console.log("✅ Test data cleared successfully");
      } else {
        console.log("⚠️ No tables found to clear");
      }
    } finally {
      // Re-enable foreign key checks
      await db.execute(sql`SET session_replication_role = 'origin'`);
    }
  } catch (error) {
    console.error("❌ Error clearing test data:", error);
    throw error;
  }
}

/**
 * Creates a consistent test signing key for use across tests
 * @param issuerId - The issuer ID to associate with the key
 * @param tx - Optional transaction to use (for nested transactions)
 * @returns The created signing key ID
 */
export async function createTestSigningKey(issuerId: string, tx?: any) {
  // Use predictable test keys for signing
  const publicKeyMultibase = "z6MksSBa6fJgGBw4m3WxoLLHJ4mji9iodcYQXJmF7xT9wFQZ";
  const privateKeyMultibase =
    "z3u2en7t32RYgLVdTt7GHwcgmJn3nXFPS4SadJvNnXBihgxV2vGWTn9WuJmJfMK1o3UXe7m8TqdqeH7DuHNLmDBLm";

  // Create consistent key ID with did:key format
  const controller = `did:key:${publicKeyMultibase}`;
  const keyId = crypto.randomUUID();

  // Use the transaction if provided, otherwise use the global db
  const dbContext = tx || db;

  // Insert the test signing key
  await dbContext.insert(signingKeys).values({
    keyId,
    issuerId,
    publicKeyMultibase,
    privateKeyMultibase,
    controller,
    type: "Ed25519VerificationKey2020",
    keyInfo: {
      "@context": "https://w3id.org/security/v2",
      id: `${controller}#${publicKeyMultibase}`,
      type: "Ed25519VerificationKey2020",
      controller,
      publicKeyMultibase,
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  return keyId;
}

// Forward the export from mock-context.ts
export { createMockContext };

/**
 * Get assertion JSON from the database
 */
export async function getAssertionJson(
  assertionId: string,
): Promise<OB2BadgeAssertion | OpenBadgeCredential> {
  const assertion = await db
    .select()
    .from(badgeAssertions)
    .where(eq(badgeAssertions.assertionId, assertionId))
    .limit(1);

  if (!assertion || assertion.length === 0) {
    throw new Error(`Assertion ${assertionId} not found`);
  }

  const assertionJson = assertion[0].assertionJson;
  if (!assertionJson) {
    throw new Error(`Assertion ${assertionId} has no JSON data`);
  }

  // Check if it's an OB3 credential
  const maybeOB3 = assertionJson as Record<string, unknown>;
  if (
    Array.isArray(maybeOB3["@context"]) &&
    maybeOB3["@context"].some(
      (ctx: unknown) =>
        typeof ctx === "string" && ctx.includes("credentials/v1"),
    )
  ) {
    return getOB3CredentialJson(assertionId);
  }

  return getOB2AssertionJson(assertionId);
}

/**
 * Update assertion JSON in the database
 */
export async function updateAssertionJson(
  assertionId: string,
  updates: Partial<OB2BadgeAssertion | OpenBadgeCredential>,
): Promise<void> {
  // Check if it's an OB3 credential
  const maybeOB3 = updates as Record<string, unknown>;
  const updatedJson =
    Array.isArray(maybeOB3["@context"]) &&
    maybeOB3["@context"].some(
      (ctx: unknown) =>
        typeof ctx === "string" && ctx.includes("credentials/v1"),
    )
      ? updateOB3CredentialJson(
          assertionId,
          updates as Partial<OpenBadgeCredential>,
        )
      : updateOB2AssertionJson(
          assertionId,
          updates as Partial<OB2BadgeAssertion>,
        );

  await db
    .update(badgeAssertions)
    .set({
      assertionJson: updatedJson,
    })
    .where(eq(badgeAssertions.assertionId, assertionId));
}
