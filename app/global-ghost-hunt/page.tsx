import type { CSSProperties } from "react";
import Link from "next/link";

import {
  ghostHunt2026,
  hubFeatures,
  investigations,
  locations,
  newsItems,
  sponsors,
  teams,
  type GhostHuntNewsItem,
  type HuntLocation,
  type HuntTeam,
  type Investigation,
  type Sponsor,
} from "./data";

const liveInvestigations = investigations.filter(
  (investigation) => investigation.status === "live",
);

const upcomingInvestigations = [...investigations]
  .filter((investigation) => investigation.status === "upcoming")
  .sort(
    (a, b) =>
      new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime(),
  );

const replayInvestigations = [...investigations]
  .filter((investigation) => investigation.status === "ended")
  .sort(
    (a, b) =>
      new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime(),
  );

function formatEventDate(value: string) {
  const date = new Date(`${value}T12:00:00`);

  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatInvestigationDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "Schedule to be announced";

  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function getTeam(teamId: string) {
  return teams.find((team) => team.id === teamId);
}

function getLocation(locationId: string) {
  return locations.find((location) => location.id === locationId);
}

export default function GlobalGhostHuntPage() {
  const eventDateLabel = `${formatEventDate(
    ghostHunt2026.startDate,
  )} — ${formatEventDate(ghostHunt2026.endDate)}`;

  return (
    <main style={pageStyle} className="global-ghost-hunt-page">
      <style>{`
        html {
          scroll-behavior: smooth;
        }

        .global-ghost-hunt-page * {
          box-sizing: border-box;
        }

        .ggh-feature-link,
        .ggh-nav-link,
        .ggh-primary-link,
        .ggh-secondary-link,
        .ggh-card-link {
          transition:
            transform 160ms ease,
            border-color 160ms ease,
            background 160ms ease,
            color 160ms ease,
            box-shadow 160ms ease;
        }

        .ggh-feature-link:hover,
        .ggh-card-link:hover {
          transform: translateY(-2px);
          border-color: rgba(216, 180, 254, 0.34) !important;
          box-shadow: 0 20px 50px rgba(0, 0, 0, 0.34);
        }

        .ggh-primary-link:hover,
        .ggh-secondary-link:hover,
        .ggh-nav-link:hover {
          transform: translateY(-1px);
        }

        @media (max-width: 900px) {
          .ggh-hero-grid,
          .ggh-two-column-grid {
            grid-template-columns: minmax(0, 1fr) !important;
          }

          .ggh-feature-grid,
          .ggh-three-column-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          }
        }

        @media (max-width: 760px) {
          .global-ghost-hunt-page {
            padding: 18px 10px 120px !important;
          }

          .ggh-hero,
          .ggh-section-card {
            padding: 20px 16px !important;
            border-radius: 22px !important;
          }

          .ggh-top-row,
          .ggh-section-heading-row {
            align-items: flex-start !important;
            flex-direction: column !important;
          }

          .ggh-action-row {
            display: grid !important;
            grid-template-columns: minmax(0, 1fr) !important;
          }

          .ggh-action-row a {
            width: 100% !important;
            text-align: center !important;
          }

          .ggh-feature-grid,
          .ggh-three-column-grid,
          .ggh-stat-grid,
          .ggh-event-info-grid {
            grid-template-columns: minmax(0, 1fr) !important;
          }

          .ggh-nav {
            overflow-x: auto;
            flex-wrap: nowrap !important;
            justify-content: flex-start !important;
            padding-bottom: 4px;
          }

          .ggh-nav a {
            flex: 0 0 auto;
          }
        }
      `}</style>

      <div style={shellStyle}>
        <section style={heroStyle} className="ggh-hero">
          <div style={heroGlowStyle} aria-hidden="true" />

          <div style={heroContentStyle}>
            <div style={topRowStyle} className="ggh-top-row">
              <div style={brandBadgeStyle}>GLOBAL GHOST HUNT</div>

              <Link
                href="/dashboard"
                style={backLinkStyle}
                className="ggh-nav-link"
              >
                Parapost Network
              </Link>
            </div>

            <div style={heroGridStyle} className="ggh-hero-grid">
              <div>
                <div style={eventBadgeStyle}>{eventDateLabel}</div>

                <h1 style={titleStyle}>
                  The Global Ghost Hunt
                  <span style={titleAccentStyle}> Hub</span>
                </h1>

                <p style={subtitleStyle}>
                  One global destination for paranormal teams, haunted
                  locations, live investigations, schedules, replays, news, and
                  the worldwide Global Ghost Hunt community — powered by
                  Parapost Network.
                </p>

                <div style={actionRowStyle} className="ggh-action-row">
                  <a
                    href="#event-2026"
                    style={primaryButtonStyle}
                    className="ggh-primary-link"
                  >
                    Explore 2026
                  </a>

                  <a
                    href="#hub"
                    style={secondaryButtonStyle}
                    className="ggh-secondary-link"
                  >
                    Explore the Hub
                  </a>
                </div>
              </div>

              <div style={heroSideCardStyle}>
                <div style={heroSideEyebrowStyle}>2026 EVENT</div>
                <div style={heroSideDateStyle}>
                  {formatEventDate(ghostHunt2026.startDate)}
                  <span style={heroSideDividerStyle}>to</span>
                  {formatEventDate(ghostHunt2026.endDate)}
                </div>
                <div style={heroTaglineStyle}>{ghostHunt2026.tagline}</div>
                <p style={heroSideTextStyle}>{ghostHunt2026.description}</p>
              </div>
            </div>
          </div>
        </section>

        <nav style={navStyle} className="ggh-nav" aria-label="Hub navigation">
          <a href="#live-now" style={navLinkStyle} className="ggh-nav-link">
            Live Now
          </a>
          <a href="#upcoming" style={navLinkStyle} className="ggh-nav-link">
            Upcoming
          </a>
          <a href="#schedule" style={navLinkStyle} className="ggh-nav-link">
            Schedule
          </a>
          <a
            href="#teams-locations"
            style={navLinkStyle}
            className="ggh-nav-link"
          >
            Teams & Locations
          </a>
          <a href="#replays" style={navLinkStyle} className="ggh-nav-link">
            Replays
          </a>
          <a href="#news" style={navLinkStyle} className="ggh-nav-link">
            News
          </a>
          <a href="#sponsors" style={navLinkStyle} className="ggh-nav-link">
            Sponsors
          </a>
          <a href="#register" style={navLinkStyle} className="ggh-nav-link">
            Registration
          </a>
        </nav>

        <section id="event-2026" style={sectionCardStyle} className="ggh-section-card">
          <div style={sectionHeadingRowStyle} className="ggh-section-heading-row">
            <div>
              <div style={sectionEyebrowStyle}>GLOBAL GHOST HUNT 2026</div>
              <h2 style={sectionTitleStyle}>
                The worldwide investigation returns.
              </h2>
            </div>

            <div style={sectionPillStyle}>{ghostHunt2026.tagline}</div>
          </div>

          <p style={sectionTextStyle}>
            From {formatEventDate(ghostHunt2026.startDate)} through{" "}
            {formatEventDate(ghostHunt2026.endDate)}, paranormal teams around
            the world will investigate historic and reportedly haunted
            locations as part of Global Ghost Hunt 2026.
          </p>

          <p style={sectionTextStyle}>
            For 2026, viewers can follow Global Ghost Hunt through the
            Parapost Community Timeline and participating teams’ YouTube Live
            broadcasts, bringing the worldwide event together in one place.
          </p>

          <div style={eventInfoGridStyle} className="ggh-event-info-grid">
            <InfoCard label="EVENT" value={ghostHunt2026.name} />
            <InfoCard label="DATES" value={eventDateLabel} />
            <InfoCard label="HOME" value="Parapost Network" />
          </div>
        </section>

        <section id="hub" style={sectionCardStyle} className="ggh-section-card">
          <div style={sectionEyebrowStyle}>THE GLOBAL GHOST HUNT HUB</div>

          <h2 style={sectionTitleStyle}>
            Built to become the home of Global Ghost Hunt.
          </h2>

          <p style={sectionTextStyle}>
            The Hub is designed as one dedicated destination for viewers to
            discover investigations, follow teams and locations, watch
            broadcasts, return for replays, see event news, and experience the
            Global Ghost Hunt community through Parapost.
          </p>

          <div style={featureGridStyle} className="ggh-feature-grid">
            {hubFeatures.map((feature) => (
              <a
                key={feature.title}
                href={feature.href}
                style={featureLinkStyle}
                className="ggh-feature-link"
              >
                <div style={featureEyebrowStyle}>{feature.eyebrow}</div>
                <h3 style={featureTitleStyle}>{feature.title}</h3>
                <p style={featureTextStyle}>{feature.description}</p>
                <div style={comingSoonStyle}>Explore section</div>
              </a>
            ))}
          </div>
        </section>

        <section
          id="live-now"
          style={sectionCardStyle}
          className="ggh-section-card"
        >
          <SectionHeading
            eyebrow="WATCH"
            title="Live Now"
            description="Global Ghost Hunt investigations that are currently broadcasting will appear here."
            badge={`${liveInvestigations.length} live`}
          />

          {liveInvestigations.length > 0 ? (
            <div style={contentGridStyle} className="ggh-three-column-grid">
              {liveInvestigations.map((investigation) => (
                <InvestigationCard
                  key={investigation.id}
                  investigation={investigation}
                  tone="live"
                />
              ))}
            </div>
          ) : (
            <EmptyState
              title="No investigations are live right now."
              text="When a Global Ghost Hunt investigation is broadcasting, its live card will appear here."
            />
          )}
        </section>

        <section
          id="upcoming"
          style={sectionCardStyle}
          className="ggh-section-card"
        >
          <SectionHeading
            eyebrow="NEXT"
            title="Upcoming Investigations"
            description="The next scheduled Global Ghost Hunt investigations will be listed here."
            badge={`${upcomingInvestigations.length} scheduled`}
          />

          {upcomingInvestigations.length > 0 ? (
            <div style={contentGridStyle} className="ggh-three-column-grid">
              {upcomingInvestigations.slice(0, 6).map((investigation) => (
                <InvestigationCard
                  key={investigation.id}
                  investigation={investigation}
                  tone="upcoming"
                />
              ))}
            </div>
          ) : (
            <EmptyState
              title="The investigation schedule is being prepared."
              text="Confirmed teams, locations, dates, and start times will appear here as the 2026 schedule is announced."
            />
          )}
        </section>

        <section
          id="schedule"
          style={sectionCardStyle}
          className="ggh-section-card"
        >
          <SectionHeading
            eyebrow="PLAN"
            title="Event Schedule"
            description="A single worldwide schedule for the full Global Ghost Hunt event."
            badge={`${investigations.length} investigations`}
          />

          {investigations.length > 0 ? (
            <div style={scheduleListStyle}>
              {[...investigations]
                .sort(
                  (a, b) =>
                    new Date(a.scheduledAt).getTime() -
                    new Date(b.scheduledAt).getTime(),
                )
                .map((investigation) => (
                  <ScheduleRow
                    key={investigation.id}
                    investigation={investigation}
                  />
                ))}
            </div>
          ) : (
            <EmptyState
              title="Full schedule coming soon."
              text="Official 2026 investigation dates and start times will appear here as they are confirmed."
            />
          )}
        </section>

        <section
          id="teams-locations"
          style={sectionCardStyle}
          className="ggh-section-card"
        >
          <SectionHeading
            eyebrow="DISCOVER"
            title="Teams & Locations"
            description="Meet the paranormal teams taking part and explore the locations they will investigate."
            badge={`${teams.length} teams`}
          />

          <div style={twoColumnGridStyle} className="ggh-two-column-grid">
            <div>
              <div style={subsectionTitleStyle}>Participating Teams</div>

              {teams.length > 0 ? (
                <div style={stackStyle}>
                  {teams.map((team) => (
                    <TeamCard key={team.id} team={team} />
                  ))}
                </div>
              ) : (
                <EmptyState
                  compact
                  title="Participating teams coming soon."
                  text="Meet the paranormal teams taking part in Global Ghost Hunt and learn more about where they are from."
                />
              )}
            </div>

            <div>
              <div style={subsectionTitleStyle}>Investigation Locations</div>

              {locations.length > 0 ? (
                <div style={stackStyle}>
                  {locations.map((location) => (
                    <LocationCard key={location.id} location={location} />
                  ))}
                </div>
              ) : (
                <EmptyState
                  compact
                  title="Investigation locations coming soon."
                  text="Explore the haunted and historic locations taking part in Global Ghost Hunt as they are announced."
                />
              )}
            </div>
          </div>
        </section>

        <section
          id="replays"
          style={sectionCardStyle}
          className="ggh-section-card"
        >
          <SectionHeading
            eyebrow="WATCH AGAIN"
            title="Replays"
            description="Completed Global Ghost Hunt investigations will remain easy to find after the live broadcast ends."
            badge={`${replayInvestigations.length} replays`}
          />

          {replayInvestigations.length > 0 ? (
            <div style={contentGridStyle} className="ggh-three-column-grid">
              {replayInvestigations.map((investigation) => (
                <InvestigationCard
                  key={investigation.id}
                  investigation={investigation}
                  tone="replay"
                />
              ))}
            </div>
          ) : (
            <EmptyState
              title="No replays have been added yet."
              text="Completed broadcasts can be placed here so viewers can return to investigations at any time."
            />
          )}
        </section>

        <section id="news" style={sectionCardStyle} className="ggh-section-card">
          <SectionHeading
            eyebrow="COMMUNITY"
            title="News & Updates"
            description="Event announcements, team news, schedule changes, stories, and Global Ghost Hunt updates."
            badge={`${newsItems.length} updates`}
          />

          {newsItems.length > 0 ? (
            <div style={contentGridStyle} className="ggh-three-column-grid">
              {newsItems.map((item) => (
                <NewsCard key={item.id} item={item} />
              ))}
            </div>
          ) : (
            <EmptyState
              title="Official news coming soon."
              text="Global Ghost Hunt announcements, schedule updates, team news, and event stories will appear here."
            />
          )}
        </section>

        <section
          id="sponsors"
          style={sectionCardStyle}
          className="ggh-section-card"
        >
          <SectionHeading
            eyebrow="SUPPORT"
            title="Sponsors & Partners"
            description="Recognizing the organizations supporting Global Ghost Hunt."
            badge={`${sponsors.length} listed`}
          />

          {sponsors.length > 0 ? (
            <div style={contentGridStyle} className="ggh-three-column-grid">
              {sponsors.map((sponsor) => (
                <SponsorCard key={sponsor.id} sponsor={sponsor} />
              ))}
            </div>
          ) : (
            <EmptyState
              title="Sponsors & partners coming soon."
              text="Organizations supporting Global Ghost Hunt will be featured here as partnerships are announced."
            />
          )}
        </section>

        <section
          id="register"
          style={registrationCardStyle}
          className="ggh-section-card"
        >
          <div style={registrationGlowStyle} aria-hidden="true" />

          <div style={registrationContentStyle}>
            <div style={futureBadgeStyle}>TEAM REGISTRATION</div>
            <h2 style={futureTitleStyle}>Take part in Global Ghost Hunt.</h2>
            <p style={futureTextStyle}>
              Team registration will bring investigation details, locations,
              scheduling, and event information together in one organized
              place.
            </p>

            <div style={registrationNoticeStyle}>
              Registration information for upcoming Global Ghost Hunt events
              will be announced here as details become available.
            </div>
          </div>
        </section>

        <section style={futureCardStyle} className="ggh-section-card">
          <div style={futureBadgeStyle}>LOOKING AHEAD TO 2027</div>

          <h2 style={futureTitleStyle}>Global Ghost Hunt × Parapost Network</h2>

          <p style={futureTextStyle}>
            In 2027, the goal is for the Global Ghost Hunt Hub to become the
            central entrance to the event — with viewers coming through Parapost
            to discover teams, follow the worldwide schedule, watch live
            investigations, and return for replays.
          </p>

          <div style={statGridStyle} className="ggh-stat-grid">
            <StatCard label="WATCH" value="Live investigations" />
            <StatCard label="DISCOVER" value="Teams & locations" />
            <StatCard label="RETURN" value="Replays & updates" />
          </div>

          <div style={poweredByStyle}>
            POWERED BY <strong>PARAPOST NETWORK</strong>
          </div>
        </section>
      </div>
    </main>
  );
}

function SectionHeading({
  eyebrow,
  title,
  description,
  badge,
}: {
  eyebrow: string;
  title: string;
  description: string;
  badge: string;
}) {
  return (
    <div style={sectionHeadingRowStyle} className="ggh-section-heading-row">
      <div>
        <div style={sectionEyebrowStyle}>{eyebrow}</div>
        <h2 style={sectionTitleStyle}>{title}</h2>
        <p style={{ ...sectionTextStyle, marginBottom: 0 }}>{description}</p>
      </div>

      <div style={sectionPillStyle}>{badge}</div>
    </div>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={infoCardStyle}>
      <div style={infoLabelStyle}>{label}</div>
      <div style={infoValueStyle}>{value}</div>
    </div>
  );
}

function EmptyState({
  title,
  text,
  compact = false,
}: {
  title: string;
  text: string;
  compact?: boolean;
}) {
  return (
    <div
      style={{
        ...emptyStateStyle,
        minHeight: compact ? 150 : 190,
        marginTop: compact ? 12 : 20,
      }}
    >
      <div style={emptyOrbStyle}>GGH</div>
      <strong style={emptyTitleStyle}>{title}</strong>
      <span style={emptyTextStyle}>{text}</span>
    </div>
  );
}

function InvestigationCard({
  investigation,
  tone,
}: {
  investigation: Investigation;
  tone: "live" | "upcoming" | "replay";
}) {
  const team = getTeam(investigation.teamId);
  const location = getLocation(investigation.locationId);

  const destination =
    tone === "live"
      ? investigation.streamUrl
      : tone === "replay"
        ? investigation.replayUrl
        : undefined;

  const statusLabel =
    tone === "live" ? "LIVE NOW" : tone === "replay" ? "REPLAY" : "UPCOMING";

  return (
    <article style={investigationCardStyle}>
      <div style={mediaPlaceholderStyle}>
        {investigation.thumbnailUrl ? (
          <img
            src={investigation.thumbnailUrl}
            alt=""
            style={mediaImageStyle}
          />
        ) : (
          <div style={mediaFallbackStyle}>
            <span style={mediaFallbackTopStyle}>{statusLabel}</span>
            <strong style={mediaFallbackTitleStyle}>Global Ghost Hunt</strong>
          </div>
        )}
      </div>

      <div style={investigationBodyStyle}>
        <div
          style={{
            ...statusBadgeStyle,
            ...(tone === "live"
              ? liveBadgeStyle
              : tone === "replay"
                ? replayBadgeStyle
                : upcomingBadgeStyle),
          }}
        >
          {statusLabel}
        </div>

        <h3 style={cardTitleStyle}>{investigation.title}</h3>

        <div style={cardMetaStyle}>
          {team?.name || "Team to be announced"}
        </div>

        <div style={cardMetaStyle}>
          {location
            ? [location.name, location.city, location.region, location.country]
                .filter(Boolean)
                .join(", ")
            : "Location to be announced"}
        </div>

        <div style={cardDateStyle}>
          {formatInvestigationDate(investigation.scheduledAt)}
        </div>

        {investigation.description ? (
          <p style={cardTextStyle}>{investigation.description}</p>
        ) : null}

        {destination ? (
          <a
            href={destination}
            target="_blank"
            rel="noreferrer"
            style={smallActionStyle}
            className="ggh-card-link"
          >
            {tone === "live" ? "Watch Live" : "Watch Replay"}
          </a>
        ) : (
          <div style={smallMutedActionStyle}>
            {tone === "upcoming" ? "Broadcast link coming soon" : "Link pending"}
          </div>
        )}
      </div>
    </article>
  );
}

function ScheduleRow({ investigation }: { investigation: Investigation }) {
  const team = getTeam(investigation.teamId);
  const location = getLocation(investigation.locationId);

  return (
    <div style={scheduleRowStyle}>
      <div style={scheduleDateStyle}>
        {formatInvestigationDate(investigation.scheduledAt)}
      </div>

      <div style={scheduleMainStyle}>
        <strong style={scheduleTitleStyle}>{investigation.title}</strong>
        <span style={scheduleMetaStyle}>
          {team?.name || "Team to be announced"}
          {" • "}
          {location?.name || "Location to be announced"}
        </span>
      </div>

      <div style={scheduleStatusStyle}>{investigation.status}</div>
    </div>
  );
}

function TeamCard({ team }: { team: HuntTeam }) {
  return (
    <article style={profileCardStyle}>
      <div style={profileAvatarStyle}>
        {team.logoUrl ? (
          <img src={team.logoUrl} alt="" style={profileImageStyle} />
        ) : (
          <span>{team.name.slice(0, 2).toUpperCase()}</span>
        )}
      </div>

      <div style={{ minWidth: 0 }}>
        <h3 style={profileTitleStyle}>{team.name}</h3>
        <div style={profileMetaStyle}>
          {[team.region, team.country].filter(Boolean).join(", ")}
        </div>
        {team.description ? (
          <p style={profileTextStyle}>{team.description}</p>
        ) : null}
      </div>
    </article>
  );
}

function LocationCard({ location }: { location: HuntLocation }) {
  return (
    <article style={profileCardStyle}>
      <div style={locationThumbStyle}>
        {location.imageUrl ? (
          <img src={location.imageUrl} alt="" style={profileImageStyle} />
        ) : (
          <span>LOC</span>
        )}
      </div>

      <div style={{ minWidth: 0 }}>
        <h3 style={profileTitleStyle}>{location.name}</h3>
        <div style={profileMetaStyle}>
          {[location.city, location.region, location.country]
            .filter(Boolean)
            .join(", ")}
        </div>
        {location.description ? (
          <p style={profileTextStyle}>{location.description}</p>
        ) : null}
      </div>
    </article>
  );
}

function NewsCard({ item }: { item: GhostHuntNewsItem }) {
  return (
    <article style={newsCardStyle}>
      <div style={newsDateStyle}>{formatEventDate(item.publishedAt)}</div>
      <h3 style={cardTitleStyle}>{item.title}</h3>
      <p style={cardTextStyle}>{item.summary}</p>
    </article>
  );
}

function SponsorCard({ sponsor }: { sponsor: Sponsor }) {
  return (
    <article style={sponsorCardStyle}>
      <div style={sponsorLogoStyle}>
        {sponsor.logoUrl ? (
          <img src={sponsor.logoUrl} alt="" style={sponsorImageStyle} />
        ) : (
          <span>{sponsor.name.slice(0, 2).toUpperCase()}</span>
        )}
      </div>

      <h3 style={cardTitleStyle}>{sponsor.name}</h3>

      {sponsor.website ? (
        <a
          href={sponsor.website}
          target="_blank"
          rel="noreferrer"
          style={smallActionStyle}
          className="ggh-card-link"
        >
          Visit Sponsor
        </a>
      ) : (
        <div style={smallMutedActionStyle}>Sponsor information</div>
      )}
    </article>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={statCardStyle}>
      <div style={statLabelStyle}>{label}</div>
      <div style={statValueStyle}>{value}</div>
    </div>
  );
}

const pageStyle: CSSProperties = {
  minHeight: "100vh",
  overflowX: "hidden",
  padding: "28px 16px 64px",
  background:
    "radial-gradient(circle at 12% 0%, color-mix(in srgb, var(--parapost-accent, #a855f7) 24%, transparent), transparent 30%), radial-gradient(circle at 92% 18%, rgba(79,70,229,0.16), transparent 28%), linear-gradient(180deg, #04050c 0%, #080b18 48%, #050611 100%)",
};

const shellStyle: CSSProperties = {
  width: "min(1120px, 100%)",
  margin: "0 auto",
  display: "grid",
  gap: 18,
};

const heroStyle: CSSProperties = {
  position: "relative",
  overflow: "hidden",
  borderRadius: 30,
  border: "1px solid rgba(216,180,254,0.18)",
  background:
    "linear-gradient(145deg, rgba(11,12,27,0.97), rgba(8,10,22,0.91))",
  boxShadow: "0 30px 100px rgba(0,0,0,0.46)",
  padding: 24,
};

const heroGlowStyle: CSSProperties = {
  position: "absolute",
  width: 420,
  height: 420,
  borderRadius: "50%",
  right: -170,
  top: -190,
  background:
    "radial-gradient(circle, color-mix(in srgb, var(--parapost-accent, #a855f7) 34%, transparent), transparent 70%)",
  pointerEvents: "none",
};

const heroContentStyle: CSSProperties = {
  position: "relative",
  zIndex: 1,
};

const topRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 14,
};

const brandBadgeStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  minHeight: 34,
  padding: "7px 12px",
  borderRadius: 999,
  color: "#f5f3ff",
  border: "1px solid rgba(216,180,254,0.24)",
  background: "rgba(168,85,247,0.12)",
  fontSize: 12,
  fontWeight: 950,
  letterSpacing: "0.09em",
};

const backLinkStyle: CSSProperties = {
  color: "#ddd6fe",
  textDecoration: "none",
  fontWeight: 850,
  fontSize: 13,
  border: "1px solid rgba(216,180,254,0.18)",
  background: "rgba(255,255,255,0.04)",
  borderRadius: 999,
  padding: "9px 13px",
};

const heroGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.45fr) minmax(280px, 0.55fr)",
  gap: 22,
  alignItems: "end",
  marginTop: 26,
};

const eventBadgeStyle: CSSProperties = {
  display: "inline-flex",
  color: "#c4b5fd",
  fontSize: 12,
  fontWeight: 950,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
};

const titleStyle: CSSProperties = {
  margin: "14px 0 0",
  color: "#fff",
  fontSize: "clamp(2.5rem, 6vw, 5.2rem)",
  lineHeight: 0.96,
  letterSpacing: "-0.07em",
  maxWidth: 830,
};

const titleAccentStyle: CSSProperties = {
  color: "var(--parapost-accent, #a855f7)",
};

