import type { CSSProperties } from "react";
import Link from "next/link";

export default function GlobalGhostHuntPage() {
  return (
    <main style={pageStyle} className="global-ghost-hunt-page">
      <style>{`
        @media (max-width: 760px) {
          .global-ghost-hunt-page {
            padding: 18px 10px 120px !important;
          }

          .ggh-hero {
            padding: 22px 16px !important;
            border-radius: 22px !important;
          }

          .ggh-top-row {
            align-items: flex-start !important;
            gap: 12px !important;
          }

          .ggh-action-row {
            display: grid !important;
            grid-template-columns: minmax(0, 1fr) !important;
          }

          .ggh-action-row a {
            width: 100% !important;
            text-align: center !important;
          }

          .ggh-feature-grid {
            grid-template-columns: minmax(0, 1fr) !important;
          }
        }
      `}</style>

      <div style={shellStyle}>
        <section style={heroStyle} className="ggh-hero">
          <div style={topRowStyle} className="ggh-top-row">
            <div style={brandBadgeStyle}>GLOBAL GHOST HUNT</div>

            <Link href="/dashboard" style={backLinkStyle}>
              Parapost Network
            </Link>
          </div>

          <div style={eventBadgeStyle}>SEPTEMBER 24 — OCTOBER 4, 2026</div>

          <h1 style={titleStyle}>
            The Global Ghost Hunt
            <span style={titleAccentStyle}> Hub</span>
          </h1>

          <p style={subtitleStyle}>
            One global destination for paranormal teams, haunted locations,
            live investigations, schedules, replays, news, and the worldwide
            Global Ghost Hunt community — powered by Parapost Network.
          </p>

          <div style={actionRowStyle} className="ggh-action-row">
            <a href="#event-2026" style={primaryButtonStyle}>
              Explore 2026
            </a>

            <a href="#hub" style={secondaryButtonStyle}>
              Explore the Hub
            </a>
          </div>
        </section>

        <section id="event-2026" style={eventCardStyle}>
          <div style={sectionEyebrowStyle}>GLOBAL GHOST HUNT 2026</div>

          <h2 style={sectionTitleStyle}>The worldwide investigation returns.</h2>

          <p style={sectionTextStyle}>
            From September 24 through October 4, paranormal teams around the
            world will investigate historic and reportedly haunted locations
            as part of Global Ghost Hunt 2026.
          </p>

          <p style={sectionTextStyle}>
            For 2026, Parapost will support the event through the Parapost
            Community Timeline and YouTube Live links while we continue
            testing and expanding the platform.
          </p>

          <div style={eventInfoGridStyle}>
            <div style={infoCardStyle}>
              <span style={infoLabelStyle}>EVENT</span>
              <strong style={infoValueStyle}>Global Ghost Hunt 2026</strong>
            </div>

            <div style={infoCardStyle}>
              <span style={infoLabelStyle}>DATES</span>
              <strong style={infoValueStyle}>Sept 24 — Oct 4</strong>
            </div>

            <div style={infoCardStyle}>
              <span style={infoLabelStyle}>HOME</span>
              <strong style={infoValueStyle}>Parapost Network</strong>
            </div>
          </div>
        </section>

        <section id="hub" style={hubSectionStyle}>
          <div style={sectionEyebrowStyle}>THE GLOBAL GHOST HUNT HUB</div>

          <h2 style={sectionTitleStyle}>
            Built to become the home of Global Ghost Hunt.
          </h2>

          <p style={sectionTextStyle}>
            The full Hub will bring the event together inside Parapost,
            creating one place for viewers to discover investigations,
            follow teams and locations, watch live broadcasts, and return
            for replays and updates.
          </p>

          <div style={featureGridStyle} className="ggh-feature-grid">
            <FeatureCard
              eyebrow="WATCH"
              title="Live Now"
              description="See Global Ghost Hunt investigations that are currently broadcasting."
            />

            <FeatureCard
              eyebrow="NEXT"
              title="Upcoming Investigations"
              description="Discover which teams and haunted locations are scheduled to investigate next."
            />

            <FeatureCard
              eyebrow="PLAN"
              title="Event Schedule"
              description="Follow the worldwide investigation schedule across the full Global Ghost Hunt event."
            />

            <FeatureCard
              eyebrow="DISCOVER"
              title="Teams & Locations"
              description="Meet participating paranormal teams and explore the locations they are investigating."
            />

            <FeatureCard
              eyebrow="WATCH AGAIN"
              title="Replays"
              description="Return to completed investigations and watch broadcasts after they have ended."
            />

            <FeatureCard
              eyebrow="COMMUNITY"
              title="News & Updates"
              description="Follow announcements, event updates, stories, registration information, and more."
            />
          </div>
        </section>

        <section style={futureCardStyle}>
          <div style={futureBadgeStyle}>LOOKING AHEAD TO 2027</div>

          <h2 style={futureTitleStyle}>Global Ghost Hunt × Parapost Network</h2>

          <p style={futureTextStyle}>
            In 2027, the goal is for the Global Ghost Hunt Hub to become the
            central entrance to the event — with people coming through
            Parapost to watch investigations and experience Global Ghost Hunt.
          </p>

          <div style={poweredByStyle}>
            POWERED BY <strong>PARAPOST NETWORK</strong>
          </div>
        </section>
      </div>
    </main>
  );
}

