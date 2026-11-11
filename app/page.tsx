import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-3xl font-semibold tracking-tight">chat-to-sql</h1>
      <p className="text-muted-foreground">
        Ask a question in plain English and get a suggested SQL query.
      </p>
      <Button disabled>Coming soon</Button>
    </main>
  );
}
