import Link from 'next/link';

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-full flex-col">
      <header className="px-4 py-6">
        <Link
          href="/"
          className="text-sm font-semibold uppercase tracking-wide text-brand-700"
        >
          Asissto
        </Link>
      </header>
      <main className="flex flex-1 items-start justify-center px-4 pb-16 sm:items-center sm:pb-24">
        <div className="w-full max-w-md">{children}</div>
      </main>
    </div>
  );
}
