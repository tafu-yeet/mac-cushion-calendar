/**
 * Event-card-shaped placeholders while a list loads (switching days on a slow connection, say).
 * They wait a moment before showing (motion.css), so a quick load never flashes them.
 */
export function CardsSkeleton({ count = 3, className = "" }: { count?: number; className?: string }) {
  return (
    <div className={`flex flex-col gap-3 ${className}`} role="status" aria-label="Loading">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="skeleton flex h-44 flex-col gap-3 rounded-[28px] p-5">
          <div className="h-3 w-24 rounded-full bg-maroon/10" />
          <div className="h-6 w-3/4 rounded-full bg-maroon/10" />
          <div className="h-3 w-1/2 rounded-full bg-maroon/10" />
          <div className="mt-auto h-7 w-20 rounded-full bg-maroon/10" />
        </div>
      ))}
    </div>
  );
}
