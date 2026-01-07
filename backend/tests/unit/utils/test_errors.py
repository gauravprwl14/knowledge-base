"""
Unit tests for error handling
"""

import pytest
from fastapi import status

from app.utils.errors import (
    ErrorType,
    ErrorCategory,
    ErrorDefinition,
    JobErrors,
    AppException,
    create_error_response
)


class TestErrorDefinition:
    """Tests for ErrorDefinition class"""

    def test_error_definition_creation(self):
        """Test creating an error definition"""
        error_def = ErrorDefinition(
            code="TEST1001",
            message="Test error message",
            message_key="error.test.TEST1001.test_message",
            error_type=ErrorType.VALIDATION,
            error_category=ErrorCategory.CLIENT,
            status_code=status.HTTP_400_BAD_REQUEST
        )
        
        assert error_def.code == "TEST1001"
        assert error_def.message == "Test error message"
        assert error_def.error_type == ErrorType.VALIDATION
        assert error_def.error_category == ErrorCategory.CLIENT
        assert error_def.status_code == 400

    def test_error_definition_to_dict(self):
        """Test converting error definition to dictionary"""
        error_def = ErrorDefinition(
            code="TEST1001",
            message="Test error",
            message_key="error.test.TEST1001",
            error_type=ErrorType.VALIDATION,
            error_category=ErrorCategory.CLIENT,
            status_code=400
        )
        
        result = error_def.to_dict()
        
        assert result["errorCode"] == "TEST1001"
        assert result["message"] == "Test error"
        assert result["errorType"] == "VALIDATION"
        assert result["errorCategory"] == "CLIENT"
        assert result["statusCode"] == 400


class TestJobErrors:
    """Tests for JobErrors definitions"""

    def test_job_not_found_error(self):
        """Test JOB1001 error definition"""
        error = JobErrors.JOB1001
        
        assert error.code == "JOB1001"
        assert error.status_code == 404
        assert error.error_type == ErrorType.VALIDATION
        assert error.error_category == ErrorCategory.CLIENT

    def test_job_unauthorized_error(self):
        """Test JOB1002 error definition"""
        error = JobErrors.JOB1002
        
        assert error.code == "JOB1002"
        assert error.status_code == 403
        assert error.error_type == ErrorType.AUTHORIZATION
        assert error.error_category == ErrorCategory.SECURITY

    def test_bulk_limit_exceeded_error(self):
        """Test JOB1008 error definition"""
        error = JobErrors.JOB1008
        
        assert error.code == "JOB1008"
        assert error.status_code == 400
        assert "limit exceeded" in error.message.lower()

    def test_database_error(self):
        """Test JOB1010 error definition"""
        error = JobErrors.JOB1010
        
        assert error.code == "JOB1010"
        assert error.status_code == 500
        assert error.error_type == ErrorType.DATABASE
        assert error.error_category == ErrorCategory.DATABASE


class TestAppException:
    """Tests for AppException class"""

    def test_app_exception_creation(self):
        """Test creating an AppException"""
        exception = AppException(JobErrors.JOB1001)
        
        assert exception.status_code == 404
        assert exception.error_def == JobErrors.JOB1001
        assert exception.detail == JobErrors.JOB1001.message

    def test_app_exception_with_custom_detail(self):
        """Test AppException with custom detail message"""
        custom_message = "Custom error message"
        exception = AppException(JobErrors.JOB1001, detail=custom_message)
        
        assert exception.detail == custom_message
        assert exception.status_code == 404

    def test_app_exception_with_data(self):
        """Test AppException with additional data"""
        data = {"job_id": "123", "user_id": "456"}
        exception = AppException(JobErrors.JOB1001, data=data)
        
        assert exception.data == data

    def test_app_exception_to_response(self):
        """Test converting AppException to response format"""
        data = {"retry": True}
        exception = AppException(
            JobErrors.JOB1010,
            detail="Database connection failed",
            data=data
        )
        
        response = exception.to_response()
        
        assert response["statusCode"] == 500
        assert len(response["errors"]) == 1
        assert response["errors"][0]["errorCode"] == "JOB1010"
        assert response["errors"][0]["message"] == "Database connection failed"
        assert response["errors"][0]["data"] == data


class TestCreateErrorResponse:
    """Tests for create_error_response function"""

    def test_create_basic_error_response(self):
        """Test creating basic error response"""
        response = create_error_response(JobErrors.JOB1001)
        
        assert response["statusCode"] == 404
        assert len(response["errors"]) == 1
        assert response["errors"][0]["errorCode"] == "JOB1001"

    def test_create_error_response_with_detail(self):
        """Test creating error response with custom detail"""
        detail = "Specific job not found"
        response = create_error_response(JobErrors.JOB1001, detail=detail)
        
        assert response["errors"][0]["message"] == detail

    def test_create_error_response_with_data(self):
        """Test creating error response with additional data"""
        data = {"job_id": "123", "timestamp": "2024-01-01"}
        response = create_error_response(
            JobErrors.JOB1001,
            data=data
        )
        
        assert response["errors"][0]["data"] == data

    def test_all_error_codes_have_unique_codes(self):
        """Test that all error codes are unique"""
        error_codes = []
        for attr in dir(JobErrors):
            if not attr.startswith('_'):
                error = getattr(JobErrors, attr)
                if isinstance(error, ErrorDefinition):
                    error_codes.append(error.code)
        
        assert len(error_codes) == len(set(error_codes))

    def test_all_error_codes_follow_pattern(self):
        """Test that all error codes follow JOBxxxx pattern"""
        for attr in dir(JobErrors):
            if not attr.startswith('_'):
                error = getattr(JobErrors, attr)
                if isinstance(error, ErrorDefinition):
                    assert error.code.startswith("JOB")
                    assert len(error.code) == 7  # JOB + 4 digits
                    assert error.code[3:].isdigit()


class TestErrorTypes:
    """Tests for ErrorType enum"""

    def test_error_type_values(self):
        """Test that ErrorType has expected values"""
        assert ErrorType.VALIDATION.value == "VALIDATION"
        assert ErrorType.DATABASE.value == "DATABASE"
        assert ErrorType.AUTHENTICATION.value == "AUTHENTICATION"
        assert ErrorType.BUSINESS_LOGIC.value == "BUSINESS_LOGIC"


class TestErrorCategories:
    """Tests for ErrorCategory enum"""

    def test_error_category_values(self):
        """Test that ErrorCategory has expected values"""
        assert ErrorCategory.CLIENT.value == "CLIENT"
        assert ErrorCategory.SERVER.value == "SERVER"
        assert ErrorCategory.DATABASE.value == "DATABASE"
        assert ErrorCategory.SECURITY.value == "SECURITY"
