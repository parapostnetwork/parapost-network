import LegalDocumentPage, {
  type LegalDocumentSection,
} from "@/components/settings/LegalDocumentPage";

const sections: LegalDocumentSection[] = [
  {
    title: "1. Purpose of This Policy",
    paragraphs: [
      "This Copyright & Intellectual Property Policy explains the rules for uploading, sharing, reporting, and protecting content and branding on Parapost Network.",
      "This policy applies to profiles, posts, comments, uploaded photos, videos, Reels, showcase content, Parachat media, live content, external links, logos, names, designs, and other materials shared through or associated with the platform.",
      "This policy should be read together with the Terms of Service, Privacy Policy, Community Guidelines, and Safety & Reporting Policy.",
    ],
  },
  {
    title: "2. Respect Intellectual Property Rights",
    paragraphs: [
      "Users must respect copyright, trademark, and other intellectual property rights.",
      "Only upload, post, send, display, or share content that you created, that you have permission to use, or that you are otherwise legally permitted to share.",
      "Do not use Parapost Network to distribute, promote, or link to content that you know or reasonably should know violates another person’s rights.",
    ],
  },
  {
    title: "3. Copyright and Original Works",
    paragraphs: [
      "Copyright may protect original creative works, including writing, photographs, artwork, videos, audio recordings, graphics, software, and other forms of expression.",
      "Ideas, facts, concepts, and short titles may not be protected in the same way as an original fixed work.",
      "Users are responsible for understanding whether they have the right to upload or share a work before posting it on Parapost Network.",
    ],
  },
  {
    title: "4. User Ownership",
    paragraphs: [
      "You retain ownership of the content that you create and upload to Parapost Network, subject to any rights held by other people and the permissions needed to operate the platform.",
      "Uploading content does not transfer your ownership to Parapost Network.",
      "The Terms of Service may describe the limited permissions that you grant to Parapost Network so the platform can host, display, store, process, deliver, and operate your content through platform features.",
    ],
  },
  {
    title: "5. Permission to Upload and Share",
    paragraphs: [
      "Before uploading or sharing content, make sure that you have the rights, licences, permissions, or legal basis needed to do so.",
      "This includes content that contains another person’s photographs, video, audio, writing, artwork, logo, music, branding, or other protected material.",
      "Crediting a creator does not automatically give you permission to use their work.",
    ],
  },
  {
    title: "6. Paranormal Investigations, Events, and Shared Media",
    paragraphs: [
      "Parapost Network welcomes original investigation content, event materials, podcasts, live content, photos, videos, recordings, and related community media.",
      "Before uploading content created at an investigation, event, venue, or private location, make sure you have any permissions reasonably required from the creator, organizer, venue, participant, or other rights holder.",
      "Do not present another investigator’s recordings, evidence, branding, or written work as your own.",
    ],
  },
  {
    title: "7. Reposts, Clips, Screenshots, and Edited Content",
    paragraphs: [
      "Reposting, clipping, editing, cropping, adding text, or changing the format of another person’s content does not automatically make the content yours.",
      "Before sharing a screenshot, clip, compilation, remix, or edited version, make sure you have permission or another lawful basis to use the material.",
      "When context matters, do not edit or present content in a misleading way.",
    ],
  },
  {
    title: "8. Music, Audio, and Video",
    paragraphs: [
      "Do not upload or share music, audio, video, broadcasts, podcasts, clips, or recordings unless you have the right to use them.",
      "Permissions may be required even when only part of a work is used or when content appears in the background of a recording.",
      "Parapost Network may restrict, mute, remove, or limit access to content when reasonably necessary to address a rights concern or comply with applicable requirements.",
    ],
  },
  {
    title: "9. Trademarks, Names, Logos, and Branding",
    paragraphs: [
      "Do not use another person’s or organization’s trademark, trade name, logo, branding, or visual identity in a way that is likely to mislead users about ownership, affiliation, sponsorship, approval, or endorsement.",
      "Fan pages, commentary, reviews, and community discussions must not impersonate or falsely suggest an official relationship.",
      "Parapost Network may restrict misleading accounts, content, or branding where reasonably necessary to protect users and platform trust.",
    ],
  },
  {
    title: "10. Parapost Network Branding",
    paragraphs: [
      "The Parapost Network name, logos, visual identity, platform designs, graphics, and related branding may be owned by or licensed to Parapost Network.",
      "Do not copy, sell, license, modify, distribute, or use Parapost Network branding in a way that falsely suggests an official partnership, sponsorship, approval, or affiliation.",
      "Contact Parapost Network through Help & Support before using platform branding for commercial, promotional, or partnership purposes.",
    ],
  },
  {
    title: "11. Fair Dealing and Other Legal Exceptions",
    paragraphs: [
      "Copyright laws may allow limited uses of protected material in certain circumstances, including uses that may qualify as fair dealing or another legal exception.",
      "Whether an exception applies depends on the facts and applicable law.",
      "Parapost Network cannot provide legal advice or guarantee that a particular use is permitted. Users should obtain independent legal advice when needed.",
    ],
  },
  {
    title: "12. Reporting a Copyright Concern",
    paragraphs: [
      "If you believe that content on Parapost Network violates your copyright or another intellectual property right, submit a report through Help & Support or the Privacy & Safety area.",
      "Provide enough information for Parapost Network to identify the content, understand the concern, and contact you if clarification is needed.",
    ],
    bullets: [
      "Your name and a reliable way to contact you.",
      "A description of the protected work, trademark, or other right involved.",
      "The location of the content on Parapost Network, such as a profile, post, comment, Reel, message, media item, or link.",
      "An explanation of why you believe the use is unauthorized or otherwise violates your rights.",
      "Information showing that you are the rights holder or are authorized to act for the rights holder.",
      "Any relevant supporting documents, screenshots, links, or dates.",
    ],
  },
  {
    title: "13. Good-Faith Reports",
    paragraphs: [
      "Submit intellectual-property reports honestly and in good faith.",
      "Do not knowingly submit false, misleading, incomplete, retaliatory, or abusive reports.",
      "Parapost Network may request clarification, decline to act on an unsupported report, or take reasonable action when reporting tools are misused.",
    ],
  },
  {
    title: "14. How Reports May Be Reviewed",
    paragraphs: [
      "Parapost Network may review the reported content, related information, account activity, supporting documents, and relevant context when reasonably necessary.",
      "Parapost Network may contact the reporting party, the user who posted the content, or other relevant parties for clarification.",
      "Depending on the circumstances, Parapost Network may remove content, restrict access, limit visibility, preserve relevant records, issue a warning, take no action, or take another reasonable step.",
    ],
  },
  {
    title: "15. Responses and Appeals",
    paragraphs: [
      "A user whose content is restricted or removed may contact Help & Support to provide additional context or request a review where an appeal process is available.",
      "Parapost Network may consider the information provided by the reporting party, the responding user, the apparent rights involved, platform rules, legal obligations, and other relevant circumstances.",
      "Submitting an appeal does not guarantee that a decision will be changed.",
    ],
  },
  {
    title: "16. Repeat or Serious Violations",
    paragraphs: [
      "Parapost Network may restrict, suspend, or permanently terminate accounts that repeatedly or seriously violate intellectual property rights or misuse reporting tools.",
      "The action taken may depend on the seriousness of the conduct, the available information, repeated behavior, legal obligations, and the need to protect users and the platform.",
    ],
  },
  {
    title: "17. Preservation and Retention of Records",
    paragraphs: [
      "Parapost Network may retain limited records related to intellectual-property reports, supporting materials, moderation decisions, responses, appeals, and repeated violations when reasonably necessary.",
      "Retention may support legal compliance, dispute resolution, fraud prevention, repeated-abuse detection, platform integrity, and the protection of users and rights holders.",
      "Where appropriate, Parapost Network may restrict, anonymize, reduce, or limit access to retained information.",
    ],
  },
  {
    title: "18. External Links and Third-Party Content",
    paragraphs: [
      "Parapost Network may allow users to share external links or embed third-party content where supported.",
      "A link or embed does not mean that Parapost Network owns, approves, endorses, or controls the third-party content.",
      "Users remain responsible for the content they share and for complying with the rights and rules that apply to third-party services.",
    ],
  },
  {
    title: "19. Lawful Requests and Legal Processes",
    paragraphs: [
      "Parapost Network may preserve, restrict, remove, or disclose information when reasonably necessary to comply with applicable law, court orders, lawful requests, or legal obligations.",
      "Parapost Network may also take reasonable steps to protect its rights, users, service providers, and the platform.",
    ],
  },
  {
    title: "20. Updates to This Policy",
    paragraphs: [
      "Parapost Network may update this Copyright & Intellectual Property Policy as the platform evolves or when legal, technical, operational, or safety requirements change.",
      "When changes are significant, Parapost Network may provide notice through the service or by another reasonable method. The effective date at the top of this page will be updated.",
    ],
  },
  {
    title: "21. Contact",
    paragraphs: [
      "Submit copyright, trademark, branding, and other intellectual-property concerns through the in-app Help & Support area or the Privacy & Safety area.",
      "Include enough information to identify the content and explain the rights concern clearly.",
    ],
  },
];

export default function CopyrightPolicyPage() {
  return (
    <LegalDocumentPage
      eyebrow="Copyright & Intellectual Property"
      title="Copyright & Intellectual Property"
      summary="This policy explains the rules for uploading content, respecting ownership rights, reporting possible copyright or branding concerns, and protecting Parapost Network intellectual property."
      effectiveDate="June 10, 2026"
      sections={sections}
    />
  );
}
