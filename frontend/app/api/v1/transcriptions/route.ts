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
    const response = await fetch(`${backendUrl}/api/v1/transcriptions`, {
      headers: {
        'X-API-Key': apiKey,
      },
    });

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('API route error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch transcriptions' },
      { status: 500 }
    );
  }
}
