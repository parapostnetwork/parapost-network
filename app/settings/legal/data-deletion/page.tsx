import LegalDocumentPage, {
  type LegalDocumentSection,
} from "@/components/settings/LegalDocumentPage";

const sections: LegalDocumentSection[] = [
  {
    title: "1. Purpose of This Policy",
    paragraphs: [
      "This Data Deletion Policy explains how users can request deletion of a Parapost Network account or certain personal information associated with an account.",
      "It also explains how deletion requests are reviewed, what information may be removed, and when limited information may need to be retained for security, legal, fraud-prevention, safety, or operational reasons.",
      "This policy should be read together with the Parapost Network Privacy Policy and Terms of Service.",
    ],
  },
  {
    title: "2. Ways to Submit a Deletion Request",
    paragraphs: [
      "Users may submit an account-deletion or data-deletion request through the Data & Account area or through Help & Support.",
      "Parapost Network may ask for additional information when reasonably necessary to identify the account, understand the request, and protect the account from unauthorized deletion.",
    ],
    bullets: [
      "Use the Data & Account area for account-related and privacy-related requests.",
      "Use Help & Support when you need assistance or cannot access your account.",
      "Describe whether you want to delete the entire account or specific information.",
      "Provide enough information to help Parapost Network identify the relevant account or content.",
    ],
  },
  {
    title: "3. Identity Verification",
    paragraphs: [
      "Before completing a deletion request, Parapost Network may take reasonable steps to verify that the request came from the account owner or from a person legally authorized to act on the owner’s behalf.",
      "Verification helps protect users against unauthorized requests, account takeovers, fraud, and accidental deletion.",
      "Parapost Network will request only the information reasonably necessary to verify and process the request.",
    ],
  },
  {
    title: "4. Deleting Your Account",
    paragraphs: [
      "A request to delete your account asks Parapost Network to remove or deactivate the account and process associated personal information according to this policy.",
      "Account deletion may affect access to your profile, posts, comments, Reels, showcase content, friendships, follows, likes, settings, and other platform features.",
      "Parapost Network may provide a confirmation step before completing account deletion. Once the request has been processed, some information may no longer be recoverable.",
    ],
  },
  {
    title: "5. Deleting Specific Information",
    paragraphs: [
      "Users may also request deletion of specific personal information or content without requesting deletion of the entire account.",
      "Where platform tools allow it, users should first delete or edit their own posts, comments, media, profile information, or messages directly through the relevant feature.",
      "If a direct self-service option is unavailable or does not work as expected, submit a request through Data & Account or Help & Support.",
    ],
  },
  {
    title: "6. Profile Information",
    paragraphs: [
      "Profile information may include your username, display name, biography, profile photo, cover photo, and other profile details you choose to provide.",
      "When an account-deletion request is completed, Parapost Network may remove, anonymize, or disconnect profile information from the active account, subject to limited retention described in this policy.",
    ],
  },
  {
    title: "7. Posts, Comments, Reels, and Uploaded Media",
    paragraphs: [
      "Parapost Network may process deletion requests involving posts, comments, photos, videos, Reels, showcase content, descriptions, and other uploaded materials.",
      "Content that you delete may stop appearing in active areas of the platform. In some situations, limited copies may remain temporarily in backups, caches, security records, or technical systems before they are removed through normal processes.",
      "Content that has been copied, downloaded, quoted, reshared, or captured by another user outside Parapost Network may remain outside Parapost Network’s control.",
    ],
  },
  {
    title: "8. Parachat Messages and Shared Media",
    paragraphs: [
      "Users may be able to delete certain Parachat messages or media through available platform tools.",
      "Deleting a message may remove it from active display within the conversation, but limited information may remain temporarily in backups, security records, or technical systems before removal through normal processes.",
      "Messages or media that another participant copied, downloaded, captured, or shared outside Parapost Network may remain outside Parapost Network’s control.",
    ],
  },
  {
    title: "9. Friendships, Follows, Likes, and Other Activity",
    paragraphs: [
      "Account deletion may remove or disconnect certain friendships, follows, likes, settings, blocked-user selections, and other account-related activity.",
      "Some records may remain in a limited form where reasonably necessary to preserve platform integrity, prevent abuse, resolve disputes, or protect other users.",
    ],
  },
  {
    title: "10. Reports, Moderation Records, and Safety Information",
    paragraphs: [
      "Parapost Network may retain limited reports, moderation records, warnings, suspensions, bans, appeals, blocking records, and related safety information when reasonably necessary to protect users, document enforcement decisions, prevent repeated abuse, respond to legal obligations, or maintain platform integrity.",
      "Where appropriate, Parapost Network may reduce, restrict, anonymize, or limit access to retained information.",
      "A deletion request does not require Parapost Network to erase records that must reasonably be preserved for safety, security, fraud prevention, dispute resolution, or legal compliance.",
    ],
  },
  {
    title: "11. Support Requests and Attachments",
    paragraphs: [
      "Support tickets, screenshots, files, and attachments may contain personal information.",
      "Parapost Network may retain support records for as long as reasonably necessary to respond to the request, document the resolution, investigate recurring issues, protect users, or meet legal and operational requirements.",
      "Users may ask Parapost Network to review whether support information can be deleted or reduced when it is no longer needed.",
    ],
  },
  {
    title: "12. Backups, Caches, and Technical Systems",
    paragraphs: [
      "Deleted information may remain temporarily in backups, caches, logs, or technical systems before it is removed or overwritten through normal retention and recovery processes.",
      "Backups are intended to support security, reliability, and disaster recovery. They are not intended to restore deleted information to active use except where reasonably necessary for recovery, security, or legal compliance.",
    ],
  },
  {
    title: "13. Legal, Security, and Fraud-Prevention Retention",
    paragraphs: [
      "Parapost Network may retain limited information when reasonably necessary to comply with applicable law, respond to lawful requests, protect legal rights, resolve disputes, prevent fraud, investigate abuse, enforce platform rules, or protect users and the service.",
      "Retention will be limited to what is reasonably necessary for the relevant purpose.",
    ],
  },
  {
    title: "14. Third-Party Service Providers",
    paragraphs: [
      "Parapost Network may use service providers for hosting, storage, authentication, deployment, security, and related technical operations.",
      "When a deletion request is processed, Parapost Network may take reasonable steps to apply the request across relevant systems and service-provider processes where appropriate.",
      "Some service-provider systems may retain limited information temporarily through backup, security, legal, or technical-retention processes.",
    ],
  },
  {
    title: "15. Timing and Request Review",
    paragraphs: [
      "Parapost Network will review deletion requests within a reasonable period and may contact the requester when clarification or identity verification is needed.",
      "The time needed to complete a request may depend on the type of information involved, the scope of the request, technical processes, safety considerations, and legal requirements.",
      "Parapost Network may confirm when a request has been completed or explain when certain information must be retained.",
    ],
  },
  {
    title: "16. Requests Involving Young Users",
    paragraphs: [
      "A parent or legal guardian may contact Parapost Network through Help & Support with a deletion request involving a young user who does not meet the applicable minimum-age requirement.",
      "Parapost Network may request reasonable verification before processing the request.",
    ],
  },
  {
    title: "17. Requests That Cannot Be Fully Completed",
    paragraphs: [
      "Parapost Network may be unable to delete certain information immediately or completely when retention is reasonably necessary for safety, security, fraud prevention, dispute resolution, legal compliance, technical recovery, or the protection of other users.",
      "Parapost Network may also be unable to remove copies of information that exist outside its systems, including content copied, downloaded, captured, or reshared by another person.",
      "Where appropriate, Parapost Network may explain the reason for a limitation or apply an alternative such as restriction, anonymization, or disconnection from the active account.",
    ],
  },
  {
    title: "18. Updates to This Policy",
    paragraphs: [
      "Parapost Network may update this Data Deletion Policy as the platform evolves or when legal, safety, technical, or operational requirements change.",
      "When changes are significant, Parapost Network may provide notice through the service or by another reasonable method. The effective date at the top of this page will be updated.",
    ],
  },
  {
    title: "19. Contact",
    paragraphs: [
      "Submit account-deletion, data-deletion, correction, and access requests through the Data & Account area.",
      "For additional assistance, contact Parapost Network through the in-app Help & Support area.",
    ],
  },
];

export default function DataDeletionPolicyPage() {
  return (
    <LegalDocumentPage
      eyebrow="Data Deletion Policy"
      title="Data Deletion Policy"
      summary="This policy explains how to request account or data deletion, how requests are reviewed, what information may be removed, and when limited information may need to be retained."
      effectiveDate="June 10, 2026"
      sections={sections}
    />
  );
}
