/** Sign-in pages: no app chrome, one card in the middle of a light page. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="dashboard-surface flex min-h-screen items-center justify-center bg-background px-4 py-12 font-sans">
      <div className="w-full max-w-sm">{children}</div>
    </main>
  );
}
