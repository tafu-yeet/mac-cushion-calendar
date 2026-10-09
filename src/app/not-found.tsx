import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-3 bg-canvas px-4 py-16 text-center font-body text-maroon">
      <h1 className="font-display text-4xl font-semibold">nothing here.</h1>
      <p className="max-w-sm text-maroon/75">This event may have been removed, or the link is wrong.</p>
      <Link href="/" className="mt-2 rounded-full bg-maroon px-5 py-2 text-sm font-semibold text-cream hover:bg-plum">
        See what&apos;s on
      </Link>
    </main>
  );
}
