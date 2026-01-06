// Testing hot reload - this route is actively accessed
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  // Get API key from environment (server-side)
  const apiKey = process.env.API_KEY || process.env.NEXT_PUBLIC_API_KEY || '';

  if (!apiKey) {
    return NextResponse.json(
      { error: 'API key not configured' },
      { status: 500 }
    );
  }

  try {
    const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://backend:8000';
    
    // Get pagination parameters from query string
    const { searchParams } = new URL(request.url);
    const page = searchParams.get('page') || '1';
    const pageSize = searchParams.get('page_size') || '20';
    
    const response = await fetch(
      `${backendUrl}/api/v1/jobs?page=${page}&page_size=${pageSize}`,
      {
        headers: {
          'X-API-Key': apiKey,
        },
      }
    );

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('API route error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch jobs' },
      { status: 500 }
    );
  }
}