const subtitleStyle: CSSProperties = {
  maxWidth: 760,
  margin: "18px 0 0",
  color: "#cbd5e1",
  fontSize: "clamp(1rem, 2vw, 1.12rem)",
  lineHeight: 1.7,
};

const actionRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  flexWrap: "wrap",
  marginTop: 22,
};

const primaryButtonStyle: CSSProperties = {
  textDecoration: "none",
  minHeight: 44,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: 999,
  padding: "10px 18px",
  color: "#fff",
  fontSize: 13,
  fontWeight: 950,
  background:
    "linear-gradient(135deg, var(--parapost-accent, #a855f7), #7c3aed)",
  boxShadow: "0 14px 34px rgba(124,58,237,0.24)",
};

const secondaryButtonStyle: CSSProperties = {
  ...primaryButtonStyle,
  color: "#ede9fe",
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(216,180,254,0.22)",
  boxShadow: "none",
};

const heroSideCardStyle: CSSProperties = {
  borderRadius: 22,
  border: "1px solid rgba(255,255,255,0.09)",
  background: "rgba(255,255,255,0.045)",
  padding: 18,
};

const heroSideEyebrowStyle: CSSProperties = {
  color: "#c4b5fd",
  fontSize: 11,
  fontWeight: 950,
  letterSpacing: "0.1em",
};

