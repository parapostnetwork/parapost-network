import Link from "next/link";

export type LegalDocumentSection = {
  title: string;
  paragraphs?: string[];
  bullets?: string[];
};

type LegalDocumentPageProps = {
  eyebrow: string;
  title: string;
  summary: string;
  effectiveDate: string;
  sections: LegalDocumentSection[];
};

function getSectionId(title: string) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export default function LegalDocumentPage({
  eyebrow,
  title,
  summary,
  effectiveDate,
  sections,
}: LegalDocumentPageProps) {
  return (
    <main className="legal-document-page h-dvh min-h-dvh overflow-y-auto overflow-x-hidden overscroll-y-contain bg-[#05050b] px-4 py-6 pb-[calc(8rem+env(safe-area-inset-bottom))] text-white sm:px-6 lg:px-8">
      <style>{`
        .legal-document-page {
          -webkit-overflow-scrolling: touch;
          overscroll-behavior-y: contain;
          scroll-padding-bottom: calc(9rem + env(safe-area-inset-bottom));
        }

        .legal-document-page a,
        .legal-document-page button {
          touch-action: manipulation;
        }

        @media (max-width: 430px) {
          .legal-document-page {
            padding-left: 12px !important;
            padding-right: 12px !important;
            padding-top: max(14px, env(safe-area-inset-top)) !important;
            padding-bottom: calc(
              8.5rem + env(safe-area-inset-bottom)
            ) !important;
          }

          .legal-document-shell {
            max-width: 100% !important;
          }

          .legal-document-topbar {
            align-items: flex-start !important;
            flex-direction: column !important;
          }

          .legal-document-hero,
          .legal-document-content-card,
          .legal-document-nav-card,
          .legal-document-support-card {
            border-radius: 22px !important;
            padding: 16px !important;
          }

          .legal-document-title {
            font-size: clamp(36px, 12vw, 46px) !important;
            line-height: 0.98 !important;
            letter-spacing: -0.05em !important;
          }
        }

        @media (max-width: 767px) {
          .legal-document-layout {
            grid-template-columns: 1fr !important;
          }

          .legal-document-navigation {
            position: static !important;
          }
        }

        @media (min-width: 768px) and (max-width: 1100px) {
          .legal-document-layout {
            grid-template-columns: minmax(0, 1fr) 260px !important;
          }
        }
      `}</style>

      <div
        className="pointer-events-none fixed -right-28 -top-28 h-96 w-96 rounded-full blur-3xl"
        style={{ background: "var(--parapost-accent-soft)" }}
      />

      <div
        className="pointer-events-none fixed left-1/2 top-24 h-80 w-80 -translate-x-1/2 rounded-full blur-3xl"
        style={{ background: "var(--parapost-accent-muted-bg)" }}
      />

      <div
        className="pointer-events-none fixed -bottom-28 -left-28 h-96 w-96 rounded-full blur-3xl"
        style={{ background: "var(--parapost-accent-soft)" }}
      />

      <div className="legal-document-shell relative z-10 mx-auto w-full max-w-6xl">
        <div className="legal-document-topbar mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/settings/legal"
              className="text-sm font-bold no-underline transition hover:text-white"
              style={{ color: "var(--parapost-accent-text)" }}
            >
              ← Back to Legal & Policies
            </Link>

            <Link
              href="/settings"
              className="text-sm font-bold text-slate-300 no-underline transition hover:text-white"
            >
              Settings
            </Link>
          </div>

          <span
            className="rounded-full border px-3 py-2 text-xs font-black uppercase tracking-[0.18em] shadow-lg"
            style={{
              borderColor: "var(--parapost-accent-border)",
              background: "var(--parapost-accent-muted-bg)",
              color: "var(--parapost-accent-readable-text)",
              boxShadow: "0 12px 28px var(--parapost-accent-glow)",
            }}
          >
            {eyebrow}
          </span>
        </div>

        <section
          className="legal-document-hero rounded-[30px] border p-5 shadow-2xl ring-1 ring-white/[0.035] sm:p-7"
          style={{
            borderColor: "var(--parapost-accent-border)",
            background:
              "linear-gradient(135deg, var(--parapost-accent-soft), rgba(255,255,255,0.06), rgba(15,23,42,0.70))",
            boxShadow:
              "0 24px 70px rgba(0,0,0,0.38), 0 0 38px var(--parapost-accent-glow)",
          }}
        >
          <p
            className="mb-3 text-xs font-black uppercase tracking-[0.18em]"
            style={{ color: "var(--parapost-accent-text)" }}
          >
            Parapost Network
          </p>

          <h1 className="legal-document-title max-w-4xl text-4xl font-black leading-[0.98] tracking-[-0.055em] sm:text-5xl lg:text-6xl">
            {title}
          </h1>

          <p className="mt-5 max-w-4xl text-sm leading-7 text-slate-300 sm:text-base">
            {summary}
          </p>

          <div className="mt-5 flex flex-wrap gap-2">
            <span className="rounded-full border border-purple-200/15 bg-black/30 px-4 py-2 text-xs font-bold text-slate-300">
              Effective date: {effectiveDate}
            </span>

            <span className="rounded-full border border-purple-200/15 bg-black/30 px-4 py-2 text-xs font-bold text-slate-300">
              {sections.length} sections
            </span>
          </div>
        </section>

        <div className="legal-document-layout mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
          <section
            className="legal-document-content-card rounded-[28px] border p-5 shadow-2xl ring-1 ring-white/[0.035] sm:p-7"
            style={{
              borderColor: "var(--parapost-accent-border)",
              background:
                "linear-gradient(135deg, var(--parapost-accent-muted-bg), rgba(255,255,255,0.055), rgba(15,23,42,0.55))",
            }}
          >
            <div className="space-y-8">
              {sections.map((section, sectionIndex) => {
                const sectionId = getSectionId(section.title);

                return (
                  <article
                    key={section.title}
                    id={sectionId}
                    className={
                      sectionIndex === 0
                        ? "scroll-mt-6"
                        : "scroll-mt-6 border-t border-purple-200/15 pt-8"
                    }
                  >
                    <h2 className="text-xl font-black tracking-[-0.025em] sm:text-2xl">
                      {section.title}
                    </h2>

                    {section.paragraphs?.map(
                      (paragraph, paragraphIndex) => (
                        <p
                          key={`${section.title}-paragraph-${paragraphIndex}`}
                          className="mt-4 text-sm leading-7 text-slate-300 sm:text-[15px]"
                        >
                          {paragraph}
                        </p>
                      )
                    )}

                    {section.bullets?.length ? (
                      <ul className="mt-4 space-y-3 pl-5 text-sm leading-7 text-slate-300 sm:text-[15px]">
                        {section.bullets.map((bullet, bulletIndex) => (
                          <li
                            key={`${section.title}-bullet-${bulletIndex}`}
                            className="list-disc pl-1"
                          >
                            {bullet}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </article>
                );
              })}
            </div>
          </section>

          <aside className="space-y-4">
            <section
              className="legal-document-navigation legal-document-nav-card sticky top-5 rounded-[26px] border p-5 shadow-xl"
              style={{
                borderColor: "var(--parapost-accent-border)",
                background:
                  "linear-gradient(135deg, var(--parapost-accent-muted-bg), rgba(255,255,255,0.045), rgba(15,23,42,0.52))",
              }}
            >
              <p
                className="text-xs font-black uppercase tracking-[0.16em]"
                style={{ color: "var(--parapost-accent-text)" }}
              >
                On this page
              </p>

              <div className="mt-4 space-y-2">
                {sections.map((section) => (
                  <a
                    key={section.title}
                    href={`#${getSectionId(section.title)}`}
                    className="block rounded-xl border border-purple-200/10 bg-black/25 px-3 py-2.5 text-sm font-bold leading-5 text-slate-300 no-underline transition hover:bg-white/[0.06] hover:text-white"
                  >
                    {section.title}
                  </a>
                ))}
              </div>
            </section>
          </aside>
        </div>

        <section
          className="legal-document-support-card mt-5 rounded-[26px] border p-5 shadow-xl"
          style={{
            borderColor: "var(--parapost-accent-border)",
            background:
              "linear-gradient(135deg, var(--parapost-accent-muted-bg), rgba(255,255,255,0.045), rgba(15,23,42,0.52))",
          }}
        >
          <p
            className="text-xs font-black uppercase tracking-[0.16em]"
            style={{ color: "var(--parapost-accent-text)" }}
          >
            Need assistance?
          </p>

          <h2 className="mt-2 text-lg font-black tracking-[-0.02em]">
            Questions or concerns
          </h2>

          <p className="mt-2 text-sm leading-6 text-slate-400">
            Contact Parapost Network through the in-app Help & Support area for
            questions about this policy.
          </p>

          <Link
            href="/settings/help-support"
            className="mt-4 inline-flex rounded-full border px-5 py-3 text-sm font-black text-white no-underline transition hover:bg-white/10"
            style={{
              borderColor: "var(--parapost-accent-border)",
              background: "rgba(255,255,255,0.055)",
            }}
          >
            Open Help & Support
          </Link>
        </section>
      </div>
    </main>
  );
}