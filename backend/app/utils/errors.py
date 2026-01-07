"""
Error definitions following the ERROR_GUIDE.md pattern.
Provides standardized error codes and messages for the application.
"""

from enum import Enum
from typing import Optional, Dict, Any
from fastapi import HTTPException, status


class ErrorType(str, Enum):
    """Error type classification"""
    CRITICAL = "CRITICAL"
    FATAL = "FATAL"
    SYSTEM = "SYSTEM"
    OPERATIONAL = "OPERATIONAL"
    VALIDATION = "VALIDATION"
    BUSINESS_LOGIC = "BUSINESS_LOGIC"
    AUTHENTICATION = "AUTHENTICATION"
    AUTHORIZATION = "AUTHORIZATION"
    CONCURRENCY = "CONCURRENCY"
    FRAUD = "FRAUD"
    DATABASE = "DATABASE"
    DEPENDENCY = "DEPENDENCY"
    TIMEOUT = "TIMEOUT"
    USER_INPUT = "USER_INPUT"
    SECURITY = "SECURITY"
    CONFIGURATION = "CONFIGURATION"
    DATA_INTEGRITY = "DATA_INTEGRITY"
    RATE_LIMITING = "RATE_LIMITING"
    RETRYABLE = "RETRYABLE"


class ErrorCategory(str, Enum):
    """Error category classification"""
    CLIENT = "CLIENT"
    SERVER = "SERVER"
    NETWORK = "NETWORK"
    SECURITY = "SECURITY"
    TRANSACTION = "TRANSACTION"
    COMPLIANCE = "COMPLIANCE"
    THIRD_PARTY = "THIRD_PARTY"
    AUTHENTICATION = "AUTHENTICATION"
    AUTHORIZATION = "AUTHORIZATION"
    PAYMENT_GATEWAY = "PAYMENT_GATEWAY"
    DATABASE = "DATABASE"
    API = "API"
    QUEUE = "QUEUE"
    DATA_VALIDATION = "DATA_VALIDATION"
    RESOURCE_LIMIT = "RESOURCE_LIMIT"
    SESSION = "SESSION"


class ErrorDefinition:
    """Error definition structure"""
    def __init__(
        self,
        code: str,
        message: str,
        message_key: str,
        error_type: ErrorType,
        error_category: ErrorCategory,
        status_code: int
    ):
        self.code = code
        self.message = message
        self.message_key = message_key
        self.error_type = error_type
        self.error_category = error_category
        self.status_code = status_code

    def to_dict(self) -> Dict[str, Any]:
        """Convert error to dictionary"""
        return {
            "errorCode": self.code,
            "statusCode": self.status_code,
            "errorType": self.error_type.value,
            "errorCategory": self.error_category.value,
            "message": self.message,
            "messageKey": self.message_key
        }


class JobErrors:
    """Job-related error definitions"""

    # Job not found errors
    JOB1001 = ErrorDefinition(
        code="JOB1001",
        message="Job not found",
        message_key="error.job.JOB1001.not_found",
        error_type=ErrorType.VALIDATION,
        error_category=ErrorCategory.CLIENT,
        status_code=status.HTTP_404_NOT_FOUND
    )

    # Job access errors
    JOB1002 = ErrorDefinition(
        code="JOB1002",
        message="Unauthorized access to job",
        message_key="error.job.JOB1002.unauthorized",
        error_type=ErrorType.AUTHORIZATION,
        error_category=ErrorCategory.SECURITY,
        status_code=status.HTTP_403_FORBIDDEN
    )

    # Job state errors
    JOB1003 = ErrorDefinition(
        code="JOB1003",
        message="Cannot cancel job in current state",
        message_key="error.job.JOB1003.invalid_state_cancel",
        error_type=ErrorType.BUSINESS_LOGIC,
        error_category=ErrorCategory.CLIENT,
        status_code=status.HTTP_400_BAD_REQUEST
    )

    JOB1004 = ErrorDefinition(
        code="JOB1004",
        message="Cannot delete job while processing",
        message_key="error.job.JOB1004.invalid_state_delete",
        error_type=ErrorType.BUSINESS_LOGIC,
        error_category=ErrorCategory.CLIENT,
        status_code=status.HTTP_400_BAD_REQUEST
    )

    # File operation errors
    JOB1005 = ErrorDefinition(
        code="JOB1005",
        message="Failed to delete associated files",
        message_key="error.job.JOB1005.file_deletion_failed",
        error_type=ErrorType.SYSTEM,
        error_category=ErrorCategory.SERVER,
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR
    )

    JOB1006 = ErrorDefinition(
        code="JOB1006",
        message="File not found for job",
        message_key="error.job.JOB1006.file_not_found",
        error_type=ErrorType.DATA_INTEGRITY,
        error_category=ErrorCategory.SERVER,
        status_code=status.HTTP_404_NOT_FOUND
    )

    # Bulk operation errors
    JOB1007 = ErrorDefinition(
        code="JOB1007",
        message="No jobs provided for bulk operation",
        message_key="error.job.JOB1007.no_jobs_provided",
        error_type=ErrorType.VALIDATION,
        error_category=ErrorCategory.CLIENT,
        status_code=status.HTTP_400_BAD_REQUEST
    )

    JOB1008 = ErrorDefinition(
        code="JOB1008",
        message="Bulk operation limit exceeded",
        message_key="error.job.JOB1008.bulk_limit_exceeded",
        error_type=ErrorType.VALIDATION,
        error_category=ErrorCategory.CLIENT,
        status_code=status.HTTP_400_BAD_REQUEST
    )

    JOB1009 = ErrorDefinition(
        code="JOB1009",
        message="Some jobs failed during bulk operation",
        message_key="error.job.JOB1009.bulk_partial_failure",
        error_type=ErrorType.OPERATIONAL,
        error_category=ErrorCategory.SERVER,
        status_code=status.HTTP_207_MULTI_STATUS
    )

    # Database errors
    JOB1010 = ErrorDefinition(
        code="JOB1010",
        message="Database error while processing job operation",
        message_key="error.job.JOB1010.database_error",
        error_type=ErrorType.DATABASE,
        error_category=ErrorCategory.DATABASE,
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR
    )

    # Transcription errors
    JOB1011 = ErrorDefinition(
        code="JOB1011",
        message="Transcription not found for job",
        message_key="error.job.JOB1011.transcription_not_found",
        error_type=ErrorType.DATA_INTEGRITY,
        error_category=ErrorCategory.CLIENT,
        status_code=status.HTTP_404_NOT_FOUND
    )


class AppException(HTTPException):
    """Custom exception with error definition support"""

    def __init__(
        self,
        error_def: ErrorDefinition,
        detail: Optional[str] = None,
        data: Optional[Dict[str, Any]] = None
    ):
        self.error_def = error_def
        self.data = data or {}
        
        # Override detail message if provided
        message = detail if detail else error_def.message
        
        super().__init__(
            status_code=error_def.status_code,
            detail=message
        )

    def to_response(self) -> Dict[str, Any]:
        """Convert to API response format"""
        error_dict = self.error_def.to_dict()
        error_dict["message"] = self.detail
        if self.data:
            error_dict["data"] = self.data
        
        return {
            "statusCode": self.error_def.status_code,
            "errors": [error_dict]
        }


def create_error_response(
    error_def: ErrorDefinition,
    detail: Optional[str] = None,
    data: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """Create a standardized error response"""
    error_dict = error_def.to_dict()
    if detail:
        error_dict["message"] = detail
    if data:
        error_dict["data"] = data
    
    return {
        "statusCode": error_def.status_code,
        "errors": [error_dict]
    }