const heroSideDateStyle: CSSProperties = {
  marginTop: 10,
  color: "#fff",
  fontSize: 18,
  fontWeight: 950,
  lineHeight: 1.4,
};

const heroSideDividerStyle: CSSProperties = {
  display: "block",
  color: "#a78bfa",
  fontSize: 11,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  margin: "3px 0",
};

const heroTaglineStyle: CSSProperties = {
  display: "inline-flex",
  marginTop: 12,
  padding: "7px 10px",
  borderRadius: 999,
  color: "#f5f3ff",
  background: "rgba(168,85,247,0.14)",
  border: "1px solid rgba(216,180,254,0.18)",
  fontSize: 11,
  fontWeight: 900,
};

const heroSideTextStyle: CSSProperties = {
  margin: "12px 0 0",
  color: "#cbd5e1",
  fontSize: 13.5,
  lineHeight: 1.6,
};

const navStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexWrap: "wrap",
  gap: 8,
  borderRadius: 18,
  border: "1px solid rgba(255,255,255,0.08)",
  background: "rgba(8,10,22,0.78)",
  padding: 10,
  backdropFilter: "blur(16px)",
};

const navLinkStyle: CSSProperties = {
  textDecoration: "none",
  color: "#d8dee9",
  padding: "8px 11px",
  borderRadius: 999,
  fontSize: 12.5,
  fontWeight: 850,
  background: "rgba(255,255,255,0.025)",
};

