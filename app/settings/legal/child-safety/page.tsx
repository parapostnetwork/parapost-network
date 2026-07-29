import BackToPrevious from "@/components/BackToPrevious";

export const metadata = {
  title: "Child Safety Standards | Parapost Network",
  description:
    "Parapost Network standards for preventing child sexual abuse and exploitation, reporting child safety concerns, and enforcing child safety requirements.",
};

const supportEmail = "parapostn@gmail.com";

export default function ChildSafetyPage() {
  return (
    <main className="child-safety-page">
      <div className="page-container">
        <div className="back-navigation">
          <BackToPrevious
            label="← Back to Legal & Policies"
            fallbackHref="/settings/legal"
          />
        </div>

        <article className="legal-card">
          <header className="page-header">
            <p className="eyebrow">PARAPOST NETWORK</p>
            <h1>Child Safety Standards</h1>
            <p className="updated">Last updated: July 29, 2026</p>
          </header>

          <section className="intro-panel" aria-labelledby="commitment-heading">
            <h2 id="commitment-heading" className="sr-only">
              Our commitment
            </h2>
            <p>
              Parapost Network is committed to protecting children and
              preventing child sexual abuse and exploitation. We maintain a
              zero-tolerance policy for content or conduct that exploits,
              endangers, grooms, or sexualizes anyone under 18.
            </p>
          </section>

          <section className="policy-section">
            <h2>Prohibited content and conduct</h2>

            <p>
              Parapost Network prohibits child sexual abuse material, grooming,
              sexual exploitation, solicitation of minors, trafficking,
              sextortion, attempts to sexualize minors, and links or
              instructions that promote or facilitate this material or conduct.
            </p>

            <p>
              Accounts that create, upload, request, distribute, promote, or
              attempt to obtain prohibited material may be suspended, removed,
              or permanently banned.
            </p>
          </section>

          <section className="policy-section">
            <h2>How to report a child safety concern</h2>

            <p>
              Users can report safety concerns using the in-app{" "}
              <strong>Report</strong> option available on supported posts,
              profiles, comments, messages, and other content.
            </p>

            <p>
              Concerns may also be reported directly to our designated child
              safety contact at{" "}
              <a href={`mailto:${supportEmail}`}>{supportEmail}</a>.
            </p>

            <div className="emergency-notice" role="note">
              If a child is in immediate danger, contact local emergency
              services or the appropriate law-enforcement authority
              immediately.
            </div>
          </section>

          <section className="policy-section">
            <h2>Our response and enforcement</h2>

            <p>
              Reports are reviewed as quickly as reasonably possible. Parapost
              Network may remove content, restrict features, suspend or
              terminate accounts, preserve relevant records, and take other
              appropriate steps to protect users.
            </p>

            <p>
              Parapost Network reports apparent child sexual abuse material and
              related unlawful activity to the appropriate authorities when
              required by law, including the National Center for Missing &amp;
              Exploited Children where applicable.
            </p>
          </section>

          <section className="policy-section">
            <h2>Cooperation with authorities</h2>

            <p>
              Parapost Network complies with applicable child-safety laws and
              responds to valid legal requests from law-enforcement agencies and
              other authorized organizations.
            </p>
          </section>

          <section className="policy-section">
            <h2>Child safety contact</h2>

            <p>
              Our designated contact handles questions about child safety
              compliance, prevention practices, reports, and enforcement
              procedures.
            </p>

            <div className="contact-card">
              <div>
                <span className="contact-label">Designated contact</span>
                <strong>Parapost Network Child Safety Contact</strong>
              </div>

              <a className="email-button" href={`mailto:${supportEmail}`}>
                {supportEmail}
              </a>
            </div>
          </section>

          <section className="policy-section related-section">
            <h2>Related policies</h2>

            <div className="policy-links">
              <a href="/settings/legal/privacy">Privacy Policy</a>
              <a href="/settings/legal/terms">Terms of Service</a>
              <a href="/settings/legal/community-guidelines">
                Community Guidelines
              </a>
              <a href="/settings/legal/safety-reporting">
                Safety &amp; Reporting Policy
              </a>
            </div>
          </section>
        </article>
      </div>

      <style>{`
        :root {
          color-scheme: dark;
        }

        * {
          box-sizing: border-box;
        }

        .child-safety-page {
          min-height: 100vh;
          padding: 48px 20px 72px;
          background:
            radial-gradient(
              circle at 8% 0%,
              rgba(168, 85, 247, 0.2),
              transparent 34%
            ),
            radial-gradient(
              circle at 95% 90%,
              rgba(99, 102, 241, 0.14),
              transparent 30%
            ),
            #05060b;
          color: #ffffff;
          font-family:
            Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont,
            "Segoe UI", sans-serif;
        }

        .page-container {
          width: min(920px, 100%);
          margin: 0 auto;
        }

        .back-navigation {
          margin-bottom: 18px;
        }

        .legal-card {
          overflow: hidden;
          padding: 42px;
          border: 1px solid rgba(255, 255, 255, 0.11);
          border-radius: 28px;
          background:
            linear-gradient(
              180deg,
              rgba(24, 21, 37, 0.98),
              rgba(8, 10, 17, 0.98)
            );
          box-shadow: 0 28px 90px rgba(0, 0, 0, 0.42);
        }

        .page-header {
          margin-bottom: 30px;
        }

        .eyebrow {
          margin: 0 0 12px;
          color: #c084fc;
          font-size: 13px;
          font-weight: 900;
          letter-spacing: 0.18em;
        }

        h1 {
          margin: 0;
          font-size: clamp(38px, 7vw, 64px);
          line-height: 1;
          letter-spacing: -0.055em;
        }

        .updated {
          margin: 15px 0 0;
          color: #aeb3c2;
          font-size: 14px;
        }

        .intro-panel {
          margin-bottom: 32px;
          padding: 22px;
          border: 1px solid rgba(168, 85, 247, 0.32);
          border-radius: 20px;
          background:
            linear-gradient(
              135deg,
              rgba(168, 85, 247, 0.13),
              rgba(99, 102, 241, 0.06)
            );
        }

        .intro-panel p {
          margin: 0;
          color: #f3e8ff;
          font-size: 17px;
          line-height: 1.75;
        }

        .policy-section {
          padding: 4px 0;
        }

        .policy-section + .policy-section {
          margin-top: 14px;
          padding-top: 26px;
          border-top: 1px solid rgba(255, 255, 255, 0.075);
        }

        h2 {
          margin: 0 0 13px;
          color: #ffffff;
          font-size: 23px;
          line-height: 1.25;
          letter-spacing: -0.025em;
        }

        p {
          margin: 0 0 16px;
          color: #c8cbd6;
          font-size: 16px;
          line-height: 1.75;
        }

        strong {
          color: #ffffff;
        }

        a {
          color: #c084fc;
          font-weight: 800;
          text-decoration: none;
          text-underline-offset: 3px;
        }

        a:hover {
          text-decoration: underline;
        }

        a:focus-visible {
          outline: 3px solid rgba(192, 132, 252, 0.5);
          outline-offset: 4px;
          border-radius: 8px;
        }

        .emergency-notice {
          margin-top: 18px;
          padding: 17px 18px;
          border-left: 4px solid #c084fc;
          border-radius: 12px;
          background: rgba(255, 255, 255, 0.045);
          color: #e5e7eb;
          font-size: 15px;
          line-height: 1.65;
        }

        .contact-card {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 22px;
          margin-top: 18px;
          padding: 20px;
          border: 1px solid rgba(255, 255, 255, 0.11);
          border-radius: 18px;
          background: rgba(255, 255, 255, 0.045);
        }

        .contact-card > div {
          display: grid;
          gap: 6px;
        }

        .contact-label {
          color: #9ca3af;
          font-size: 12px;
          font-weight: 800;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .email-button {
          display: inline-flex;
          min-height: 44px;
          align-items: center;
          justify-content: center;
          padding: 0 16px;
          border: 1px solid rgba(168, 85, 247, 0.4);
          border-radius: 999px;
          background: rgba(168, 85, 247, 0.12);
          white-space: nowrap;
        }

        .policy-links {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
        }

        .policy-links a {
          display: inline-flex;
          min-height: 44px;
          align-items: center;
          padding: 0 16px;
          border: 1px solid rgba(168, 85, 247, 0.34);
          border-radius: 999px;
          background: rgba(168, 85, 247, 0.1);
        }

        .sr-only {
          position: absolute;
          width: 1px;
          height: 1px;
          padding: 0;
          margin: -1px;
          overflow: hidden;
          clip: rect(0, 0, 0, 0);
          white-space: nowrap;
          border: 0;
        }

        @media (max-width: 760px) {
          .child-safety-page {
            padding: 28px 16px 52px;
          }

          .legal-card {
            padding: 32px 26px;
            border-radius: 24px;
          }

          .contact-card {
            align-items: flex-start;
            flex-direction: column;
          }

          .email-button {
            width: 100%;
            white-space: normal;
            text-align: center;
          }
        }

        @media (max-width: 480px) {
          .child-safety-page {
            padding: 18px 12px 40px;
          }

          .back-navigation {
            margin-bottom: 14px;
          }

          .legal-card {
            padding: 25px 19px;
            border-radius: 21px;
          }

          h1 {
            font-size: 40px;
            line-height: 1.05;
          }

          h2 {
            font-size: 20px;
          }

          p,
          .intro-panel p {
            font-size: 15px;
          }

          .intro-panel {
            padding: 18px;
            border-radius: 17px;
          }

          .policy-links {
            display: grid;
          }

          .policy-links a {
            justify-content: center;
            text-align: center;
          }
        }
      `}</style>
    </main>
  );
}
