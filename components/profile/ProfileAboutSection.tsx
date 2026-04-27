"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type AboutTab =
  | "intro"
  | "category"
  | "personal"
  | "links"
  | "work"
  | "education"
  | "interests"
  | "contact";

type ProfileLink = {
  id?: string;
  label?: string;
  title?: string;
  url?: string;
};

type SavedAboutPayload = {
  about_intro: string;
  category: string;
  location: string;
  hometown: string;
  relationship_status: string;
  occupation: string;
  company: string;
  education: string;
  website: string;
  email: string;
  phone: string;
  interests: string[];
  profile_links: ProfileLink[];
};

type ProfileAboutData = {
  id?: string;
  full_name?: string | null;
  username?: string | null;
  bio?: string | null;
  about?: string | null;
  about_intro?: string | null;

  category?: string | null;
  profile_category?: string | null;

  location?: string | null;
  hometown?: string | null;
  relationship_status?: string | null;

  occupation?: string | null;
  company?: string | null;
  workplace?: string | null;
  work?: string | null;

  school?: string | null;
  education?: string | null;

  email?: string | null;
  phone?: string | null;
  website?: string | null;

  interests?: string[] | string | null;
  profile_links?: ProfileLink[] | string | null;
  links?: ProfileLink[] | string | null;
};

type ProfileAboutSectionProps = {
  profile?: ProfileAboutData | null;
  isOwnProfile?: boolean;
  isEditing?: boolean;
  saving?: boolean;
  onSave?: (payload: SavedAboutPayload) => Promise<void> | void;
};

const MAX_LINKS = 10;

const tabs: { id: AboutTab; label: string; icon: string }[] = [
  { id: "intro", label: "Intro", icon: "👤" },
  { id: "category", label: "Category", icon: "🏷️" },
  { id: "personal", label: "Personal details", icon: "📍" },
  { id: "links", label: "Links", icon: "🔗" },
  { id: "work", label: "Work", icon: "💼" },
  { id: "education", label: "Education", icon: "🎓" },
  { id: "interests", label: "Interests", icon: "⭐" },
  { id: "contact", label: "Contact info", icon: "☎️" },
];

function getStorageKey(profile?: ProfileAboutData | null) {
  const stableId =
    profile?.id ||
    profile?.username ||
    profile?.full_name ||
    "current-profile";

  return `parapost-profile-about:${stableId}`;
}

function normalizeUrl(value: string) {
  const clean = value.trim();
  if (!clean) return "";
  if (clean.startsWith("http://") || clean.startsWith("https://")) return clean;
  return `https://${clean}`;
}

function getHostname(value: string) {
  try {
    return new URL(normalizeUrl(value)).hostname.replace(/^www\./, "");
  } catch {
    return value;
  }
}

function safeParseLinks(value: ProfileAboutData["profile_links"]): ProfileLink[] {
  if (!value) return [];

  if (Array.isArray(value)) {
    return value
      .filter((item) => item && typeof item === "object")
      .map((item, index) => ({
        id: item.id || `link-${index}`,
        label: item.label || item.title || getHostname(item.url || ""),
        url: item.url || "",
      }))
      .filter((item) => item.url)
      .slice(0, MAX_LINKS);
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return safeParseLinks(parsed);
    } catch {
      return value
        .split("\n")
        .map((url, index) => ({
          id: `link-${index}`,
          label: getHostname(url),
          url,
        }))
        .filter((item) => item.url.trim())
        .slice(0, MAX_LINKS);
    }
  }

  return [];
}

function safeParseInterests(value: ProfileAboutData["interests"]): string[] {
  if (!value) return [];

  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean).slice(0, 20);
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return safeParseInterests(parsed);
    } catch {
      return value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 20);
    }
  }

  return [];
}

function getSavedLocalPayload(profile?: ProfileAboutData | null): Partial<SavedAboutPayload> {
  if (typeof window === "undefined") return {};

  try {
    const raw = window.localStorage.getItem(getStorageKey(profile));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as Partial<SavedAboutPayload>;
  } catch {
    return {};
  }
}

function saveLocalPayload(profile: ProfileAboutData | null | undefined, payload: SavedAboutPayload) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(getStorageKey(profile), JSON.stringify(payload));
  } catch {
    // If localStorage is blocked, the onSave path can still save.
  }
}

