import LegalDocumentPage from "@/components/settings/LegalDocumentPage";

const sections = [
  {
    title: "1. Agreement to These Terms",
    paragraphs: [
      "These Terms of Service govern your access to and use of Parapost Network, including its website, profiles, posts, comments, media, Reels, showcases, messaging features, support tools, and any related services that Parapost Network makes available.",
      "By creating an account or using Parapost Network, you agree to follow these Terms of Service and the Community Guidelines. If you do not agree, do not use the service.",
    ],
  },
  {
    title: "2. Who May Use Parapost Network",
    paragraphs: [
      "You must be at least 13 years old to use Parapost Network. If the law where you live requires a higher minimum age, that higher age applies.",
      "If you are under the age of majority where you live, you may use Parapost Network only with the permission of a parent or legal guardian.",
      "You may not use Parapost Network if your account has previously been suspended or terminated for serious or repeated violations unless Parapost Network has authorized your return.",
    ],
  },
  {
    title: "3. Your Account",
    paragraphs: [
      "You are responsible for providing accurate account information, protecting your login credentials, and keeping your account secure. You are also responsible for activity that occurs through your account.",
      "Do not impersonate another person, misrepresent your identity, create an account for deceptive purposes, or allow another person to misuse your account.",
      "Notify Parapost Network through Help & Support if you believe your account has been accessed without permission.",
    ],
  },
  {
    title: "4. Your Content",
    paragraphs: [
      "You may be able to create, upload, post, send, store, or share content through Parapost Network. This may include profile information, posts, text, comments, photos, videos, Reels, showcase content, links, messages, and other materials.",
      "You retain any ownership rights you have in your content. Parapost Network does not claim ownership of your original content.",
      "You are responsible for your content and must have the rights or permissions needed to post, upload, send, or share it.",
    ],
  },
  {
    title: "5. Permission to Operate the Service",
    paragraphs: [
      "When you submit content to Parapost Network, you grant Parapost Network a non-exclusive, worldwide, royalty-free license to host, store, reproduce, display, distribute, and technically modify that content as reasonably necessary to operate, secure, maintain, and improve the service.",
      "Technical modifications may include resizing images, compressing files, generating previews, displaying content on different devices, or formatting content so it works properly within the platform.",
      "This permission does not transfer ownership of your content to Parapost Network. The license ends when your content is deleted, except where limited retention is reasonably necessary for backups, security, legal obligations, or the continued display of content that you shared with others and that remains part of their use of the service.",
    ],
  },
  {
    title: "6. Public and Private Areas",
    paragraphs: [
      "Some areas of Parapost Network may be visible publicly or to other users depending on your settings and the feature you use. Other areas, such as direct-message conversations, are intended for the participants in those conversations.",
      "Do not post or send information that you do not have permission to share. Use care when sharing personal, confidential, or sensitive information online.",
      "Parapost Network may review content when reasonably necessary to investigate reports, address safety concerns, enforce platform rules, comply with legal obligations, or protect the service and its users.",
    ],
  },
  {
    title: "7. Acceptable Use",
    paragraphs: [
      "You must use Parapost Network lawfully and respectfully. You must also follow the Community Guidelines.",
    ],
    bullets: [
      "Do not harass, threaten, bully, stalk, or target other users.",
      "Do not post hateful, discriminatory, exploitative, or abusive content.",
      "Do not share content that violates another person’s privacy, intellectual-property rights, or other legal rights.",
      "Do not post scams, spam, deceptive promotions, or malicious links.",
      "Do not impersonate another person or misrepresent your identity for deceptive purposes.",
      "Do not attempt to bypass platform security, access another person’s account, interfere with the service, scrape data without permission, or use automated tools in an unauthorized way.",
      "Do not use Parapost Network to promote illegal activity or conduct that could harm users or the platform.",
    ],
  },
  {
    title: "8. Moderation and Enforcement",
    paragraphs: [
      "Parapost Network may investigate reported content, user conduct, account activity, or suspected violations of these Terms or the Community Guidelines.",
      "Depending on the circumstances, Parapost Network may remove content, limit visibility, issue warnings, restrict features, temporarily suspend an account, permanently terminate an account, or take other reasonable steps to protect users and the platform.",
      "Parapost Network may consider the seriousness of the conduct, the surrounding context, repeated violations, potential harm, and legal obligations when making moderation decisions.",
      "Users may submit questions about moderation decisions through Help & Support.",
    ],
  },
  {
    title: "9. Blocking and Reporting",
    paragraphs: [
      "Parapost Network provides tools that may allow users to block other users and report content, conduct, or safety concerns.",
      "Do not misuse reporting tools by knowingly submitting false, misleading, or abusive reports.",
      "Blocking another user may restrict certain interactions, but it may not remove every reference to that user or every piece of previously shared content from the platform.",
    ],
  },
  {
    title: "10. Intellectual Property",
    paragraphs: [
      "Parapost Network and its original branding, designs, logos, software, and platform materials are protected by applicable intellectual-property laws.",
      "These Terms do not give you permission to copy, sell, distribute, reverse engineer, or misuse Parapost Network software, branding, or proprietary materials except where the law allows it or Parapost Network gives written permission.",
    ],
  },
  {
    title: "11. Third-Party Services and Links",
    paragraphs: [
      "Parapost Network may contain links to third-party websites, platforms, services, or content. Third-party services are controlled by their respective providers and may have their own terms and privacy practices.",
      "Parapost Network is not responsible for third-party services solely because a link or integration is available through the platform.",
    ],
  },
  {
    title: "12. Service Availability and Changes",
    paragraphs: [
      "Parapost Network may add, remove, update, test, or change features over time. Some features may be unavailable temporarily because of maintenance, security work, technical issues, or circumstances outside Parapost Network’s control.",
      "Parapost Network does not guarantee that every feature will always be available, uninterrupted, or error-free.",
      "If paid features are introduced in the future, additional terms may apply before a user purchases or uses those features.",
    ],
  },
  {
    title: "13. Ending Your Use of Parapost Network",
    paragraphs: [
      "You may stop using Parapost Network at any time. You may also request account deletion through the Data & Account area or through Help & Support.",
      "Parapost Network may restrict, suspend, or terminate access when reasonably necessary to enforce these Terms, protect users, protect the platform, comply with legal obligations, or respond to serious or repeated violations.",
      "The Data Deletion Policy explains how deletion requests are handled and when limited information may need to be retained.",
    ],
  },
  {
    title: "14. Disclaimers",
    paragraphs: [
      "Parapost Network is provided on an as-is and as-available basis to the fullest extent permitted by law.",
      "Parapost Network cannot guarantee the accuracy, reliability, or completeness of content posted by users. Views expressed by users belong to those users and do not necessarily represent Parapost Network.",
      "Nothing in these Terms excludes rights or protections that cannot legally be excluded.",
    ],
  },
  {
    title: "15. Limitation of Liability",
    paragraphs: [
      "To the fullest extent permitted by applicable law, Parapost Network will not be responsible for indirect, incidental, special, consequential, or punitive damages arising from your use of the service or your inability to use the service.",
      "Nothing in these Terms limits liability where doing so would not be permitted by applicable law.",
    ],
  },
  {
    title: "16. Updates to These Terms",
    paragraphs: [
      "Parapost Network may update these Terms as the platform evolves or when legal, safety, or operational requirements change.",
      "When changes are significant, Parapost Network may provide notice through the service or by another reasonable method. The updated effective date will appear at the top of this page.",
      "Continuing to use Parapost Network after updated Terms take effect means that you accept the revised Terms.",
    ],
  },
  {
    title: "17. Governing Rules and Contact",
    paragraphs: [
      "These Terms are governed by the laws applicable in Canada and the jurisdiction in which Parapost Network operates, except where the laws where you live require otherwise.",
      "Questions about these Terms may be submitted through the in-app Help & Support area.",
    ],
  },
];

export default function TermsOfServicePage() {
  return (
    <LegalDocumentPage
      eyebrow="Terms of Service"
      title="Terms of Service"
      summary="These Terms explain the rules for accessing and using Parapost Network, including accounts, user content, platform conduct, moderation, reporting, and account termination."
      effectiveDate="June 9, 2026"
      sections={sections}
    />
  );
}