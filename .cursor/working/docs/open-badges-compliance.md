# Open Badges Compliance

## Open Badges 2.0 Support
The server will fully comply with the Open Badges 2.0 specification, which defines a standard JSON-LD data model for digital badges. Our implementation includes:

### Core Components
- Support for all core Open Badges entities:
  - Issuer Profile
  - BadgeClass
  - Assertion
- Required metadata and JSON-LD context
- Badge verification endpoints
- Badge "baking" functionality for both PNG and SVG formats

### Badge Baking Implementation
Our badge baking feature supports embedding assertions into both PNG and SVG badge images:

#### PNG Badge Baking
- Uses the `png-itxt` library to embed data in PNG tEXt chunks
- Implements stream-based processing for efficient handling
- Supports basic extraction (with some browser limitations)
- Conforms to Open Badges 2.0 specification for PNG baking

#### SVG Badge Baking
- Implements direct XML manipulation in SVG files
- Adds the Open Badges namespace to the SVG tag
- Inserts the assertion as a CDATA block inside an `openbadges:assertion` element
- Provides complete baking and extraction capabilities
- Better cross-platform and browser compatibility

#### API Support
- GET endpoint to bake badges: `/api/badges/bake/:badgeId/:assertionId`
- POST endpoint to extract data: `/api/badges/extract`
- Format detection and appropriate processing for both PNG and SVG

### Implementation Details
- JSON-LD uses proper context (https://w3id.org/openbadges/v2)
- All required properties for OB 2.0 compliance
- Support for both baked image files and hosted verification
- IMS Open Badges 2.0 certification standards compliance

## Open Badges 3.0 Support (Roadmap)
Future alignment with W3C Verifiable Credentials, making badges self-contained and cryptographically verifiable.

### Phase 1 (Initial Release)
- Support OB 2.0 issuance and verification
- Use IMS test suites for validation
- Ensure badge JSON and workflows meet 2.0 standard

### Phase 2 (3.0 Upgrade Path)
- Generate issuer public/private key pairs
- Sign badge Assertions as verifiable credentials
- Implement cryptographic libraries in Bun
- Support W3C Verifiable Credentials data model

### Interoperability
- Offer badges in both 2.0 and 3.0 formats
- Consider OB 2.1 (Badge Connect) features
- Support user-driven badge exchange
- Maintain backward compatibility

### Certification
- Aim for 1EdTech (IMS) certification
- Follow conformance and testing guides
- Validate against required and optional criteria
- Pursue formal OB 3.0 compliance certification 