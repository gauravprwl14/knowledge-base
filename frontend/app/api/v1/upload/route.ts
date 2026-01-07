import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  // Get API key from environment (server-side)
  const apiKey = process.env.API_KEY || process.env.NEXT_PUBLIC_API_KEY || '';

  console.log('API Key used in upload route:', apiKey);

  if (!apiKey) {
    return NextResponse.json(
      { error: 'API key not configured' },
      { status: 500 }
    );
  }

  try {
    const formData = await request.formData();
    const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://backend:8000';
    
    const response = await fetch(`${backendUrl}/api/v1/upload`, {
      method: 'POST',
      headers: {
        'X-API-Key': apiKey,
      },
      body: formData,
    });

    if (!response.ok) {
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        const errorData = await response.json();
        return NextResponse.json(errorData, { status: response.status });
      } else {
        const errorText = await response.text();
        return NextResponse.json(
          { detail: `Server error: ${response.status}` },
          { status: response.status }
        );
      }
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('API route error:', error);
    return NextResponse.json(
      { error: 'Failed to upload file' },
      { status: 500 }
    );
  }
}
