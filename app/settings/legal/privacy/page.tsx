import LegalDocumentPage, {
  type LegalDocumentSection,
} from "@/components/settings/LegalDocumentPage";

const sections: LegalDocumentSection[] = [
  {
    title: "1. Scope of This Privacy Policy",
    paragraphs: [
      "This Privacy Policy explains how Parapost Network collects, uses, stores, shares, and protects personal information when you access or use the platform.",
      "This policy applies to Parapost Network features and services, including accounts, profiles, posts, comments, media uploads, Reels, showcases, friendships, follows, likes, messages, reports, support tools, and settings.",
      "By using Parapost Network, you acknowledge the practices described in this Privacy Policy. Additional notice may be provided when a feature requires information that is not covered clearly by this policy.",
    ],
  },
  {
    title: "2. Information You Provide",
    paragraphs: [
      "Parapost Network collects information that you provide when you create an account, build a profile, use platform features, contact support, or communicate with other users.",
    ],
    bullets: [
      "Account information, such as your email address, account identifier, and authentication details.",
      "Profile information, such as your username, display name, biography, profile photo, cover photo, and other details you choose to add.",
      "Settings and preferences, such as profile visibility, personalization choices, notification preferences, and blocked-user selections.",
      "Support information, such as the details, screenshots, files, or other materials that you submit through Help & Support.",
      "Privacy and safety requests, such as account questions, data requests, deletion requests, reports, and moderation concerns.",
    ],
  },
  {
    title: "3. Content and Community Activity",
    paragraphs: [
      "Parapost Network processes content and activity that you create or share while using the platform.",
    ],
    bullets: [
      "Posts, comments, descriptions, links, uploaded photos, videos, Reels, showcase content, and other media.",
      "Likes, follows, friendships, friend requests, comments, and other interactions.",
      "Reports, blocks, moderation records, and safety-related activity.",
      "Messages and media shared through Parachat.",
    ],
  },
  {
    title: "4. Technical and Security Information",
    paragraphs: [
      "Parapost Network and its service providers may process technical information automatically when you use the platform. This information may be used to operate the service, protect accounts, investigate errors, and improve reliability.",
    ],
    bullets: [
      "Internet Protocol address and general network information.",
      "Browser, device, operating-system, and app-related information.",
      "Login events, timestamps, session information, and authentication activity.",
      "Security logs, error reports, diagnostic information, and activity needed to prevent misuse.",
      "Information needed to deliver pages, media, and platform features correctly.",
    ],
  },
  {
    title: "5. Cookies and Similar Technologies",
    paragraphs: [
      "Parapost Network may use cookies, local storage, session storage, and similar technologies where reasonably necessary to keep users signed in, protect accounts, remember settings, and operate platform features.",
      "A separate Cookie Policy may provide additional details as the platform evolves. If non-essential analytics, advertising, or marketing technologies are introduced, Parapost Network may provide additional notice or consent options where required.",
    ],
  },
  {
    title: "6. How Information Is Used",
    paragraphs: [
      "Parapost Network uses information for purposes reasonably connected to operating, securing, and improving the platform.",
    ],
    bullets: [
      "To create and maintain user accounts.",
      "To authenticate users and protect account security.",
      "To display profiles, posts, comments, media, Reels, and other content according to platform features and user settings.",
      "To enable friendships, follows, likes, blocking, reporting, and Parachat.",
      "To respond to support messages, privacy questions, and data requests.",
      "To investigate reports, enforce platform rules, and protect users.",
      "To detect technical problems, prevent abuse, and improve reliability.",
      "To comply with legal obligations and respond to lawful requests.",
    ],
  },
  {
    title: "7. Public and Private Areas",
    paragraphs: [
      "Some information may be visible to other users or to the public depending on the feature you use and your profile-visibility settings. This may include your username, profile information, posts, media, comments, Reels, and community activity.",
      "Other information is intended for limited access. For example, direct messages are intended for the participants in the conversation rather than for public display.",
      "Review your settings carefully before sharing information. Do not upload or send information that you do not want others to receive or view.",
    ],
  },
  {
    title: "8. Parachat Messages",
    paragraphs: [
      "Parachat messages and shared media are intended for the participants in a conversation. They are not displayed publicly as ordinary posts.",
      "Parachat should not be treated as a guaranteed end-to-end encrypted communication service unless Parapost Network expressly states otherwise.",
      "Parapost Network may access or preserve message-related information when reasonably necessary to investigate reports, address safety concerns, troubleshoot technical issues, protect the platform, comply with legal obligations, or respond to lawful requests.",
    ],
  },
  {
    title: "9. Service Providers",
    paragraphs: [
      "Parapost Network may use service providers to host, store, secure, deliver, and maintain the platform. These providers may process information only as reasonably necessary to provide their services, support platform operations, comply with legal obligations, or protect their systems.",
      "Current infrastructure may include Supabase for database, authentication, and storage services; Vercel for application hosting and deployment; and Cloudflare for domain, network-security, or related services depending on the active configuration.",
      "Parapost Network may update its service providers as the platform evolves. Significant changes to privacy practices may result in an update to this policy.",
    ],
  },
  {
    title: "10. When Information May Be Shared",
    paragraphs: [
      "Parapost Network does not sell personal information.",
      "Information may be shared only where reasonably necessary for platform operations, safety, legal compliance, or another purpose disclosed to you.",
    ],
    bullets: [
      "With service providers that support hosting, storage, authentication, security, and technical operations.",
      "When required by law, court order, legal process, or a lawful request.",
      "When reasonably necessary to investigate fraud, abuse, threats, safety concerns, or violations of platform rules.",
      "To protect the rights, safety, property, and security of Parapost Network, its users, and others.",
      "As part of a business transfer, reorganization, or similar transaction, subject to appropriate safeguards.",
      "With your direction, permission, or consent.",
    ],
  },
  {
    title: "11. Storage and Processing Locations",
    paragraphs: [
      "Parapost Network and its service providers may store or process information in Canada, the United States, or other jurisdictions where service providers operate.",
      "Information processed outside your province, territory, state, or country may be subject to the laws of the jurisdiction where it is processed.",
    ],
  },
  {
    title: "12. Data Retention",
    paragraphs: [
      "Parapost Network retains information only for as long as reasonably necessary to provide the service, maintain security, handle support and moderation matters, comply with legal obligations, resolve disputes, and enforce platform rules.",
      "The retention period may vary depending on the type of information, the reason it was collected, safety considerations, and legal requirements.",
      "Deleted information may remain temporarily in backups or security records before it is removed through normal retention processes.",
    ],
  },
  {
    title: "13. Access, Correction, and Deletion Requests",
    paragraphs: [
      "Users may submit requests related to access, correction, data deletion, or account deletion through the Data & Account area or through Help & Support.",
      "Parapost Network may need to verify your identity before completing a request. Some information may be retained where reasonably necessary for security, fraud prevention, legal compliance, dispute resolution, or the protection of users.",
      "The Data Deletion Policy provides additional information about deletion requests and limited retention.",
    ],
  },
  {
    title: "14. Safety, Moderation, and Legal Compliance",
    paragraphs: [
      "Parapost Network may review, preserve, restrict, or disclose information where reasonably necessary to investigate reports, address safety concerns, enforce the Terms of Service and Community Guidelines, protect the platform, or comply with legal obligations.",
      "Moderation records may be retained when reasonably necessary to document warnings, suspensions, bans, appeals, reports, or repeated violations.",
    ],
  },
  {
    title: "15. Security Safeguards",
    paragraphs: [
      "Parapost Network uses reasonable administrative, technical, and organizational safeguards intended to protect personal information against unauthorized access, misuse, loss, alteration, and disclosure.",
      "No online platform can guarantee absolute security. Users should use a strong password, protect their login information, and contact Help & Support if they believe their account has been accessed without permission.",
    ],
  },
  {
    title: "16. Young Users",
    paragraphs: [
      "Parapost Network is intended for users who meet the minimum age requirements stated in the Terms of Service.",
      "If Parapost Network becomes aware that an account was created by a person who does not meet the applicable minimum age requirement, Parapost Network may restrict or remove the account and take reasonable steps to delete related information.",
      "A parent or legal guardian may contact Parapost Network through Help & Support with a privacy concern involving a young user.",
    ],
  },
  {
    title: "17. Your Privacy Choices",
    paragraphs: [
      "Parapost Network provides settings and support paths that allow users to manage certain privacy choices.",
    ],
    bullets: [
      "Manage profile visibility through Profile Visibility.",
      "Manage blocked users through the blocked-user settings area.",
      "Submit privacy and safety concerns through Privacy & Safety.",
      "Submit access, correction, deletion, and account-related requests through Data & Account.",
      "Contact Help & Support for additional assistance.",
    ],
  },
  {
    title: "18. Updates to This Privacy Policy",
    paragraphs: [
      "Parapost Network may update this Privacy Policy as the platform changes or when legal, technical, operational, or safety requirements evolve.",
      "When changes are significant, Parapost Network may provide notice through the service or by another reasonable method. The effective date at the top of this page will be updated.",
    ],
  },
  {
    title: "19. Contact",
    paragraphs: [
      "Questions, concerns, and requests related to this Privacy Policy may be submitted through the in-app Help & Support area.",
      "Users may also use the Privacy & Safety area for privacy concerns and the Data & Account area for access, correction, deletion, and account-related requests.",
    ],
  },
];

export default function PrivacyPolicyPage() {
  return (
    <LegalDocumentPage
      eyebrow="Privacy Policy"
      title="Privacy Policy"
      summary="This Privacy Policy explains what information Parapost Network collects, how it is used, when it may be shared, how it is protected, and how users can submit privacy and data requests."
      effectiveDate="June 10, 2026"
      sections={sections}
    />
  );
}