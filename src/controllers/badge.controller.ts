import { eq, count } from "drizzle-orm";
import { db } from "@/db/config";
import { badgeAssertions, badgeClasses, issuerProfiles } from "@/db/schema";
import { getSigningKey } from "@/utils/signing/keys";
import * as ed from "@noble/ed25519";
import { base64url } from "@scure/base";
import {
  OB2_CONTEXT_URL,
  OB3_CREDENTIAL_CONTEXT,
  OB3_BADGE_SCHEMA_URL,
} from "@/constants/context-urls";

// Type definitions for badge JSON
interface BadgeClassJson {
  "@context": string;
  type: string;
  id: string;
  name: string;
  description: string;
  image: string;
  criteria: {
    narrative: string;
  };
  issuer: string;
}

interface OB3BadgeClassJson {
  "@context": string[];
  id: string;
  type: string[];
  name: string;
  description: string;
  image: {
    id: string;
    type: string;
  };
  achievementCriteria: {
    narrative: string;
  };
  issuer: {
    id: string;
    type: string;
  };
  credentialSchema: {
    id: string;
    type: string;
  };
}

// Type for recipient object
interface RecipientObject {
  type: string;
  identity: string;
  hashed: boolean;
  salt?: string;
}

export class BadgeController {
  async hasBadgeAssertions(badgeId: string): Promise<boolean> {
    const result = await db
      .select({ count: count() })
      .from(badgeAssertions)
      .where(eq(badgeAssertions.badgeId, badgeId));

    return result[0].count > 0;
  }

  /**
   * Construct an Open Badges 2.0 badge class JSON
   */
  constructBadgeClassJson(
    hostUrl: string,
    badge: {
      badgeId: string;
      issuerId: string;
      name: string;
      description: string;
      criteria: string;
      imageUrl: string;
    },
  ): BadgeClassJson {
    return {
      "@context": OB2_CONTEXT_URL,
      type: "BadgeClass",
      id: `${hostUrl}/badges/${badge.badgeId}`,
      name: badge.name,
      description: badge.description,
      image: badge.imageUrl,
      criteria: {
        narrative: badge.criteria,
      },
      issuer: `${hostUrl}/issuers/${badge.issuerId}`,
    };
  }

  /**
   * Construct an Open Badges 3.0 badge class JSON
   */
  constructOB3BadgeClassJson(
    hostUrl: string,
    badge: {
      badgeId: string;
      issuerId: string;
      name: string;
      description: string;
      criteria: string;
      imageUrl: string;
    },
  ): OB3BadgeClassJson {
    return {
      "@context": OB3_CREDENTIAL_CONTEXT,
      id: `${hostUrl}/badges/${badge.badgeId}`,
      type: ["VerifiableCredential", "OpenBadgeCredential"],
      name: badge.name,
      description: badge.description,
      image: {
        id: badge.imageUrl,
        type: "Image",
      },
      achievementCriteria: {
        narrative: badge.criteria,
      },
      issuer: {
        id: `${hostUrl}/issuers/${badge.issuerId}`,
        type: "Profile",
      },
      credentialSchema: {
        id: OB3_BADGE_SCHEMA_URL,
        type: "JsonSchemaValidator2018",
      },
    };
  }