function buildInitialPayload(
  profile?: ProfileAboutData | null,
  initialInterests: string[] = [],
  initialLinks: ProfileLink[] = []
): SavedAboutPayload {
  const local = getSavedLocalPayload(profile);

  return {
    about_intro:
      local.about_intro ??
      profile?.about_intro ??
      profile?.about ??
      profile?.bio ??
      "",
    category:
      local.category ??
      profile?.category ??
      profile?.profile_category ??
      "",
    location:
      local.location ??
      profile?.location ??
      "",
    hometown:
      local.hometown ??
      profile?.hometown ??
      "",
    relationship_status:
      local.relationship_status ??
      profile?.relationship_status ??
      "",
    occupation:
      local.occupation ??
      profile?.occupation ??
      profile?.work ??
      "",
    company:
      local.company ??
      profile?.company ??
      profile?.workplace ??
      "",
    education:
      local.education ??
      profile?.education ??
      profile?.school ??
      "",
    website:
      local.website ??
      profile?.website ??
      "",
    email:
      local.email ??
      profile?.email ??
      "",
    phone:
      local.phone ??
      profile?.phone ??
      "",
    interests:
      Array.isArray(local.interests) && local.interests.length > 0
        ? local.interests
        : initialInterests,
    profile_links:
      Array.isArray(local.profile_links) && local.profile_links.length > 0
        ? local.profile_links
        : initialLinks,
  };
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.025] px-4 py-6 text-sm font-medium text-slate-500">
      {text}
    </div>
  );
}

function DetailLine({
  icon,
  label,
  value,
}: {
  icon: string;
  label: string;
  value?: string | null;
}) {
  if (!value?.trim()) return null;

  return (
    <div className="flex items-start gap-3 rounded-2xl px-1 py-2">
      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/[0.06] text-base">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
          {label}
        </p>
        <p className="mt-0.5 break-words text-[15px] font-semibold leading-6 text-slate-200">
          {value}
        </p>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
        {label}
      </span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm font-medium text-white outline-none transition placeholder:text-slate-600 focus:border-blue-400/70 focus:ring-4 focus:ring-blue-400/10"
      />
    </label>
  );
}

