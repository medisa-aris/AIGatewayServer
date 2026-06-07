-- Migration 006: Seed sample PII detection profiles
-- Safe to re-run (ON CONFLICT DO NOTHING).
-- Requires orgs a1111111... (Acme Corp) and a2222222... (Beta Labs) from sample data.

-- ─── Acme Corp ────────────────────────────────────────────────────────────────

INSERT INTO pii_objects (id, org_id, name, description, detection_method, pattern, masking_style, replacement_text, min_confidence, is_active)
VALUES
  -- 1. Social Security Number (SSN)
  ('00000001-0000-0000-0000-000000000000',
   'a1111111-1111-1111-1111-111111111111',
   'Social Security Number',
   'US Social Security Number in NNN-NN-NNNN format',
   'regex',
   '\b\d{3}-\d{2}-\d{4}\b',
   'redact',
   '[REDACTED]',
   0.99,
   TRUE),

  -- 2. Credit Card Number
  ('00000002-0000-0000-0000-000000000000',
   'a1111111-1111-1111-1111-111111111111',
   'Credit Card Number',
   'Major card networks: Visa, Mastercard, Amex, Discover (16-digit with optional separators)',
   'regex',
   '\b(?:\d{4}[- ]?){3}\d{4}\b',
   'partial',
   NULL,
   0.95,
   TRUE),

  -- 3. Email Address
  ('00000003-0000-0000-0000-000000000000',
   'a1111111-1111-1111-1111-111111111111',
   'Email Address',
   'Standard RFC-5322 email address pattern',
   'regex',
   '[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}',
   'replace',
   '[EMAIL]',
   0.98,
   TRUE),

  -- 4. US Phone Number
  ('00000004-0000-0000-0000-000000000000',
   'a1111111-1111-1111-1111-111111111111',
   'US Phone Number',
   'US phone numbers with optional country code, parentheses, dashes, dots, or spaces',
   'regex',
   '\b(\+1[\s.\-]?)?\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4}\b',
   'partial',
   NULL,
   0.90,
   TRUE),

  -- 5. IPv4 Address
  ('00000005-0000-0000-0000-000000000000',
   'a1111111-1111-1111-1111-111111111111',
   'IPv4 Address',
   'IPv4 address that may identify a user device or internal system',
   'regex',
   '\b(?:\d{1,3}\.){3}\d{1,3}\b',
   'hash',
   NULL,
   0.85,
   TRUE),

  -- 6. Date of Birth
  ('00000006-0000-0000-0000-000000000000',
   'a1111111-1111-1111-1111-111111111111',
   'Date of Birth',
   'Date in DD/MM/YYYY or DD-MM-YYYY format commonly used for date of birth',
   'regex',
   '\b\d{2}[\/\-]\d{2}[\/\-]\d{4}\b',
   'replace',
   '[DOB]',
   0.80,
   TRUE),

  -- 7. Passport Number
  ('00000007-0000-0000-0000-000000000000',
   'a1111111-1111-1111-1111-111111111111',
   'Passport Number',
   'International passport number (1-2 uppercase letters followed by 6-9 digits)',
   'regex',
   '\b[A-Z]{1,2}\d{6,9}\b',
   'redact',
   '[REDACTED]',
   0.85,
   TRUE),

  -- 8. Bank Account Number
  ('00000008-0000-0000-0000-000000000000',
   'a1111111-1111-1111-1111-111111111111',
   'Bank Account Number',
   'Generic bank account number (8-17 consecutive digits)',
   'regex',
   '\b\d{8,17}\b',
   'hash',
   NULL,
   0.75,
   TRUE),

  -- 9. Person Name (NER)
  ('00000009-0000-0000-0000-000000000000',
   'a1111111-1111-1111-1111-111111111111',
   'Person Name',
   'Named Entity Recognition — detects human names in free text without a fixed pattern',
   'ner',
   NULL,
   'replace',
   '[NAME]',
   0.85,
   TRUE),

  -- 10. Physical Address (NER)
  ('00000010-0000-0000-0000-000000000000',
   'a1111111-1111-1111-1111-111111111111',
   'Physical Address',
   'Named Entity Recognition — detects street addresses, cities, states, and postal codes',
   'ner',
   NULL,
   'redact',
   '[REDACTED]',
   0.80,
   TRUE),

  -- 11. Medical Information (LLM)
  ('00000011-0000-0000-0000-000000000000',
   'a1111111-1111-1111-1111-111111111111',
   'Medical Information',
   'LLM-based detection of diagnoses, medications, lab results, and clinical notes',
   'llm',
   NULL,
   'redact',
   '[REDACTED]',
   0.90,
   TRUE),

  -- 12. Financial Account Details (LLM)
  ('00000012-0000-0000-0000-000000000000',
   'a1111111-1111-1111-1111-111111111111',
   'Financial Account Details',
   'LLM-based detection of account balances, transaction histories, and investment portfolios',
   'llm',
   NULL,
   'replace',
   '[FINANCIAL_INFO]',
   0.88,
   TRUE)