  /**
   * Construct an Open Badges 2.0 assertion JSON
   */
  constructAssertionJson(
    hostUrl: string,
    assertion: {
      assertionId: string;
      badgeId: string;
      issuerId: string;
      recipientType: string;
      recipientIdentity: string;
      recipientHashed: boolean;
      issuedOn: Date;
      evidenceUrl?: string | null;
    },
    badgeJson: BadgeClassJson,
    // issuerJson param is retained for API consistency but not used in implementation
    _issuerJson: Record<string, unknown>,
  ) {
    const recipientObj: RecipientObject = {
      type: assertion.recipientType,
      identity: assertion.recipientIdentity,
      hashed: assertion.recipientHashed,
    };

    // Add salt if recipient is hashed
    if (assertion.recipientHashed) {
      recipientObj.salt = crypto.randomUUID();
    }

    return {
      "@context": OB2_CONTEXT_URL,
      type: "Assertion",
      id: `${hostUrl}/assertions/${assertion.assertionId}`,
      badge: badgeJson,
      recipient: recipientObj,
      issuedOn: assertion.issuedOn.toISOString(),
      verification: {
        type: "HostedBadge",
        verificationProperty: "id",
      },
      evidence: assertion.evidenceUrl
        ? {
            id: assertion.evidenceUrl,
            type: "Evidence",
          }
        : undefined,
    };
  }

  /**
   * Construct an Open Badges 3.0 assertion with cryptographic proof
   */
  async constructOB3AssertionJson(
    hostUrl: string,
    assertion: {
      assertionId: string;
      badgeId: string;
      issuerId: string;
      recipientType: string;
      recipientIdentity: string;
      recipientHashed: boolean;
      issuedOn: Date;
      evidenceUrl?: string | null;
    },
    badgeJson: OB3BadgeClassJson,
    // issuerJson param is retained for API consistency but not used in implementation
    _issuerJson: Record<string, unknown>,
  ) {
    // Create the base assertion
    const recipientObj: RecipientObject = {
      type:
        assertion.recipientType === "email"
          ? "EmailCredentialSubject"
          : "IdentityObject",
      identity: assertion.recipientIdentity,
      hashed: assertion.recipientHashed,
    };

    // Add salt if recipient is hashed
    if (assertion.recipientHashed) {
      recipientObj.salt = crypto.randomUUID();
    }

    const credential = {
      "@context": OB3_CREDENTIAL_CONTEXT,
      id: `${hostUrl}/assertions/${assertion.assertionId}`,
      type: ["VerifiableCredential", "OpenBadgeCredential"],
      issuer: {
        id: `${hostUrl}/issuers/${assertion.issuerId}`,
        type: "Profile",
      },
      issuanceDate: assertion.issuedOn.toISOString(),
      credentialSubject: {
        id: assertion.recipientIdentity,
        ...recipientObj,
        achievement: badgeJson,
      },
      evidence: assertion.evidenceUrl
        ? [
            {
              id: assertion.evidenceUrl,
              type: "Evidence",
            },
          ]
        : undefined,
    };

    // Add cryptographic proof
    const signingKey = await getSigningKey(assertion.issuerId);
    if (!signingKey) {
      throw new Error("Issuer signing key not found");
    }

    // Create a canonical form of the credential for signing
    const canonicalData = JSON.stringify(credential);
    const dataToSign = new TextEncoder().encode(canonicalData);

    // Sign the credential
    const signature = await ed.sign(dataToSign, signingKey.privateKey);
    const proofValue = base64url.encode(signature);

    // Add the proof to the credential
    return {
      ...credential,
      proof: {
        type: "DataIntegrityProof",
        cryptosuite: "eddsa-rdfc-2022",
        created: new Date().toISOString(),
        verificationMethod: signingKey.keyInfo.id,
        proofPurpose: "assertionMethod",
        proofValue,
      },
    };
  }

  /**
   * Get issuer with public key for credential verification
   */
  async getIssuerWithPublicKey(issuerId: string) {
    const [issuer] = await db
      .select()
      .from(issuerProfiles)
      .where(eq(issuerProfiles.issuerId, issuerId));

    if (!issuer) {
      throw new Error("Issuer not found");
    }

    return issuer;
  }

  /**
   * Get badge class details for credential
   */
  async getBadgeClass(badgeId: string) {
    const [badge] = await db
      .select()
      .from(badgeClasses)
      .where(eq(badgeClasses.badgeId, badgeId));

    if (!badge) {
      throw new Error("Badge not found");
    }

    return badge;
  }
}
