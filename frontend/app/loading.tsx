export default function Loading() {
  return (
    <div className="grid gap-4" aria-busy="true" aria-label="Loading">
      <div className="h-8 w-64 animate-pulse rounded-md bg-surface" />
      <div className="h-4 w-96 max-w-full animate-pulse rounded-md bg-surface" />
      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-lg bg-well" />
        ))}
      </div>
    </div>
  );
}
