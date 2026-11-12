import { MailIcon } from "lucide-react";
import { GithubIcon, LinkedinIcon } from "@/components/BrandIcons";
import { ThemeToggle } from "@/components/ThemeToggle";
import { buttonVariants } from "@/components/ui/button";

const ghostIcon = buttonVariants({ variant: "ghost", size: "icon" });

export function SiteHeader() {
  return (
    <header className="border-b border-border/60 px-4 py-2 sm:px-6">
      <div className="mx-auto flex max-w-5xl items-center">
        <h1 className="text-lg font-semibold tracking-tight">SiyasatQL</h1>
        <div className="ml-auto flex items-center gap-0.5">
          <ThemeToggle />
          <span role="separator" aria-orientation="vertical" className="bg-border mx-2 h-5 w-px" />
          <a className={ghostIcon} href="mailto:romu.dev@outlook.com" aria-label="Email">
            <MailIcon />
          </a>
          <a
            className={ghostIcon}
            href="https://github.com/romulojr-dev/chat-to-sql"
            target="_blank"
            rel="noreferrer"
            aria-label="GitHub"
          >
            <GithubIcon />
          </a>
          <a
            className={ghostIcon}
            href="https://www.linkedin.com/in/romulo-dev/"
            target="_blank"
            rel="noreferrer"
            aria-label="LinkedIn"
          >
            <LinkedinIcon />
          </a>
        </div>
      </div>
    </header>
  );
}