const sectionCardStyle: CSSProperties = {
  borderRadius: 26,
  border: "1px solid rgba(255,255,255,0.085)",
  background: "rgba(8,10,22,0.86)",
  boxShadow: "0 20px 70px rgba(0,0,0,0.34)",
  padding: 24,
};

const sectionHeadingRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 18,
};

const sectionEyebrowStyle: CSSProperties = {
  color: "#a78bfa",
  fontSize: 11,
  fontWeight: 950,
  letterSpacing: "0.11em",
  textTransform: "uppercase",
};

const sectionTitleStyle: CSSProperties = {
  margin: "8px 0 0",
  color: "#fff",
  fontSize: "clamp(1.7rem, 4vw, 2.65rem)",
  lineHeight: 1.04,
  letterSpacing: "-0.045em",
};

const sectionTextStyle: CSSProperties = {
  maxWidth: 820,
  margin: "12px 0 0",
  color: "#cbd5e1",
  fontSize: 15,
  lineHeight: 1.7,
};

const sectionPillStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  minHeight: 34,
  padding: "7px 11px",
  borderRadius: 999,
  color: "#ddd6fe",
  background: "rgba(168,85,247,0.10)",
  border: "1px solid rgba(216,180,254,0.18)",
  fontSize: 11,
  fontWeight: 900,
  whiteSpace: "nowrap",
};

const eventInfoGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: 12,
  marginTop: 20,
};

const infoCardStyle: CSSProperties = {
  borderRadius: 18,
  border: "1px solid rgba(255,255,255,0.08)",
  background: "rgba(255,255,255,0.035)",
  padding: 16,
};

const infoLabelStyle: CSSProperties = {
  color: "#a78bfa",
  fontSize: 10.5,
  fontWeight: 950,
  letterSpacing: "0.1em",
};

const infoValueStyle: CSSProperties = {
  marginTop: 7,
  color: "#f8fafc",
  fontSize: 14,
  fontWeight: 850,
  lineHeight: 1.4,
};

const featureGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: 12,
  marginTop: 20,
};

const featureLinkStyle: CSSProperties = {
  textDecoration: "none",
  minHeight: 190,
  display: "flex",
  flexDirection: "column",
  borderRadius: 20,
  border: "1px solid rgba(255,255,255,0.08)",
  background:
    "linear-gradient(145deg, rgba(255,255,255,0.045), rgba(255,255,255,0.022))",
  padding: 18,
};

const featureEyebrowStyle: CSSProperties = {
  color: "#a78bfa",
  fontSize: 10.5,
  fontWeight: 950,
  letterSpacing: "0.1em",
};

const featureTitleStyle: CSSProperties = {
  margin: "10px 0 0",
  color: "#fff",
  fontSize: 20,
  lineHeight: 1.15,
  letterSpacing: "-0.035em",
};

const featureTextStyle: CSSProperties = {
  margin: "10px 0 0",
  color: "#cbd5e1",
  fontSize: 13.5,
  lineHeight: 1.6,
  flex: 1,
};

const comingSoonStyle: CSSProperties = {
  marginTop: 16,
  color: "#ddd6fe",
  fontSize: 11.5,
  fontWeight: 900,
};

const contentGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: 14,
  marginTop: 20,
};

