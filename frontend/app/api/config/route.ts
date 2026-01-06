import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  // Use regular API_KEY for server-side (not inlined at build time)
  const apiKey = process.env.API_KEY || '';
  
  return NextResponse.json({ apiKey });
}
