import { DATASET_FACTS, DATASET_TABLES } from "@/lib/schema/facts";

const STATS = [
  { value: DATASET_FACTS.orders, label: "orders" },
  { value: DATASET_FACTS.customers, label: "unique customers" },
  { value: DATASET_FACTS.sellers, label: "sellers" },
  { value: DATASET_FACTS.products, label: "products" },
];

/** Shown under the prompt box on the landing view; its top edge peeks in at the fold. */
export function AboutSection() {
  return (
    <section aria-labelledby="about-heading" className="px-4 pt-9 pb-16">
      <div className="mx-auto w-full max-w-3xl space-y-4">
        <h2 id="about-heading" className="text-xl font-semibold tracking-tight">
          About SiyasatQL
        </h2>
        <p className="max-w-2xl leading-relaxed">
          Ask questions about a real e-commerce database in plain English. SiyasatQL writes a read-only
          SQL query, shows you its steps, and waits for you to review it and click Run. Then you get a table and, when
          one fits, a chart.
        </p>
        <p className="max-w-2xl leading-relaxed">
          The data comes from <strong>Olist</strong>, a Brazilian online marketplace where small sellers list products.
          Each order records what was bought, from which seller, how it was paid and shipped, and what the customer
          thought of it.
        </p>

        <dl className="grid grid-cols-2 gap-3 py-2 sm:grid-cols-4">
          {STATS.map((s) => (
            <div key={s.label} className="bg-card flex flex-col rounded-xl border p-3">
              <dt className="text-muted-foreground order-2 text-xs">{s.label}</dt>
              <dd className="text-2xl font-semibold tracking-tight">{s.value}</dd>
            </div>
          ))}
        </dl>

        <ul aria-label="Tables in the database" className="flex flex-wrap gap-1.5">
          {DATASET_TABLES.map((t) => (
            <li key={t} className="bg-card rounded-md border px-2 py-0.5 font-mono text-xs">
              {t}
            </li>
          ))}
        </ul>

        <p className="text-muted-foreground max-w-2xl text-xs leading-relaxed">
          Covers September 2016 to October 2018 (fullest from January 2017 to August 2018). Money is in Brazilian reais
          (BRL). Each question stands alone: SiyasatQL doesn&apos;t remember earlier ones.
        </p>

        <h3 className="pt-4 text-base font-semibold tracking-tight">How accurate is it?</h3>
        <p className="max-w-2xl leading-relaxed">
          It was tested on 60 questions with known answers, from simple counts to multi-step ones. Over three runs, the
          setup used here (Claude Haiku 5.5) returned the correct result <strong>96.7%</strong> of the time on average
          (95.0% to 98.3%). It got every easy question right; medium questions were its weakest tier at 93.1%.
        </p>
        <p className="max-w-2xl leading-relaxed">
          It was also tried with 14 unsafe prompts, such as requests to change data or hide commands inside a question.
          None produced SQL that would change anything, and the database refuses writes on its own anyway.
        </p>
        <p className="text-muted-foreground max-w-2xl text-sm leading-relaxed">
          These numbers describe this 60-question set on this dataset, not text-to-SQL in general, and the model varies
          from run to run, so an occasional wrong answer is expected. Always read the SQL before you run it.{" "}
          <a
            className="text-foreground underline underline-offset-2"
            href="https://github.com/romulojr-dev/chat-to-sql/blob/main/docs/eval-results.md"
            target="_blank"
            rel="noreferrer"
          >
            Full evaluation details
          </a>
          .
        </p>

        <p className="max-w-2xl leading-relaxed">
          SiyasatQL was built by <strong>Romulo Ramos Jr.</strong> To get in touch, email{" "}
          <a className="underline underline-offset-2" href="mailto:romu.dev@outlook.com">
            romu.dev@outlook.com
          </a>{" "}
          or send a message on{" "}
          <a
            className="underline underline-offset-2"
            href="https://www.linkedin.com/in/romulo-dev/"
            target="_blank"
            rel="noreferrer"
          >
            LinkedIn
          </a>
          .
        </p>
      </div>
    </section>
  );
}
