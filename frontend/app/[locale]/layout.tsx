import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { locales } from '@/lib/i18n/config';
import { ErrorBoundary } from '@/components/error-boundary';
import { QueryProvider } from '@/lib/providers/query-provider';
import { ThemeSyncer } from '@/lib/stores';
import { AuthProvider } from '@/components/features/auth/AuthProvider';
import '../globals.css';

const inter = Inter({ 
  subsets: ['latin'],
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: 'KMS — Knowledge Base',
  description: 'Manage your knowledge base: sources, files, search, chat, and more.',
};

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  // Ensure that the incoming `locale` is valid
  if (!locales.includes(locale as any)) {
    notFound();
  }

  // Providing all messages to the client
  // side is the easiest way to get started
  const messages = await getMessages();

  return (
    <html lang={locale} className="dark" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans antialiased`} suppressHydrationWarning>
        <ErrorBoundary>
          <QueryProvider>
            <ThemeSyncer />
            <NextIntlClientProvider messages={messages}>
              <AuthProvider>
                {children}
              </AuthProvider>
            </NextIntlClientProvider>
          </QueryProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}
