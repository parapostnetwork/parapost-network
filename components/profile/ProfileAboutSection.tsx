"use client";

import { CSSProperties, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type SocialLink = {
  id: string;
  label: string;
  url: string;
};

type ProfileAboutSectionProps = {
  profile: any;
  isOwnProfile: boolean;
  onUpdate: () => void | Promise<void>;
};

const LINK_PRESETS = [
  "Facebook",
  "Instagram",
  "TikTok",
  "YouTube",
  "X",
  "Threads",
  "Website",
  "Podcast",
  "Paraflix",
  "Other",
];

function makeId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeLinks(value: unknown): SocialLink[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item: any) => ({
      id: String(item?.id || makeId()),
      label: String(item?.label || "Website"),
      url: String(item?.url || ""),
    }))
    .filter((item) => item.label || item.url);
}

function cleanExternalUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";

  if (
    trimmed.toLowerCase().startsWith("javascript:") ||
    trimmed.toLowerCase().startsWith("data:") ||
    trimmed.toLowerCase().startsWith("vbscript:")
  ) {
    return "";
  }

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }

  return `https://${trimmed}`;
}

export default function ProfileAboutSection({
  profile,
  isOwnProfile,
  onUpdate,
}: ProfileAboutSectionProps) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const initialLinks = useMemo(
    () => normalizeLinks(profile?.social_links),
    [profile?.social_links]
  );

  const [form, setForm] = useState({
    bio: profile?.bio || "",
    location: profile?.location || "",
    website: profile?.website || "",
    occupation: profile?.occupation || "",
    paranormal_focus: profile?.paranormal_focus || "",
    experience_years: profile?.experience_years || "",
    equipment: profile?.equipment || "",
    favorite_locations: profile?.favorite_locations || "",
    availability: profile?.availability || "",
    social_links: initialLinks,
  });

  useEffect(() => {
    setForm({
      bio: profile?.bio || "",
      location: profile?.location || "",
      website: profile?.website || "",
      occupation: profile?.occupation || "",
      paranormal_focus: profile?.paranormal_focus || "",
      experience_years: profile?.experience_years || "",
      equipment: profile?.equipment || "",
      favorite_locations: profile?.favorite_locations || "",
      availability: profile?.availability || "",
      social_links: normalizeLinks(profile?.social_links),
    });
  }, [profile]);

  const updateField = (key: keyof typeof form, value: any) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const addSocialLink = () => {
    setForm((prev) => ({
      ...prev,
      social_links: [
        ...prev.social_links,
        {
          id: makeId(),
          label: "Website",
          url: "",
        },
      ],
    }));
  };

  const updateSocialLink = (
    id: string,
    key: keyof SocialLink,
    value: string
  ) => {
    setForm((prev) => ({
      ...prev,
      social_links: prev.social_links.map((link) =>
        link.id === id ? { ...link, [key]: value } : link
      ),
    }));
  };

  const removeSocialLink = (id: string) => {
    setForm((prev) => ({
      ...prev,
      social_links: prev.social_links.filter((link) => link.id !== id),
    }));
  };

  const saveAbout = async () => {
    if (!profile?.id || !isOwnProfile) return;

    setSaving(true);

    const socialLinks = form.social_links
      .map((link) => ({
        id: link.id,
        label: link.label.trim() || "Website",
        url: cleanExternalUrl(link.url),
      }))
      .filter((link) => link.url);

    const { error } = await supabase
      .from("profiles")
      .update({
        bio: form.bio.trim(),
        location: form.location.trim(),
        website: form.website.trim(),
        occupation: form.occupation.trim(),
        paranormal_focus: form.paranormal_focus.trim(),
        experience_years: form.experience_years.trim(),
        equipment: form.equipment.trim(),
        favorite_locations: form.favorite_locations.trim(),
        availability: form.availability.trim(),
        social_links: socialLinks,
      })
      .eq("id", profile.id);

    setSaving(false);

    if (error) {
      alert(`About save error: ${error.message}`);
      return;
    }

    setEditing(false);
    await onUpdate();
  };

  const textField = (
    label: string,
    key: keyof typeof form,
    placeholder: string,
    multiline = false
  ) => (
    <div style={fieldWrapStyle}>
      <div style={fieldLabelStyle}>{label}</div>

      {editing ? (
        multiline ? (
          <textarea
            value={String(form[key] || "")}
            onChange={(event) => updateField(key, event.target.value)}
            placeholder={placeholder}
            rows={4}
            style={textAreaStyle}
          />
        ) : (
          <input
            value={String(form[key] || "")}
            onChange={(event) => updateField(key, event.target.value)}
            placeholder={placeholder}
            style={inputStyle}
          />
        )
      ) : (
        <div style={fieldValueStyle}>{String(form[key] || "Not added yet")}</div>
      )}
    </div>
  );

  return (
    <div style={aboutShellStyle}>
      <div style={aboutHeaderStyle}>
        <div>
          <div style={eyebrowStyle}>Profile About</div>
          <h3 style={titleStyle}>About</h3>
          <p style={subtitleStyle}>
            Share who you are, what you investigate, where people can find you,
            and your paranormal background.
          </p>
        </div>

        {isOwnProfile ? (
          <div style={buttonRowStyle}>
            {editing ? (
              <>
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  disabled={saving}
                  style={secondaryButtonStyle}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={saveAbout}
                  disabled={saving}
                  style={primaryButtonStyle}
                >
                  {saving ? "Saving..." : "Save About"}
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setEditing(true)}
                style={primaryButtonStyle}
              >
                Edit About
              </button>
            )}
          </div>
        ) : null}
      </div>

      <div style={sectionGridStyle}>
        <section style={sectionCardStyle}>
          <div style={sectionHeaderStyle}>
            <span style={sectionIconStyle}>👤</span>
            <div>
              <h4 style={sectionTitleStyle}>Intro</h4>
              <p style={sectionSubtitleStyle}>Basic profile information.</p>
            </div>
          </div>

          {textField("Bio / Story", "bio", "Tell people about yourself...", true)}
          {textField("Location", "location", "Toronto, Ontario")}
          {textField("Occupation / Role", "occupation", "Paranormal investigator, medium, creator...")}
        </section>

        <section style={sectionCardStyle}>
          <div style={sectionHeaderStyle}>
            <span style={sectionIconStyle}>👻</span>
            <div>
              <h4 style={sectionTitleStyle}>Paranormal Profile</h4>
              <p style={sectionSubtitleStyle}>Your paranormal interests and background.</p>
            </div>
          </div>

          {textField("Paranormal Focus", "paranormal_focus", "Ghost hunting, mediumship, UFOs, cryptids...", true)}
          {textField("Experience", "experience_years", "12 years, beginner, professional...")}
          {textField("Equipment", "equipment", "Spirit box, REM pod, cameras, recorders...", true)}
        </section>

        <section style={sectionCardStyle}>
          <div style={sectionHeaderStyle}>
            <span style={sectionIconStyle}>🏚️</span>
            <div>
              <h4 style={sectionTitleStyle}>Investigation Details</h4>
              <p style={sectionSubtitleStyle}>Places, availability, and investigation style.</p>
            </div>
          </div>

          {textField("Favorite Locations", "favorite_locations", "Haunted locations, asylums, historic sites...", true)}
          {textField("Availability", "availability", "Available for investigations, collabs, interviews...")}
        </section>

        <section style={sectionCardStyle}>
          <div style={sectionHeaderStyle}>
            <span style={sectionIconStyle}>🔗</span>
            <div>
              <h4 style={sectionTitleStyle}>Links & Socials</h4>
              <p style={sectionSubtitleStyle}>
                Add Facebook, Instagram, TikTok, websites, podcasts, and more.
              </p>
            </div>
          </div>

          {editing ? (
            <div style={{ display: "grid", gap: "12px" }}>
              {form.social_links.length === 0 ? (
                <div style={emptyBoxStyle}>No links added yet.</div>
              ) : null}

              {form.social_links.map((link) => (
                <div key={link.id} style={linkEditorRowStyle}>
                  <select
                    value={link.label}
                    onChange={(event) =>
                      updateSocialLink(link.id, "label", event.target.value)
                    }
                    style={selectStyle}
                  >
                    {LINK_PRESETS.map((preset) => (
                      <option key={preset} value={preset}>
                        {preset}
                      </option>
                    ))}
                  </select>

                  <input
                    value={link.url}
                    onChange={(event) =>
                      updateSocialLink(link.id, "url", event.target.value)
                    }
                    placeholder="https://..."
                    style={inputStyle}
                  />

                  <button
                    type="button"
                    onClick={() => removeSocialLink(link.id)}
                    style={dangerButtonStyle}
                  >
                    Remove
                  </button>
                </div>
              ))}

              <button type="button" onClick={addSocialLink} style={addLinkButtonStyle}>
                + Add another link
              </button>
            </div>
          ) : form.social_links.length > 0 ? (
            <div style={linkButtonGridStyle}>
              {form.social_links.map((link) => {
                const safeUrl = cleanExternalUrl(link.url);
                if (!safeUrl) return null;

                return (
                  <a
                    key={link.id}
                    href={safeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={socialButtonStyle}
                  >
                    {link.label}
                  </a>
                );
              })}
            </div>
          ) : (
            <div style={emptyBoxStyle}>No links added yet.</div>
          )}
        </section>
      </div>
    </div>
  );
}

