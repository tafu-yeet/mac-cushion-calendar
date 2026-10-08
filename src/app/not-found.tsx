import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-3 px-4 py-16 text-center">
      <h1 className="text-2xl font-bold tracking-tight text-stone-900">Nothing here</h1>
      <p className="max-w-sm text-stone-600">
        This event may have been removed, or the link is wrong.
      </p>
      <Link href="/" className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700">
        See what&apos;s on
      </Link>
    </main>
  );
}
