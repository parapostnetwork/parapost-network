export type HuntStatus = "upcoming" | "live" | "ended";

export type GhostHuntEvent = {
  year: number;
  name: string;
  startDate: string;
  endDate: string;
  tagline: string;
  description: string;
};

export type HubFeature = {
  eyebrow: string;
  title: string;
  description: string;
  href: string;
};

export type HuntTeam = {
  id: string;
  name: string;
  country: string;
  region?: string;
  logoUrl?: string;
  description?: string;
};

export type HuntLocation = {
  id: string;
  name: string;
  city?: string;
  region?: string;
  country: string;
  imageUrl?: string;
  description?: string;
};

export type Investigation = {
  id: string;
  eventYear: number;
  title: string;
  teamId: string;
  locationId: string;
  scheduledAt: string;
  status: HuntStatus;
  thumbnailUrl?: string;
  streamUrl?: string;
  replayUrl?: string;
  description?: string;
};

export type Sponsor = {
  id: string;
  name: string;
  website?: string;
  logoUrl?: string;
};

export type GhostHuntNewsItem = {
  id: string;
  title: string;
  publishedAt: string;
  summary: string;
  imageUrl?: string;
};

export const ghostHunt2026: GhostHuntEvent = {
  year: 2026,
  name: "Global Ghost Hunt 2026",
  startDate: "2026-09-24",
  endDate: "2026-10-04",
  tagline: "Investigate • Capture • Share",
  description:
    "Paranormal teams around the world come together for a worldwide series of investigations from September 24 through October 4, 2026.",
};

export const hubFeatures: HubFeature[] = [
  {
    eyebrow: "WATCH",
    title: "Live Now",
    description:
      "See which Global Ghost Hunt investigations are currently broadcasting.",
    href: "#live-now",
  },
  {
    eyebrow: "NEXT",
    title: "Upcoming Investigations",
    description:
      "Discover which teams and haunted locations are coming up next.",
    href: "#upcoming",
  },
  {
    eyebrow: "PLAN",
    title: "Event Schedule",
    description:
      "Explore the worldwide Global Ghost Hunt schedule in one place.",
    href: "#schedule",
  },
  {
    eyebrow: "DISCOVER",
    title: "Teams & Locations",
    description:
      "Meet participating paranormal teams and explore their investigation locations.",
    href: "#teams-locations",
  },
  {
    eyebrow: "WATCH AGAIN",
    title: "Replays",
    description:
      "Return to completed investigations and watch available replays.",
    href: "#replays",
  },
  {
    eyebrow: "COMMUNITY",
    title: "News & Updates",
    description:
      "Follow Global Ghost Hunt announcements, event news, and important updates.",
    href: "#news",
  },
];

export const teams: HuntTeam[] = [];

export const locations: HuntLocation[] = [];

export const investigations: Investigation[] = [];

export const sponsors: Sponsor[] = [];

export const newsItems: GhostHuntNewsItem[] = [];