const aboutShellStyle: CSSProperties = {
  width: "100%",
  display: "grid",
  gap: "18px",
};

const aboutHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: "14px",
  alignItems: "flex-start",
  flexWrap: "wrap",
};

const eyebrowStyle: CSSProperties = {
  color: "#a78bfa",
  fontSize: "12px",
  fontWeight: 900,
  letterSpacing: "0.18em",
  textTransform: "uppercase",
  marginBottom: "6px",
};

const titleStyle: CSSProperties = {
  margin: 0,
  color: "#f9fafb",
  fontSize: "24px",
  fontWeight: 950,
  letterSpacing: "-0.03em",
};

const subtitleStyle: CSSProperties = {
  margin: "8px 0 0",
  color: "#9ca3af",
  fontSize: "14px",
  lineHeight: 1.6,
  maxWidth: "680px",
};

const buttonRowStyle: CSSProperties = {
  display: "flex",
  gap: "10px",
  flexWrap: "wrap",
};

const primaryButtonStyle: CSSProperties = {
  background: "white",
  color: "black",
  border: "none",
  borderRadius: "999px",
  padding: "10px 16px",
  minHeight: "42px",
  fontWeight: 900,
  cursor: "pointer",
};

const secondaryButtonStyle: CSSProperties = {
  background: "rgba(255,255,255,0.05)",
  color: "white",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: "999px",
  padding: "10px 16px",
  minHeight: "42px",
  fontWeight: 800,
  cursor: "pointer",
};

const sectionGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
  gap: "14px",
};

const sectionCardStyle: CSSProperties = {
  background:
    "linear-gradient(180deg, rgba(255,255,255,0.060) 0%, rgba(255,255,255,0.032) 100%)",
  border: "1px solid rgba(255,255,255,0.10)",
  borderRadius: "24px",
  padding: "16px",
  boxShadow: "0 14px 34px rgba(0,0,0,0.22)",
  minWidth: 0,
};

const sectionHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "12px",
  marginBottom: "16px",
};

const sectionIconStyle: CSSProperties = {
  width: "42px",
  height: "42px",
  borderRadius: "15px",
  display: "grid",
  placeItems: "center",
  background: "rgba(168,85,247,0.12)",
  border: "1px solid rgba(168,85,247,0.24)",
  fontSize: "20px",
};

const sectionTitleStyle: CSSProperties = {
  margin: 0,
  color: "#f9fafb",
  fontSize: "16px",
  fontWeight: 950,
};

const sectionSubtitleStyle: CSSProperties = {
  margin: "4px 0 0",
  color: "#9ca3af",
  fontSize: "12px",
  lineHeight: 1.5,
};

const fieldWrapStyle: CSSProperties = {
  display: "grid",
  gap: "6px",
  marginBottom: "12px",
};

const fieldLabelStyle: CSSProperties = {
  color: "#a78bfa",
  fontSize: "12px",
  fontWeight: 900,
};

const fieldValueStyle: CSSProperties = {
  color: "#f9fafb",
  fontSize: "14px",
  lineHeight: 1.65,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
};

const inputStyle: CSSProperties = {
  width: "100%",
  background: "rgba(0,0,0,0.28)",
  color: "#f9fafb",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: "14px",
  padding: "11px 12px",
  outline: "none",
  fontSize: "14px",
};

const textAreaStyle: CSSProperties = {
  ...inputStyle,
  resize: "vertical",
  minHeight: "110px",
  lineHeight: 1.6,
};

const selectStyle: CSSProperties = {
  ...inputStyle,
  minWidth: "130px",
};

const emptyBoxStyle: CSSProperties = {
  border: "1px dashed rgba(255,255,255,0.16)",
  borderRadius: "16px",
  padding: "13px",
  color: "#9ca3af",
  fontSize: "13px",
};

const linkEditorRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "150px minmax(0, 1fr) auto",
  gap: "10px",
  alignItems: "center",
};

const dangerButtonStyle: CSSProperties = {
  background: "rgba(239,68,68,0.10)",
  color: "#fca5a5",
  border: "1px solid rgba(239,68,68,0.24)",
  borderRadius: "999px",
  padding: "10px 12px",
  fontWeight: 900,
  cursor: "pointer",
};

const addLinkButtonStyle: CSSProperties = {
  background: "rgba(168,85,247,0.12)",
  color: "#e9d5ff",
  border: "1px solid rgba(168,85,247,0.28)",
  borderRadius: "999px",
  padding: "11px 14px",
  fontWeight: 900,
  cursor: "pointer",
  width: "fit-content",
};

const linkButtonGridStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "10px",
};

const socialButtonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: "40px",
  padding: "0 14px",
  borderRadius: "999px",
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.12)",
  color: "#f9fafb",
  textDecoration: "none",
  fontWeight: 900,
  fontSize: "13px",
};
