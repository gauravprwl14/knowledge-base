import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || 'http://backend:8000';

/**
 * POST /api/v1/jobs/bulk/delete - Bulk delete jobs
 */
export async function POST(request: NextRequest) {
  try {
    const apiKey = request.headers.get('X-API-Key');
    if (!apiKey) {
      return NextResponse.json(
        { 
          statusCode: 401,
          errors: [{
            errorCode: 'AUTH1001',
            message: 'API key is required',
            errorType: 'AUTHENTICATION',
            errorCategory: 'SECURITY',
            statusCode: 401
          }]
        },
        { status: 401 }
      );
    }

    const body = await request.json();

    const response = await fetch(`${BACKEND_URL}/api/v1/jobs/bulk/delete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    return NextResponse.json(data, {
      status: response.status,
    });
  } catch (error: any) {
    console.error('Bulk delete proxy error:', error);
    return NextResponse.json(
      {
        statusCode: 500,
        errors: [{
          errorCode: 'GEN1001',
          message: 'Internal server error',
          errorType: 'SYSTEM',
          errorCategory: 'SERVER',
          statusCode: 500
        }]
      },
      { status: 500 }
    );
  }
}
