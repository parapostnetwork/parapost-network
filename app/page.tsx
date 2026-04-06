export default function Home() {
  return (
    <main className="min-h-screen bg-black text-white">
      <header className="border-b border-zinc-800 bg-zinc-950">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <h1 className="text-2xl font-bold text-purple-400">
            Parapost Network
          </h1>
          <nav className="flex gap-6 text-sm text-zinc-300">
            <span>Home</span>
            <span>Groups</span>
            <span>Events</span>
            <span>Live</span>
            <span>Profile</span>
          </nav>
        </div>
      </header>

      <section className="mx-auto max-w-5xl px-6 py-10">
        <h2 className="text-3xl font-bold">Welcome to Parapost</h2>
        <p className="mt-3 text-zinc-400">
          The social network for everything paranormal.
        </p>

        <div className="mt-6 flex gap-4">
          <button className="rounded-lg bg-purple-500 px-4 py-2">
            Join Now
          </button>
          <button className="rounded-lg border px-4 py-2">
            Watch Live
          </button>
        </div>
      </section>
    </main>
  );
}
