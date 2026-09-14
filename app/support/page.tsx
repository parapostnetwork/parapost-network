import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import styles from "./support.module.css";

export const metadata: Metadata = {
  title: "Support | Parapost Network",
  description:
    "Get help with Parapost Network: account access, posts, Reels, Parachat, privacy, and technical problems. Contact support without signing in.",
  alternates: { canonical: "https://parapost.net/support" },
};

const supportEmail = "parapostn@gmail.com";

export default function SupportPage() {
  return (
    <main className={styles.page}>
      <div className={styles.content}>
        <Link className={styles.brand} href="/" aria-label="Parapost Network home">
          <Image src="/parapost-icon-white.png" alt="" width={40} height={40} />
          <span>Parapost Network</span>
        </Link>

        <header className={styles.hero}>
          <p className={styles.eyebrow}>HELP &amp; SUPPORT</p>
          <h1>How can we help?</h1>
          <p>
            Get help with your account, report a problem, or ask a question about
            Parapost Network. You can contact us without signing in.
          </p>
        </header>

        <section className={styles.contact} aria-labelledby="contact-heading">
          <div>
            <h2 id="contact-heading">Contact our support team</h2>
            <p>For account access, app problems, privacy, or safety concerns:</p>
            <a className={styles.email} href={`mailto:${supportEmail}`}>
              {supportEmail}
            </a>
            <p className={styles.note}>
              You can also copy this address into your preferred email app.
            </p>
          </div>
          <a className={styles.primary} href={`mailto:${supportEmail}?subject=Parapost%20Network%20Support`}>
            Email support <span aria-hidden="true">↗</span>
          </a>
        </section>

        <section className={styles.help} aria-labelledby="help-heading">
          <h2 id="help-heading">Help with Parapost Network</h2>
          <div className={styles.grid}>
            <article className={styles.card}>
              <h3>Account &amp; sign-in</h3>
              <p>
                For a forgotten password, use the password reset option on the
                sign-in screen. If you cannot access your account or email,
                contact support at the address above.
              </p>
              <Link href="/">Go to sign-in</Link>
            </article>
            <article className={styles.card}>
              <h3>Report an app problem</h3>
              <p>
                Tell us what you were trying to do, what happened, and the steps
                that led to the problem. Include your device model, operating
                system, and app version if available.
              </p>
              <p className={styles.note}>
                A screenshot can help. Remove private messages or personal
                information that is not needed to explain the issue.
              </p>
            </article>
            <article className={styles.card}>
              <h3>Privacy &amp; safety</h3>
              <p>
                Use the report or block options in the app for unwanted content
                or contact. You can also email support about privacy concerns,
                data requests, or account deletion.
              </p>
              <Link href="/settings/legal/privacy">Read our privacy policy</Link>
            </article>
            <article className={styles.card}>
              <h3>Already signed in?</h3>
              <p>
                Open Settings, then Help &amp; Support to send a request from
                your account. Choose the topic that best describes the help
                you need.
              </p>
              <Link href="/settings/help-support">Open in-app support</Link>
            </article>
          </div>
        </section>

        <aside className={styles.safety}>
          <strong>Keep your account secure.</strong> Never include your password,
          verification codes, or payment details in a support message.
        </aside>

        <footer className={styles.footer}>
          <span>Parapost Network Support</span>
          <nav aria-label="Support page links">
            <Link href="/">Home</Link>
            <Link href="/settings/legal/privacy">Privacy</Link>
            <Link href="/settings/legal/terms">Terms</Link>
          </nav>
        </footer>
      </div>
    </main>
  );
}