const emptyStateStyle: CSSProperties = {
  borderRadius: 20,
  border: "1px dashed rgba(216,180,254,0.20)",
  background: "rgba(255,255,255,0.025)",
  padding: 24,
  display: "grid",
  placeItems: "center",
  alignContent: "center",
  textAlign: "center",
};

const emptyOrbStyle: CSSProperties = {
  width: 48,
  height: 48,
  borderRadius: 16,
  display: "grid",
  placeItems: "center",
  color: "#ede9fe",
  background:
    "linear-gradient(135deg, rgba(168,85,247,0.30), rgba(79,70,229,0.20))",
  border: "1px solid rgba(216,180,254,0.20)",
  fontSize: 11,
  fontWeight: 950,
  letterSpacing: "0.08em",
};

const emptyTitleStyle: CSSProperties = {
  color: "#fff",
  fontSize: 16,
  marginTop: 12,
};

const emptyTextStyle: CSSProperties = {
  maxWidth: 620,
  color: "#94a3b8",
  fontSize: 13.5,
  lineHeight: 1.6,
  marginTop: 7,
};

const investigationCardStyle: CSSProperties = {
  overflow: "hidden",
  borderRadius: 20,
  border: "1px solid rgba(255,255,255,0.08)",
  background: "rgba(255,255,255,0.032)",
};

const mediaPlaceholderStyle: CSSProperties = {
  width: "100%",
  aspectRatio: "16 / 9",
  overflow: "hidden",
  background: "#05070d",
};

const mediaImageStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
  display: "block",
};

const mediaFallbackStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  background:
    "radial-gradient(circle at 50% 25%, rgba(168,85,247,0.24), transparent 34%), linear-gradient(145deg, #080a16, #05060d)",
};

const mediaFallbackTopStyle: CSSProperties = {
  color: "#a78bfa",
  fontSize: 10,
  fontWeight: 950,
  letterSpacing: "0.1em",
};

const mediaFallbackTitleStyle: CSSProperties = {
  color: "#fff",
  fontSize: 18,
  letterSpacing: "-0.03em",
};

const investigationBodyStyle: CSSProperties = {
  padding: 16,
};

const statusBadgeStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  minHeight: 28,
  padding: "5px 9px",
  borderRadius: 999,
  fontSize: 10,
  fontWeight: 950,
  letterSpacing: "0.08em",
};

const liveBadgeStyle: CSSProperties = {
  color: "#dcfce7",
  background: "rgba(34,197,94,0.14)",
  border: "1px solid rgba(74,222,128,0.28)",
};

const replayBadgeStyle: CSSProperties = {
  color: "#e2e8f0",
  background: "rgba(148,163,184,0.12)",
  border: "1px solid rgba(148,163,184,0.22)",
};

const upcomingBadgeStyle: CSSProperties = {
  color: "#fef3c7",
  background: "rgba(245,158,11,0.12)",
  border: "1px solid rgba(251,191,36,0.22)",
};

const cardTitleStyle: CSSProperties = {
  margin: "11px 0 0",
  color: "#fff",
  fontSize: 18,
  lineHeight: 1.2,
  letterSpacing: "-0.03em",
};

const cardMetaStyle: CSSProperties = {
  marginTop: 6,
  color: "#cbd5e1",
  fontSize: 12.5,
  lineHeight: 1.45,
};

const cardDateStyle: CSSProperties = {
  marginTop: 9,
  color: "#a78bfa",
  fontSize: 12,
  fontWeight: 850,
};

const cardTextStyle: CSSProperties = {
  margin: "10px 0 0",
  color: "#aeb8c8",
  fontSize: 13.5,
  lineHeight: 1.6,
};

const smallActionStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: 36,
  marginTop: 14,
  padding: "8px 12px",
  borderRadius: 999,
  textDecoration: "none",
  color: "#fff",
  background:
    "linear-gradient(135deg, var(--parapost-accent, #a855f7), #7c3aed)",
  fontSize: 11.5,
  fontWeight: 950,
};

const smallMutedActionStyle: CSSProperties = {
  marginTop: 14,
  color: "#94a3b8",
  fontSize: 11.5,
  fontWeight: 800,
};

const scheduleListStyle: CSSProperties = {
  display: "grid",
  gap: 10,
  marginTop: 20,
};

const scheduleRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(160px, 0.42fr) minmax(0, 1fr) auto",
  gap: 14,
  alignItems: "center",
  borderRadius: 16,
  border: "1px solid rgba(255,255,255,0.07)",
  background: "rgba(255,255,255,0.028)",
  padding: 14,
};

const scheduleDateStyle: CSSProperties = {
  color: "#c4b5fd",
  fontSize: 12,
  fontWeight: 900,
};

const scheduleMainStyle: CSSProperties = {
  minWidth: 0,
  display: "grid",
  gap: 4,
};

const scheduleTitleStyle: CSSProperties = {
  color: "#fff",
  fontSize: 14,
};

const scheduleMetaStyle: CSSProperties = {
  color: "#94a3b8",
  fontSize: 12,
};

const scheduleStatusStyle: CSSProperties = {
  color: "#ddd6fe",
  fontSize: 10,
  fontWeight: 950,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
};

const twoColumnGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 16,
  marginTop: 20,
};

const subsectionTitleStyle: CSSProperties = {
  color: "#fff",
  fontSize: 15,
  fontWeight: 900,
};

const stackStyle: CSSProperties = {
  display: "grid",
  gap: 10,
  marginTop: 12,
};

const profileCardStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "54px minmax(0, 1fr)",
  gap: 12,
  alignItems: "start",
  borderRadius: 18,
  border: "1px solid rgba(255,255,255,0.07)",
  background: "rgba(255,255,255,0.03)",
  padding: 14,
};

