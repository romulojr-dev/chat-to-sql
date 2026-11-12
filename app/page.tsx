import { AboutSection } from "@/components/AboutSection";
import { SiteHeader } from "@/components/SiteHeader";
import { Workbench } from "@/components/Workbench";

export default function Home() {
  return (
    <>
      <SiteHeader />
      <Workbench about={<AboutSection />} />
      <footer className="text-muted-foreground mx-auto w-full max-w-3xl border-t px-4 py-4 text-xs">
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
    </>
  );
}
