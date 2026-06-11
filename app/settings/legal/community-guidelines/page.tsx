import LegalDocumentPage, {
  type LegalDocumentSection,
} from "@/components/settings/LegalDocumentPage";

const sections: LegalDocumentSection[] = [
  {
    title: "1. Purpose of These Guidelines",
    paragraphs: [
      "Parapost Network is a community platform designed to help people connect, share content, communicate, and participate in conversations about paranormal interests and related topics.",
      "These Community Guidelines explain the standards that apply when using Parapost Network. They are intended to support respectful discussion, user safety, privacy, and trust across the platform.",
      "These Guidelines apply to profiles, posts, comments, uploaded media, Reels, showcases, Parachat messages, reports, live content, and any other community features that Parapost Network makes available.",
    ],
  },
  {
    title: "2. Treat People With Respect",
    paragraphs: [
      "Parapost Network welcomes different perspectives, experiences, and opinions. Disagreement is allowed, but users must communicate respectfully.",
      "Do not use the platform to demean, intimidate, shame, or repeatedly target another person. Criticize ideas without attacking individuals.",
    ],
  },
  {
    title: "3. Harassment, Bullying, and Stalking",
    paragraphs: [
      "Do not harass, bully, stalk, or repeatedly target another user. This includes unwanted contact, coordinated targeting, repeated hostile messages, or attempts to continue contact after a user has clearly asked you to stop.",
      "Do not encourage other people to target, overwhelm, or harass a user, group, organization, or community.",
      "Use blocking and reporting tools when needed. Do not attempt to bypass a block by using another account or asking someone else to contact a user on your behalf.",
    ],
  },
  {
    title: "4. Hate Speech and Discrimination",
    paragraphs: [
      "Do not post, send, or promote hateful or discriminatory content that attacks, degrades, excludes, or encourages harm against people based on protected characteristics or vulnerability.",
      "Parapost Network may remove content and restrict accounts when conduct targets individuals or groups with hateful, dehumanizing, or discriminatory abuse.",
    ],
  },
  {
    title: "5. Threats, Violence, and Harmful Conduct",
    paragraphs: [
      "Do not threaten, encourage, celebrate, or coordinate violence or physical harm.",
      "Do not use Parapost Network to promote dangerous conduct, encourage harmful activity, or organize behavior that could put people at risk.",
      "Content may be removed and accounts may be restricted when a post, message, or activity creates a credible safety concern.",
    ],
  },
  {
    title: "6. Protect Children and Young People",
    paragraphs: [
      "Parapost Network does not allow content or conduct that exploits, endangers, sexualizes, or targets children or young people.",
      "Do not request, share, promote, or attempt to obtain sexual or exploitative content involving a minor.",
      "Do not use the platform to pressure, manipulate, or groom a young person. Serious safety concerns may be reported to the appropriate authorities where required.",
    ],
  },
  {
    title: "7. Respect Privacy",
    paragraphs: [
      "Do not share another person’s private or sensitive information without permission. This includes personal contact information, private communications, account credentials, financial information, or information that could expose someone to harm.",
      "Do not threaten to reveal private information, encourage others to search for it, or use personal information to intimidate another person.",
      "Before posting photos, videos, recordings, or messages involving another person, make sure you have the right or permission to share them.",
    ],
  },
  {
    title: "8. No Impersonation or Deceptive Identity Use",
    paragraphs: [
      "Do not impersonate another person, organization, team, business, public figure, or Parapost Network representative.",
      "Do not create misleading profiles or use another person’s name, image, or branding in a way that is likely to deceive users.",
      "Parody, commentary, and fan accounts must not mislead users about who operates the account.",
    ],
  },
  {
    title: "9. No Scams, Fraud, or Deceptive Promotions",
    paragraphs: [
      "Do not use Parapost Network to scam, defraud, mislead, or manipulate other users.",
      "Do not post deceptive promotions, false giveaways, phishing attempts, malicious links, or requests for information that you are not entitled to collect.",
      "Users are responsible for checking the legitimacy of any third-party offer, service, or link before acting on it.",
    ],
  },
  {
    title: "10. Spam and Platform Manipulation",
    paragraphs: [
      "Do not send repetitive, irrelevant, or unwanted content. Do not use automated tools, fake accounts, coordinated behavior, or artificial engagement to manipulate platform activity.",
      "Do not scrape data, interfere with platform performance, attempt to bypass technical safeguards, or misuse reporting and support systems.",
    ],
  },
  {
    title: "11. Illegal Activity and Prohibited Transactions",
    paragraphs: [
      "Do not use Parapost Network to promote, coordinate, or facilitate illegal activity.",
      "Do not use the platform to buy, sell, trade, or distribute prohibited or unlawfully restricted goods, services, or content.",
      "Parapost Network may remove content or restrict accounts when activity appears to violate applicable law or creates a serious safety concern.",
    ],
  },
  {
    title: "12. Disturbing or Graphic Content",
    paragraphs: [
      "Do not post content primarily intended to shock, intimidate, or distress other users.",
      "When discussing sensitive topics for educational, documentary, newsworthy, or paranormal-investigation purposes, use good judgment, provide context, and avoid unnecessary graphic material.",
      "Parapost Network may remove, limit, or restrict access to content when needed to protect users or maintain a safe community environment.",
    ],
  },
  {
    title: "13. Intellectual Property and Permission to Share",
    paragraphs: [
      "Only upload or share content that you created, that you have permission to use, or that you are legally permitted to share.",
      "Do not post copyrighted images, videos, recordings, writing, logos, or other protected materials in a way that violates another person’s rights.",
      "The Copyright & Intellectual Property Policy will provide additional information about ownership and reporting concerns.",
    ],
  },
  {
    title: "14. Paranormal Content, Claims, and Respectful Discussion",
    paragraphs: [
      "Parapost Network welcomes personal experiences, investigation results, theories, opinions, and respectful debate related to paranormal topics.",
      "Do not knowingly fabricate evidence, manipulate media to deceive users, or present unverified accusations about another person as established fact.",
      "When sharing an interpretation, belief, or personal experience, communicate clearly and respectfully. Users may disagree, but they must follow these Guidelines while doing so.",
    ],
  },
  {
    title: "15. Live Content, Events, and Shared Links",
    paragraphs: [
      "These Guidelines apply to live content, podcasts, event listings, shared external links, and other community features when they are made available.",
      "Do not use live or linked content to bypass platform rules. Parapost Network may remove a listing, restrict visibility, or limit access when a linked destination or broadcast creates a safety, legal, or trust concern.",
    ],
  },
  {
    title: "16. Reporting and Blocking",
    paragraphs: [
      "Use Parapost Network reporting tools or the Privacy & Safety area to report content, conduct, suspicious activity, or safety concerns.",
      "Use blocking tools when you no longer want another user to interact with you. Do not misuse reporting tools by knowingly submitting false, misleading, repetitive, or retaliatory reports.",
      "For urgent situations involving immediate danger, contact the appropriate local emergency service first.",
    ],
  },
  {
    title: "17. Moderation and Enforcement",
    paragraphs: [
      "Parapost Network may review reports, content, account activity, and related information when reasonably necessary to enforce these Guidelines, protect users, or comply with legal obligations.",
      "Depending on the circumstances, Parapost Network may remove content, limit visibility, issue warnings, restrict features, suspend accounts, permanently terminate accounts, or take other reasonable steps.",
      "Moderation decisions may consider the seriousness of the conduct, surrounding context, potential harm, repeated violations, and legal obligations.",
    ],
  },
  {
    title: "18. Questions, Appeals, and Updates",
    paragraphs: [
      "Users may submit questions about moderation decisions through Help & Support. Where an appeal process is available, instructions may be provided through the platform or support response.",
      "Parapost Network may update these Guidelines as the platform evolves or as safety, legal, and operational requirements change.",
      "When changes are significant, Parapost Network may provide notice through the service or by another reasonable method. The effective date at the top of this page will be updated.",
    ],
  },
];

export default function CommunityGuidelinesPage() {
  return (
    <LegalDocumentPage
      eyebrow="Community Guidelines"
      title="Community Guidelines"
      summary="These Guidelines explain the standards for respectful conduct, safety, privacy, authenticity, reporting, and moderation across Parapost Network."
      effectiveDate="June 10, 2026"
      sections={sections}
    />
  );
}
