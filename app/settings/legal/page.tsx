"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import BackToPrevious from "@/components/BackToPrevious";

type ProfilePreview = {
  id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
};

type AdminUserRow = {
  user_id: string;
  role: string;
};

type LegalSection = {
  eyebrow: string;
  title: string;
  description: string;
  items: string[];
  href?: string;
  status: "Available" | "Coming soon";
};

const legalSections: LegalSection[] = [
  {
    eyebrow: "Core Policy",
    title: "Terms of Service",
    description:
      "Review the rules for using Parapost Network, including account responsibilities, user content, acceptable use, moderation, suspensions, and account termination.",
    items: [
      "Account eligibility",
      "User content",
      "Acceptable use",
      "Platform rules",
      "Moderation",
      "Account termination",
    ],
    href: "/settings/legal/terms",
    status: "Available",
  },
  {
    eyebrow: "Core Policy",
    title: "Privacy Policy",
    description:
      "Learn what information Parapost Network collects, why it is used, how it is protected, and how users can submit privacy and data requests.",
    items: [
      "Account data",
      "Profile data",
      "Posts and media",
      "Parachat",
      "Safety records",
      "Data requests",
    ],
    status: "Coming soon",
  },
  {
    eyebrow: "Community Policy",
    title: "Community Guidelines",
    description:
      "Understand the behavior and content standards that help keep Parapost Network respectful, safe, useful, and welcoming for the community.",
    items: [
      "Respectful conduct",
      "No harassment",
      "No scams",
      "No harmful abuse",
      "Reporting",
      "Moderation review",
    ],
    status: "Coming soon",
  },
  {
    eyebrow: "Privacy Policy",
    title: "Data Deletion Policy",
    description:
      "Learn how to request account or data deletion, what information may be removed, and when limited information may need to be retained.",
    items: [
      "Account deletion",
      "Data deletion",
      "Request review",
      "Support follow-up",
      "Safety records",
      "Confirmation process",
    ],
    status: "Coming soon",
  },
  {
    eyebrow: "Safety Policy",
    title: "Safety & Reporting Policy",
    description:
      "Learn how to report safety concerns, inappropriate content, suspicious activity, and possible Community Guidelines violations.",
    items: [
      "Safety reports",
      "User reports",
      "Content reports",
      "Blocking",
      "Moderation response",
      "Appeals",
    ],
    status: "Coming soon",
  },
  {
    eyebrow: "Privacy Policy",
    title: "Cookie Policy",
    description:
      "Learn how cookies and similar technologies may be used to support login sessions, security, preferences, and platform performance.",
    items: [
      "Login sessions",
      "Security",
      "Preferences",
      "Essential cookies",
      "Performance",
      "Future updates",
    ],
    status: "Coming soon",
  },
  {
    eyebrow: "Content Policy",
    title: "Copyright & Intellectual Property",
    description:
      "Learn the rules for uploading content, respecting ownership rights, reporting possible copyright violations, and protecting Parapost Network branding.",
    items: [
      "User uploads",
      "Ownership rights",
      "Copyright reports",
      "Permission to share",
      "Platform branding",
      "Review process",
    ],
    status: "Coming soon",
  },
];

const trustCards = [
  {
    title: "Help & Support",
    description:
      "Contact Parapost Network through the in-app support area for account questions, technical help, or general assistance.",
    href: "/settings/help-support",
  },
  {
    title: "Privacy & Safety",
    description:
      "Submit privacy concerns, safety issues, reports, and moderation questions through the Privacy & Safety area.",
    href: "/settings/privacy-safety",
  },
  {
    title: "Data & Account",
    description:
      "Submit account deletion, data deletion, correction, access, and privacy-related requests through Data & Account.",
    href: "/settings/data",
  },
  {
    title: "Profile Visibility",
    description:
      "Manage whether profile content is public or private through the Profile Visibility area.",
    href: "/settings/profile-visibility",
  },
];

function getDisplayName(profile: ProfilePreview | null) {
  return profile?.full_name || profile?.username || "Parapost Member";
}

function getInitial(profile: ProfilePreview | null) {
  return getDisplayName(profile).charAt(0).toUpperCase();
}

function isAdminRole(role: string) {
  return ["owner", "admin", "support", "moderator"].includes(role);
}

export default function LegalSettingsPage() {
  const [currentProfile, setCurrentProfile] =
    useState<ProfilePreview | null>(null);
  const [userEmail, setUserEmail] = useState("");
  const [adminRole, setAdminRole] = useState("");
  const [pageLoading, setPageLoading] = useState(true);

  const canSeeAdminSupport = isAdminRole(adminRole);

  useEffect(() => {
    let cancelled = false;

    async function loadPageUser() {
      setPageLoading(true);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (cancelled) return;

      if (!user) {
        setCurrentProfile(null);
        setUserEmail("");
        setAdminRole("");
        setPageLoading(false);
        return;
      }

      setUserEmail(user.email || "");

      const [{ data: profileData }, { data: adminData }] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, username, full_name, avatar_url")
          .eq("id", user.id)
          .maybeSingle(),
        supabase
          .from("admin_users")
          .select("user_id, role")
          .eq("user_id", user.id)
          .maybeSingle(),
      ]);

      if (cancelled) return;

      setCurrentProfile((profileData as ProfilePreview | null) || null);

      const adminRow = adminData as AdminUserRow | null;

      setAdminRole(
        adminRow?.role && isAdminRole(adminRow.role) ? adminRow.role : ""
      );

      setPageLoading(false);
    }

    void loadPageUser();

    return () => {
      cancelled = true;
    };
  }, []);

  const publishedPolicyCount = legalSections.filter(
    (section) => section.status === "Available"
  ).length;

  return (
    <main className="legal-settings-page px-4 py-6 pb-[calc(7rem+env(safe-area-inset-bottom))] text-white sm:px-6 lg:px-6">

