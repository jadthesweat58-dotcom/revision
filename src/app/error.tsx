"use client";

// Shown instead of a blank or frozen screen when a page can't load.

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="card login">
      <h1>Something went wrong</h1>
      <p className="dim">
        The page couldn&apos;t load. Usually this means the database is waking up or can&apos;t be reached.
      </p>
      <div className="row">
        <button className="btn" onClick={() => reset()}>
          Try again
        </button>
        <a className="btn ghost" href="/api/status">
          Check status
        </a>
      </div>
    </div>
  );
}
