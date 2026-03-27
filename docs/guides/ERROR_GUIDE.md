# Error Handling Pattern Summary

## 1. Error Code Naming Convention

Your codebase uses a prefix-based naming system, where each prefix represents a different type of error. first three characters(only 3 and not beyond that) are the type of error and the next 4 digits are the error code.
- GEN - General errors (GEN1001-GEN1028)
- VAL - Validation errors (VAL1001-VAL1007)
- DAB - Database errors (DAB1001-DAB1010+)
- PAY - Payment errors (PAY1001-PAY1012+)
- AUD - Audit errors (AUD1001, AUD1016)
- UNK - Unknown errors (UNK1001)
- APP - Application-specific errors (APP1056, APP1057, APP1073)

## 2. Error Structure

  Each error definition includes:
  {
    code: string;              // e.g., "GEN1001"
    message: string;           // User-friendly message
    messageKey: string;        // i18n localization key
    errorType: ErrorType;      // Error type classification
    errorCategory: ErrorCategory; // Business domain category
    statusCode: number;        // HTTP status code
  }

## 3. Error Types 

Error types are used to classify the type of error that occurred. They are used to determine the appropriate response to the error.

  - CRITICAL, FATAL, SYSTEM, OPERATIONAL, VALIDATION
  - BUSINESS_LOGIC, AUTHENTICATION, AUTHORIZATION
  - CONCURRENCY, FRAUD, DATABASE, DEPENDENCY
  - TIMEOUT, USER_INPUT, SECURITY, CONFIGURATION
  - DATA_INTEGRITY, RATE_LIMITING, RETRYABLE, etc.

## 4. Error Categories 

Error categories are used to classify the type of error that occurred. They are used to determine the appropriate response to the error.    

  - CLIENT, SERVER, NETWORK, SECURITY, TRANSACTION
  - COMPLIANCE, THIRD_PARTY, AUTHENTICATION, AUTHORIZATION
  - PAYMENT_GATEWAY, DATABASE, API, QUEUE
  - DATA_VALIDATION, RESOURCE_LIMIT, SESSION, etc.

## 5. Architecture Pattern

Error handling is implemented using a builder pattern. The BaseError class is the foundation error class. The BaseAbstractErrorFactory is used to create errors. The ErrorOptions interface is used to standardize error configuration.

Domain-Specific Factories:
  - ValidationErrorFactory
  - DatabaseErrorFactory 
  - PaymentErrorFactory 
  - AuditErrorFactory

Centralized Registry:
  - ERROR_CODE_MAP - Central lookup for all errors
  - Errors object - Error definitions catalog

Error Serialization Methods

  - toJSON() - Full details for internal logging
  - toClientJSON() - Safe client response (excludes stack traces)
  - toAuditJSON() - Audit trail format

## 7. Standard Response Format

  {
    "statusCode": 400,
    "errors": [{
      "errorCode": "GEN1001",
      "statusCode": 400,
      "errorType": "VALIDATION",
      "errorCategory": "CLIENT",
      "message": "Invalid input...",
      "messageKey": "error.validation.GEN1001.invalid_ajv_input",
      "data": {}
    }]
  }

## 8. Key Files

  - Base framework
  - Error class
  - Error catalog
  - Exception filter
  - Domain errors

This is an enterprise-grade error handling system with full type safety, localization support, and comprehensive traceability!