export default function ProfileAboutSection({
  profile,
  isOwnProfile = false,
  isEditing = false,
  saving = false,
  onSave,
}: ProfileAboutSectionProps) {
  const initialLinks = useMemo(
    () => safeParseLinks(profile?.profile_links || profile?.links || null),
    [profile?.profile_links, profile?.links]
  );

  const initialInterests = useMemo(
    () => safeParseInterests(profile?.interests || null),
    [profile?.interests]
  );

  const initialPayload = useMemo(
    () => buildInitialPayload(profile, initialInterests, initialLinks),
    [profile, initialInterests, initialLinks]
  );

  const [activeTab, setActiveTab] = useState<AboutTab>("intro");
  const [editing, setEditing] = useState(isEditing);
  const [localSaving, setLocalSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");

  const [aboutIntro, setAboutIntro] = useState(initialPayload.about_intro);
  const [category, setCategory] = useState(initialPayload.category);
  const [location, setLocation] = useState(initialPayload.location);
  const [hometown, setHometown] = useState(initialPayload.hometown);
  const [relationshipStatus, setRelationshipStatus] = useState(
    initialPayload.relationship_status
  );
  const [occupation, setOccupation] = useState(initialPayload.occupation);
  const [company, setCompany] = useState(initialPayload.company);
  const [education, setEducation] = useState(initialPayload.education);
  const [website, setWebsite] = useState(initialPayload.website);
  const [email, setEmail] = useState(initialPayload.email);
  const [phone, setPhone] = useState(initialPayload.phone);
  const [interestsText, setInterestsText] = useState(initialPayload.interests.join(", "));
  const [links, setLinks] = useState<ProfileLink[]>(initialPayload.profile_links);

  useEffect(() => {
    setAboutIntro(initialPayload.about_intro);
    setCategory(initialPayload.category);
    setLocation(initialPayload.location);
    setHometown(initialPayload.hometown);
    setRelationshipStatus(initialPayload.relationship_status);
    setOccupation(initialPayload.occupation);
    setCompany(initialPayload.company);
    setEducation(initialPayload.education);
    setWebsite(initialPayload.website);
    setEmail(initialPayload.email);
    setPhone(initialPayload.phone);
    setInterestsText(initialPayload.interests.join(", "));
    setLinks(initialPayload.profile_links);
  }, [initialPayload]);

  const interests = useMemo(
    () =>
      interestsText
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 20),
    [interestsText]
  );

  const displayLinks = links
    .filter((link) => link.url?.trim())
    .slice(0, MAX_LINKS);

  function updateLink(index: number, key: "label" | "url", value: string) {
    setLinks((current) =>
      current.map((link, itemIndex) =>
        itemIndex === index ? { ...link, [key]: value } : link
      )
    );
  }

  function addLink() {
    if (links.length >= MAX_LINKS) return;

    setLinks((current) => [
      ...current,
      {
        id: `link-${Date.now()}`,
        label: "",
        url: "",
      },
    ]);
  }

  function removeLink(index: number) {
    setLinks((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }

  function buildPayload(): SavedAboutPayload {
    const cleanedLinks = links
      .map((link, index) => {
        const url = normalizeUrl(link.url || "");
        return {
          id: link.id || `link-${index}`,
          label: (link.label || getHostname(url)).trim(),
          url,
        };
      })
      .filter((link) => link.url)
      .slice(0, MAX_LINKS);

    return {
      about_intro: aboutIntro.trim(),
      category: category.trim(),
      location: location.trim(),
      hometown: hometown.trim(),
      relationship_status: relationshipStatus.trim(),
      occupation: occupation.trim(),
      company: company.trim(),
      education: education.trim(),
      website: website.trim(),
      email: email.trim(),
      phone: phone.trim(),
      interests,
      profile_links: cleanedLinks,
    };
  }

  async function handleSave() {
    const payload = buildPayload();

    setLocalSaving(true);
    setSaveMessage("");

    try {
      saveLocalPayload(profile, payload);
      await onSave?.(payload);

      setLinks(payload.profile_links);
      setAboutIntro(payload.about_intro);
      setCategory(payload.category);
      setLocation(payload.location);
      setHometown(payload.hometown);
      setRelationshipStatus(payload.relationship_status);
      setOccupation(payload.occupation);
      setCompany(payload.company);
      setEducation(payload.education);
      setWebsite(payload.website);
      setEmail(payload.email);
      setPhone(payload.phone);
      setInterestsText(payload.interests.join(", "));

      setEditing(false);
      setSaveMessage("Saved");
      window.setTimeout(() => setSaveMessage(""), 2200);
    } catch (error) {
      saveLocalPayload(profile, payload);
      setSaveMessage("Saved locally. Database save needs wiring on the profile page.");
      setEditing(false);
    } finally {
      setLocalSaving(false);
    }
  }

  function renderContent() {
    if (activeTab === "intro") {
      return (
        <div>
          <h3 className="text-lg font-semibold text-white tracking-tight">Bio</h3>

          {editing ? (
            <textarea
              value={aboutIntro}
              onChange={(event) => setAboutIntro(event.target.value)}
              rows={6}
              maxLength={1200}
              placeholder="Write a short profile intro..."
              className="mt-5 min-h-[180px] w-full resize-none rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-[15px] leading-7 text-white outline-none transition placeholder:text-slate-600 focus:border-blue-400/70 focus:ring-4 focus:ring-blue-400/10"
            />
          ) : aboutIntro.trim() ? (
            <p className="mt-5 whitespace-pre-line text-[15px] font-semibold leading-7 text-slate-200">
              {aboutIntro}
            </p>
          ) : (
            <EmptyState text="No bio has been added yet." />
          )}

          <div className="mt-8">
            <h4 className="text-base font-semibold text-white tracking-tight">Pinned details</h4>
            <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-3 text-sm font-semibold text-slate-300">
              {occupation ? <span>💼 {occupation}</span> : null}
              {location ? <span>📍 {location}</span> : null}
              {company ? <span>🏢 {company}</span> : null}
              {!occupation && !location && !company ? (
                <span className="text-slate-500">No pinned details yet.</span>
              ) : null}
            </div>
          </div>
        </div>
      );
    }

    if (activeTab === "category") {
      return (
        <div>
          <h3 className="text-lg font-semibold text-white tracking-tight">Category</h3>

          {editing ? (
            <div className="mt-5">
              <Field
                label="Profile category"
                value={category}
                onChange={setCategory}
                placeholder="Content creator, paranormal researcher, actor..."
              />
            </div>
          ) : category.trim() ? (
            <div className="mt-5">
              <DetailLine icon="🏷️" label="Category" value={category} />
            </div>
          ) : (
            <EmptyState text="No category has been added yet." />
          )}
        </div>
      );
    }

    if (activeTab === "personal") {
      return (
        <div>
          <h3 className="text-lg font-semibold text-white tracking-tight">Personal details</h3>

          {editing ? (
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <Field label="Lives in" value={location} onChange={setLocation} placeholder="Toronto, Ontario" />
              <Field label="Hometown" value={hometown} onChange={setHometown} placeholder="Your hometown" />
              <Field label="Relationship status" value={relationshipStatus} onChange={setRelationshipStatus} placeholder="Optional" />
            </div>
          ) : location || hometown || relationshipStatus ? (
            <div className="mt-5 grid gap-3">
              <DetailLine icon="📍" label="Lives in" value={location} />
              <DetailLine icon="🏠" label="From" value={hometown} />
              <DetailLine icon="💬" label="Status" value={relationshipStatus} />
            </div>
          ) : (
            <EmptyState text="No personal details have been added yet." />
          )}
        </div>
      );
    }

    if (activeTab === "links") {
      return (
        <div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-white tracking-tight">Links</h3>
              <p className="mt-1 text-sm text-slate-500">
                Add up to {MAX_LINKS} social media or website links.
              </p>
            </div>

            {editing ? (
              <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-slate-300">
                {links.length}/{MAX_LINKS}
              </span>
            ) : null}
          </div>

          {editing ? (
            <div className="mt-5 space-y-3">
              {links.map((link, index) => (
                <div key={link.id || index} className="rounded-2xl border border-white/10 bg-slate-950/60 p-3">
                  <div className="grid gap-2 md:grid-cols-[0.8fr_1.2fr]">
                    <input
                      value={link.label || ""}
                      onChange={(event) => updateLink(index, "label", event.target.value)}
                      placeholder="Instagram, YouTube, Website..."
                      className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-600 focus:border-blue-400/70"
                    />
                    <input
                      value={link.url || ""}
                      onChange={(event) => updateLink(index, "url", event.target.value)}
                      placeholder="https://example.com"
                      className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-600 focus:border-blue-400/70"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => removeLink(index)}
                    className="mt-2 text-xs font-bold text-rose-300 transition hover:text-rose-200"
                  >
                    Remove
                  </button>
                </div>
              ))}

              {links.length < MAX_LINKS ? (
                <button
                  type="button"
                  onClick={addLink}
                  className="w-full rounded-2xl border border-dashed border-blue-400/40 bg-blue-500/10 px-4 py-3 text-sm font-bold text-blue-200 transition hover:border-blue-300 hover:bg-blue-500/15"
                >
                  Add Link
                </button>
              ) : null}
            </div>
          ) : displayLinks.length > 0 ? (
            <div className="mt-5 grid gap-3">
              {displayLinks.map((link, index) => (
                <Link
                  key={link.id || `${link.url}-${index}`}
                  href={normalizeUrl(link.url || "")}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 transition hover:border-blue-400/50 hover:bg-blue-500/10"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-bold text-slate-100">
                      {link.label || getHostname(link.url || "")}
                    </span>
                    <span className="block truncate text-xs font-medium text-slate-500 group-hover:text-blue-200">
                      {getHostname(link.url || "")}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs font-black text-blue-300">
                    Open
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState text="No links have been added yet." />
          )}
        </div>
      );
    }

    if (activeTab === "work") {
      return (
        <div>
          <h3 className="text-lg font-semibold text-white tracking-tight">Work</h3>

          {editing ? (
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <Field label="Occupation" value={occupation} onChange={setOccupation} placeholder="Actor, creator, researcher..." />
              <Field label="Company / organization" value={company} onChange={setCompany} placeholder="Parapost Network Central" />
            </div>
          ) : occupation || company ? (
            <div className="mt-5 grid gap-3">
              <DetailLine icon="💼" label="Occupation" value={occupation} />
              <DetailLine icon="🏢" label="Company" value={company} />
            </div>
          ) : (
            <EmptyState text="No work details have been added yet." />
          )}
        </div>
      );
    }

    if (activeTab === "education") {
      return (
        <div>
          <h3 className="text-lg font-semibold text-white tracking-tight">Education</h3>

          {editing ? (
            <div className="mt-5">
              <Field label="Education" value={education} onChange={setEducation} placeholder="School, training, certifications..." />
            </div>
          ) : education.trim() ? (
            <div className="mt-5">
              <DetailLine icon="🎓" label="Education" value={education} />
            </div>
          ) : (
            <EmptyState text="No education details have been added yet." />
          )}
        </div>
      );
    }

    if (activeTab === "interests") {
      return (
        <div>
          <h3 className="text-lg font-semibold text-white tracking-tight">Interests</h3>

          {editing ? (
            <div className="mt-5">
              <label className="block">
                <span className="mb-2 block text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
                  Interests
                </span>
                <input
                  value={interestsText}
                  onChange={(event) => setInterestsText(event.target.value)}
                  placeholder="Paranormal, investigations, filmmaking..."
                  className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm font-medium text-white outline-none placeholder:text-slate-600 focus:border-blue-400/70 focus:ring-4 focus:ring-blue-400/10"
                />
              </label>
              <p className="mt-2 text-xs text-slate-500">Separate each interest with a comma.</p>
            </div>
          ) : interests.length > 0 ? (
            <div className="mt-5 flex flex-wrap gap-2">
              {interests.map((interest) => (
                <span key={interest} className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 text-xs font-bold text-slate-200">
                  {interest}
                </span>
              ))}
            </div>
          ) : (
            <EmptyState text="No interests have been added yet." />
          )}
        </div>
      );
    }

    return (
      <div>
        <h3 className="text-lg font-semibold text-white tracking-tight">Contact info</h3>

        {editing ? (
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <Field label="Website" value={website} onChange={setWebsite} placeholder="https://yourwebsite.com" />
            <Field label="Email" value={email} onChange={setEmail} placeholder="name@email.com" />
            <Field label="Phone" value={phone} onChange={setPhone} placeholder="Optional" />
          </div>
        ) : website || email || phone ? (
          <div className="mt-5 grid gap-3">
            {website ? (
              <Link
                href={normalizeUrl(website)}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm font-bold text-blue-300 transition hover:border-blue-400/50 hover:bg-blue-500/10"
              >
                🌐 {getHostname(website)}
              </Link>
            ) : null}
            <DetailLine icon="✉️" label="Email" value={email} />
            <DetailLine icon="☎️" label="Phone" value={phone} />
          </div>
        ) : (
          <EmptyState text="No contact info has been added yet." />
        )}
      </div>
    );
  }

  const isSavingNow = saving || localSaving;

  return (
    <section className="w-full">
      <div className="overflow-hidden rounded-[18px] border border-white/10 bg-[#202223] shadow-2xl shadow-black/20">
        <div className="grid min-h-[560px] lg:grid-cols-[288px_1fr]">
          <aside className="border-b border-white/10 bg-[#202223] p-4 lg:border-b-0 lg:border-r">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-xl font-black tracking-tight text-slate-100">
                About
              </h2>

              {isOwnProfile ? (
                <button
                  type="button"
                  onClick={() => {
                    setSaveMessage("");
                    setEditing((value) => !value);
                  }}
                  className="rounded-xl bg-white/10 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-white/15 transition"
                >
                  {editing ? "Close" : "Edit"}
                </button>
              ) : null}
            </div>

            <select
              value={activeTab}
              onChange={(event) => setActiveTab(event.target.value as AboutTab)}
              className="mb-4 w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-3 text-sm font-bold text-white outline-none focus:border-blue-400/70 lg:hidden"
            >
              {tabs.map((tab) => (
                <option key={tab.id} value={tab.id}>
                  {tab.icon} {tab.label}
                </option>
              ))}
            </select>

            <nav className="hidden space-y-1 lg:block">
              {tabs.map((tab) => {
                const active = activeTab === tab.id;

                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={[
                      "w-full rounded-md px-4 py-3 text-left text-sm font-bold transition",
                      active
                        ? "bg-blue-500/30 text-blue-200 border-l-2 border-blue-400 pl-3"
                        : "text-slate-400 hover:bg-white/[0.06] hover:text-white",
                    ].join(" ")}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-base">{tab.icon}</span>
                      <span>{tab.label}</span>
                    </div>
                  </button>
                );
              })}
            </nav>
          </aside>

          <main className="bg-[#202223] p-4 md:p-6">
            <div className="min-h-[420px]">{renderContent()}</div>

            {saveMessage ? (
              <p className="mt-5 rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm font-bold text-emerald-200">
                {saveMessage}
              </p>
            ) : null}

            {editing ? (
              <div className="mt-8 flex flex-col gap-3 border-t border-white/10 pt-5 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setSaveMessage("");
                    setEditing(false);
                  }}
                  className="rounded-xl border border-white/10 px-5 py-2.5 text-sm font-bold text-slate-300 transition hover:bg-white/10"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={isSavingNow}
                  className="rounded-xl bg-blue-500 px-5 py-2.5 text-sm font-black text-white transition hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSavingNow ? "Saving..." : "Save Changes"}
                </button>
              </div>
            ) : null}
          </main>
        </div>
      </div>
    </section>
  );
}