function FeatureCard({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <article style={featureCardStyle}>
      <div style={featureEyebrowStyle}>{eyebrow}</div>
      <h3 style={featureTitleStyle}>{title}</h3>
      <p style={featureTextStyle}>{description}</p>
      <div style={comingSoonStyle}>Coming to the Hub</div>
    </article>
  );
}

const pageStyle: CSSProperties = {
  minHeight: "100vh",
  overflowX: "hidden",
  padding: "28px 16px 64px",
  background:
    "radial-gradient(circle at top left, color-mix(in srgb, var(--parapost-accent, #a855f7) 24%, transparent), transparent 32%), radial-gradient(circle at 88% 22%, rgba(59,130,246,0.12), transparent 25%), linear-gradient(180deg, #050611 0%, #090b18 48%, #050611 100%)",
};

const shellStyle: CSSProperties = {
  width: "min(1120px, 100%)",
  margin: "0 auto",
  display: "grid",
  gap: 18,
};

const heroStyle: CSSProperties = {
  position: "relative",
  borderRadius: 28,
  border: "1px solid rgba(216,180,254,0.18)",
  background:
    "linear-gradient(135deg, rgba(8,10,22,0.95), rgba(16,12,34,0.90))",
  boxShadow: "0 28px 90px rgba(0,0,0,0.45)",
  padding: 28,
  overflow: "hidden",
};

const topRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  flexWrap: "wrap",
};

const brandBadgeStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  minHeight: 32,
  padding: "0 12px",
  borderRadius: 999,
  border: "1px solid rgba(216,180,254,0.22)",
  background: "rgba(168,85,247,0.12)",
  color: "#e9d5ff",
  fontSize: "0.75rem",
  fontWeight: 800,
  letterSpacing: "0.14em",
};

const backLinkStyle: CSSProperties = {
  color: "#cbd5e1",
  fontSize: "0.88rem",
  fontWeight: 700,
  textDecoration: "none",
};

const eventBadgeStyle: CSSProperties = {
  display: "inline-flex",
  marginTop: 44,
  color: "#c4b5fd",
  fontSize: "0.78rem",
  fontWeight: 800,
  letterSpacing: "0.12em",
};

const titleStyle: CSSProperties = {
  maxWidth: 850,
  margin: "12px 0 0",
  color: "#ffffff",
  fontSize: "clamp(2.7rem, 7vw, 5.8rem)",
  lineHeight: 0.95,
  letterSpacing: "-0.065em",
};

const titleAccentStyle: CSSProperties = {
  color: "var(--parapost-accent, #a855f7)",
};

const subtitleStyle: CSSProperties = {
  maxWidth: 760,
  margin: "22px 0 0",
  color: "#cbd5e1",
  fontSize: "clamp(1rem, 2vw, 1.15rem)",
  lineHeight: 1.7,
};

const actionRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  flexWrap: "wrap",
  marginTop: 28,
};

const primaryButtonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: 46,
  padding: "0 18px",
  borderRadius: 14,
  background: "var(--parapost-accent, #a855f7)",
  color: "#ffffff",
  fontWeight: 800,
  textDecoration: "none",
};

const secondaryButtonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: 46,
  padding: "0 18px",
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(255,255,255,0.05)",
  color: "#ffffff",
  fontWeight: 800,
  textDecoration: "none",
};

const eventCardStyle: CSSProperties = {
  borderRadius: 24,
  border: "1px solid rgba(255,255,255,0.08)",
  background: "rgba(8,10,22,0.88)",
  padding: 24,
};

const sectionEyebrowStyle: CSSProperties = {
  color: "#c4b5fd",
  fontSize: "0.74rem",
  fontWeight: 800,
  letterSpacing: "0.13em",
};

const sectionTitleStyle: CSSProperties = {
  maxWidth: 760,
  margin: "8px 0 0",
  color: "#ffffff",
  fontSize: "clamp(1.7rem, 4vw, 2.7rem)",
  lineHeight: 1.08,
  letterSpacing: "-0.045em",
};

const sectionTextStyle: CSSProperties = {
  maxWidth: 800,
  margin: "14px 0 0",
  color: "#aeb8ca",
  lineHeight: 1.7,
};

const eventInfoGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
  gap: 12,
  marginTop: 22,
};

const infoCardStyle: CSSProperties = {
  display: "grid",
  gap: 5,
  padding: 16,
  borderRadius: 17,
  border: "1px solid rgba(255,255,255,0.07)",
  background: "rgba(255,255,255,0.035)",
};

const infoLabelStyle: CSSProperties = {
  color: "#818cf8",
  fontSize: "0.68rem",
  fontWeight: 800,
  letterSpacing: "0.12em",
};

const infoValueStyle: CSSProperties = {
  color: "#ffffff",
  fontSize: "0.96rem",
};

const hubSectionStyle: CSSProperties = {
  borderRadius: 24,
  border: "1px solid rgba(216,180,254,0.12)",
  background: "rgba(8,10,22,0.76)",
  padding: 24,
};

const featureGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
  gap: 12,
  marginTop: 24,
};

const featureCardStyle: CSSProperties = {
  minHeight: 210,
  display: "flex",
  flexDirection: "column",
  padding: 20,
  borderRadius: 20,
  border: "1px solid rgba(255,255,255,0.08)",
  background:
    "linear-gradient(180deg, rgba(255,255,255,0.045), rgba(255,255,255,0.02))",
};

const featureEyebrowStyle: CSSProperties = {
  color: "#a78bfa",
  fontSize: "0.68rem",
  fontWeight: 800,
  letterSpacing: "0.12em",
};

const featureTitleStyle: CSSProperties = {
  margin: "10px 0 0",
  color: "#ffffff",
  fontSize: "1.28rem",
};

const featureTextStyle: CSSProperties = {
  margin: "10px 0 0",
  color: "#9ca9bd",
  lineHeight: 1.55,
  fontSize: "0.92rem",
};

const comingSoonStyle: CSSProperties = {
  marginTop: "auto",
  paddingTop: 18,
  color: "#64748b",
  fontSize: "0.75rem",
  fontWeight: 700,
};

const futureCardStyle: CSSProperties = {
  textAlign: "center",
  borderRadius: 26,
  border: "1px solid rgba(168,85,247,0.2)",
  background:
    "radial-gradient(circle at top, rgba(168,85,247,0.15), transparent 55%), rgba(8,10,22,0.90)",
  padding: "38px 24px",
};

const futureBadgeStyle: CSSProperties = {
  color: "#c4b5fd",
  fontSize: "0.72rem",
  fontWeight: 800,
  letterSpacing: "0.13em",
};

const futureTitleStyle: CSSProperties = {
  margin: "10px auto 0",
  color: "#ffffff",
  fontSize: "clamp(1.8rem, 4vw, 3rem)",
  letterSpacing: "-0.05em",
};

const futureTextStyle: CSSProperties = {
  maxWidth: 760,
  margin: "16px auto 0",
  color: "#aeb8ca",
  lineHeight: 1.7,
};

const poweredByStyle: CSSProperties = {
  marginTop: 28,
  color: "#94a3b8",
  fontSize: "0.72rem",
  letterSpacing: "0.12em",
};