const profileAvatarStyle: CSSProperties = {
  width: 54,
  height: 54,
  borderRadius: "50%",
  overflow: "hidden",
  display: "grid",
  placeItems: "center",
  color: "#fff",
  background:
    "linear-gradient(135deg, rgba(168,85,247,0.28), rgba(79,70,229,0.22))",
  border: "1px solid rgba(216,180,254,0.18)",
  fontSize: 12,
  fontWeight: 950,
};

const locationThumbStyle: CSSProperties = {
  ...profileAvatarStyle,
  borderRadius: 14,
};

const profileImageStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
  display: "block",
};

const profileTitleStyle: CSSProperties = {
  margin: 0,
  color: "#fff",
  fontSize: 15,
  lineHeight: 1.2,
};

const profileMetaStyle: CSSProperties = {
  marginTop: 5,
  color: "#a78bfa",
  fontSize: 11.5,
  fontWeight: 800,
};

const profileTextStyle: CSSProperties = {
  margin: "7px 0 0",
  color: "#94a3b8",
  fontSize: 12.5,
  lineHeight: 1.55,
};

const newsCardStyle: CSSProperties = {
  borderRadius: 20,
  border: "1px solid rgba(255,255,255,0.08)",
  background: "rgba(255,255,255,0.032)",
  padding: 17,
};

const newsDateStyle: CSSProperties = {
  color: "#a78bfa",
  fontSize: 10.5,
  fontWeight: 950,
  letterSpacing: "0.08em",
};

const sponsorCardStyle: CSSProperties = {
  borderRadius: 20,
  border: "1px solid rgba(255,255,255,0.08)",
  background: "rgba(255,255,255,0.032)",
  padding: 18,
  textAlign: "center",
};

const sponsorLogoStyle: CSSProperties = {
  width: 72,
  height: 72,
  margin: "0 auto",
  borderRadius: 18,
  overflow: "hidden",
  display: "grid",
  placeItems: "center",
  color: "#ede9fe",
  background:
    "linear-gradient(135deg, rgba(168,85,247,0.18), rgba(79,70,229,0.14))",
  border: "1px solid rgba(216,180,254,0.14)",
  fontSize: 15,
  fontWeight: 950,
};

const sponsorImageStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  objectFit: "contain",
  display: "block",
  padding: 8,
};

const registrationCardStyle: CSSProperties = {
  position: "relative",
  overflow: "hidden",
  borderRadius: 26,
  border: "1px solid rgba(216,180,254,0.16)",
  background:
    "linear-gradient(145deg, rgba(24,18,46,0.96), rgba(8,10,22,0.95))",
  boxShadow: "0 24px 80px rgba(0,0,0,0.36)",
  padding: 24,
};

const registrationGlowStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  background:
    "radial-gradient(circle at 85% 15%, rgba(168,85,247,0.20), transparent 30%)",
  pointerEvents: "none",
};

const registrationContentStyle: CSSProperties = {
  position: "relative",
  zIndex: 1,
};

const registrationNoticeStyle: CSSProperties = {
  marginTop: 18,
  borderRadius: 16,
  border: "1px solid rgba(216,180,254,0.16)",
  background: "rgba(255,255,255,0.035)",
  padding: 14,
  color: "#cbd5e1",
  fontSize: 12.5,
  lineHeight: 1.6,
};

const futureCardStyle: CSSProperties = {
  borderRadius: 28,
  border: "1px solid rgba(216,180,254,0.18)",
  background:
    "radial-gradient(circle at 90% 5%, rgba(168,85,247,0.18), transparent 30%), linear-gradient(145deg, rgba(13,14,31,0.97), rgba(7,9,21,0.97))",
  boxShadow: "0 26px 90px rgba(0,0,0,0.42)",
  padding: 24,
};

const futureBadgeStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  minHeight: 32,
  padding: "6px 10px",
  borderRadius: 999,
  color: "#ddd6fe",
  background: "rgba(168,85,247,0.12)",
  border: "1px solid rgba(216,180,254,0.18)",
  fontSize: 10.5,
  fontWeight: 950,
  letterSpacing: "0.1em",
};

const futureTitleStyle: CSSProperties = {
  margin: "13px 0 0",
  color: "#fff",
  fontSize: "clamp(1.8rem, 4vw, 3rem)",
  lineHeight: 1.04,
  letterSpacing: "-0.05em",
};

const futureTextStyle: CSSProperties = {
  maxWidth: 820,
  margin: "12px 0 0",
  color: "#cbd5e1",
  fontSize: 15,
  lineHeight: 1.7,
};

const statGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: 12,
  marginTop: 20,
};

const statCardStyle: CSSProperties = {
  borderRadius: 18,
  border: "1px solid rgba(255,255,255,0.07)",
  background: "rgba(255,255,255,0.03)",
  padding: 15,
};

const statLabelStyle: CSSProperties = {
  color: "#a78bfa",
  fontSize: 10,
  fontWeight: 950,
  letterSpacing: "0.1em",
};

const statValueStyle: CSSProperties = {
  marginTop: 6,
  color: "#fff",
  fontSize: 13.5,
  fontWeight: 850,
};

const poweredByStyle: CSSProperties = {
  marginTop: 22,
  color: "#aeb8c8",
  fontSize: 11.5,
  fontWeight: 800,
  letterSpacing: "0.07em",
};