ON CONFLICT (id) DO NOTHING;


-- ─── Beta Labs ────────────────────────────────────────────────────────────────

INSERT INTO pii_objects (id, org_id, name, description, detection_method, pattern, masking_style, replacement_text, min_confidence, is_active)
VALUES
  -- 13. Driver's License
  ('00000013-0000-0000-0000-000000000000',
   'a2222222-2222-2222-2222-222222222222',
   'Driver''s License Number',
   'US state driver''s license: 1-2 uppercase letters followed by 6-8 digits',
   'regex',
   '\b[A-Z]{1,2}\d{6,8}\b',
   'partial',
   NULL,
   0.80,
   TRUE),

  -- 14. Vehicle VIN
  ('00000014-0000-0000-0000-000000000000',
   'a2222222-2222-2222-2222-222222222222',
   'Vehicle Identification Number (VIN)',
   'ISO 3779 VIN — exactly 17 alphanumeric characters excluding I, O, and Q',
   'regex',
   '\b[A-HJ-NPR-Z0-9]{17}\b',
   'redact',
   '[REDACTED]',
   0.92,
   TRUE),

  -- 15. National ID / NPWP (Indonesia)
  ('00000015-0000-0000-0000-000000000000',
   'a2222222-2222-2222-2222-222222222222',
   'National Tax ID (NPWP)',
   'Indonesian NPWP format: XX.XXX.XXX.X-XXX.XXX',
   'regex',
   '\b\d{2}\.\d{3}\.\d{3}\.\d-\d{3}\.\d{3}\b',
   'hash',
   NULL,
   0.97,
   TRUE),

  -- 16. ZIP / Postal Code
  ('00000016-0000-0000-0000-000000000000',
   'a2222222-2222-2222-2222-222222222222',
   'ZIP / Postal Code',
   'US ZIP code (5-digit) with optional ZIP+4 extension',
   'regex',
   '\b\d{5}(-\d{4})?\b',
   'replace',
   '[ZIP]',
   0.70,
   TRUE),

  -- 17. Organization Name (NER)
  ('00000017-0000-0000-0000-000000000000',
   'a2222222-2222-2222-2222-222222222222',
   'Organization Name',
   'Named Entity Recognition — detects company, institution, and brand names',
   'ner',
   NULL,
   'replace',
   '[ORG]',
   0.80,
   TRUE),

  -- 18. Geographic Location (NER)
  ('00000018-0000-0000-0000-000000000000',
   'a2222222-2222-2222-2222-222222222222',
   'Geographic Location',
   'Named Entity Recognition — detects cities, regions, countries, and landmarks',
   'ner',
   NULL,
   'partial',
   NULL,
   0.75,
   TRUE),

  -- 19. Legal / Confidential Information (LLM)
  ('00000019-0000-0000-0000-000000000000',
   'a2222222-2222-2222-2222-222222222222',
   'Legal / Confidential Information',
   'LLM-based detection of attorney-client privileged content, contracts, and litigation details',
   'llm',
   NULL,
   'redact',
   '[REDACTED]',
   0.90,
   TRUE),

  -- 20. Internal Code Names (dict)
  ('00000020-0000-0000-0000-000000000000',
   'a2222222-2222-2222-2222-222222222222',
   'Internal Code Names',
   'Dictionary lookup — matches internal project codenames, product names, and initiative labels',
   'dict',
   NULL,
   'replace',
   '[INTERNAL]',
   0.99,
   TRUE),

  -- 21. Profanity / Offensive Terms (dict)
  ('00000021-0000-0000-0000-000000000000',
   'a2222222-2222-2222-2222-222222222222',
   'Profanity / Offensive Terms',
   'Dictionary lookup — blocks or redacts profane and offensive language from AI responses',
   'dict',
   NULL,
   'redact',
   '[REDACTED]',
   0.99,
   TRUE)

ON CONFLICT (id) DO NOTHING;
