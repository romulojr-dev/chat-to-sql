import { Workbench } from "@/components/Workbench";

export default function Home() {
  return (
    <main className="mx-auto max-w-4xl space-y-8 p-4 sm:p-10">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">SiyasatQL</h1>
        <p className="text-muted-foreground">
          Ask questions about a Brazilian e-commerce dataset in plain English. I suggest a read-only SQL query,
          you review it, and you decide whether to run it.
        </p>
      </header>
      <Workbench />
      <footer className="text-muted-foreground border-t pt-4 text-xs">
        <p>Suggested queries are AI-generated: review them before running.</p>
        <p>
          Data:{" "}
          <a
            className="underline underline-offset-2"
            href="https://www.kaggle.com/datasets/olistbr/brazilian-ecommerce"
            target="_blank"
            rel="noreferrer"
          >
            Brazilian E-Commerce Public Dataset by Olist
          </a>{" "}
          (Kaggle), licensed{" "}
          <a
            className="underline underline-offset-2"
            href="https://creativecommons.org/licenses/by-nc-sa/4.0/"
            target="_blank"
            rel="noreferrer"
          >
            CC BY-NC-SA 4.0
          </a>
          . Not affiliated with Olist.
        </p>
      </footer>
    </main>
  );
}
