import { campus } from "@/lib/campus";

// Placeholder until the public site is built in Phase 4.
export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-3 px-4 text-center">
      <h1 className="text-3xl font-semibold tracking-tight">{campus.siteName}</h1>
      <p className="text-stone-600">Free food at {campus.schoolShortName} campus events. Coming soon.</p>
    </main>
  );
}
