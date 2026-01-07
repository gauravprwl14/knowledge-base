import { NextRequest, NextResponse } from 'next/server';

// Helper to get API key from config or headers
async function getApiKey(request: NextRequest): Promise<string> {
  // First try to get from headers (client-provided)
  let apiKey = request.headers.get('X-API-Key');
  
  // If not in headers, get from server-side config
  if (!apiKey) {
    apiKey = process.env.API_KEY || '';
  }
  
  return apiKey;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const apiKey = await getApiKey(request);

  if (!apiKey) {
    return NextResponse.json(
      { error: 'API key is required' },
      { status: 401 }
    );
  }

  try {
    const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://backend:8000';

    const response = await fetch(`${backendUrl}/api/v1/jobs/${id}`, {
      headers: {
        'X-API-Key': apiKey,
      },
    });

    const data = await response.json();
    if (!response.ok) {
      return NextResponse.json(data, { status: response.status });
    }
    
    return NextResponse.json(data);
  } catch (error) {
    console.error('API route error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch job' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const apiKey = await getApiKey(request);

  if (!apiKey) {
    return NextResponse.json(
      { error: 'API key required' },
      { status: 401 }
    );
  }

  try {
    const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://backend:8000';

    const response = await fetch(`${backendUrl}/api/v1/jobs/${id}`, {
      method: 'DELETE',
      headers: {
        'X-API-Key': apiKey,
      },
    });

    const data = await response.json();
    if (!response.ok) {
      return NextResponse.json(data, { status: response.status });
    }
    
    return NextResponse.json(data);
  } catch (error) {
    console.error('Delete job API route error:', error);
    return NextResponse.json(
      { error: 'Failed to delete job' },
      { status: 500 }
    );
  }
}
