import { Workbench } from "@/components/Workbench";

export default function Home() {
  return (
    <main className="mx-auto max-w-4xl space-y-8 p-6 sm:p-10">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">chat-to-sql</h1>
        <p className="text-muted-foreground">
          Ask questions about a Brazilian e-commerce dataset in plain English. I suggest a read-only SQL query,
          you review it, and you decide whether to run it.
        </p>
      </header>
      <Workbench />
    </main>
  );
}
