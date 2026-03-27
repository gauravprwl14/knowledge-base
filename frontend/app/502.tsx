'use client';

import { ServerCrash, RefreshCw, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

/**
 * 502 - Bad Gateway Error Page
 * 
 * Displayed when the API server is temporarily unavailable or returning invalid responses.
 */
export default function BadGatewayError() {
  const handleReload = () => {
    window.location.reload();
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4">
      <div className="max-w-md w-full text-center">
        <div className="mb-6">
          <h1 className="text-9xl font-bold text-gray-200 dark:text-gray-800">502</h1>
        </div>
        
        <div className="mb-6 flex justify-center">
          <div className="rounded-full bg-orange-100 dark:bg-orange-900/20 p-4">
            <ServerCrash className="h-12 w-12 text-orange-600 dark:text-orange-500" />
          </div>
        </div>
        
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
          Bad Gateway
        </h2>
        
        <p className="text-gray-600 dark:text-gray-400 mb-6">
          The server is temporarily unavailable. Please try again in a few moments.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button onClick={handleReload} variant="default">
            <RefreshCw className="mr-2 h-4 w-4" />
            Try Again
          </Button>
          
          <Link href="/">
            <Button variant="outline">
              <Home className="mr-2 h-4 w-4" />
              Go Home
            </Button>
          </Link>
        </div>

        <p className="mt-6 text-sm text-gray-500 dark:text-gray-400">
          If this problem persists, please contact support.
        </p>
      </div>
    </div>
  );
}
