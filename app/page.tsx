import { Workbench } from "@/components/Workbench";

export default function Home() {
  return (
    <main className="mx-auto max-w-4xl space-y-8 p-6 sm:p-10">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">chat-to-sql</h1>
        <p className="text-muted-foreground">
          Ask questions about a Brazilian e-commerce dataset. For now, run SQL directly; plain-English
          questions arrive soon.
        </p>
      </header>
      <Workbench />
    </main>
  );
}
