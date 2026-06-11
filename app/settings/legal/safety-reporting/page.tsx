import LegalDocumentPage, {
  type LegalDocumentSection,
} from "@/components/settings/LegalDocumentPage";

const sections: LegalDocumentSection[] = [
  {
    title: "1. Purpose of This Policy",
    paragraphs: [
      "This Safety & Reporting Policy explains how users can report concerns, how Parapost Network may review reports, and what actions may be taken to protect users and the platform.",
      "This policy applies to profiles, posts, comments, uploaded media, Reels, showcases, Parachat messages, live content, external links shared through the platform, account activity, and other Parapost Network features.",
      "This policy should be read together with the Terms of Service, Privacy Policy, Community Guidelines, and Data Deletion Policy.",
    ],
  },
  {
    title: "2. When to Submit a Report",
    paragraphs: [
      "Submit a report when you believe content, conduct, or account activity may violate Parapost Network rules or create a safety concern.",
      "Reports help Parapost Network review possible issues and decide whether moderation, support, or other reasonable action is appropriate.",
    ],
    bullets: [
      "Harassment, bullying, stalking, or repeated unwanted contact.",
      "Threats, intimidation, or conduct that may place a person at risk.",
      "Hateful, discriminatory, or abusive content.",
      "Scams, fraud, impersonation, phishing attempts, or suspicious links.",
      "Privacy concerns, including the sharing of personal or sensitive information without permission.",
      "Content or conduct involving the safety of a child or young person.",
      "Spam, platform manipulation, fake accounts, or attempts to bypass platform restrictions.",
      "Content that may violate the Community Guidelines, Terms of Service, or applicable law.",
    ],
  },
  {
    title: "3. Immediate Danger and Emergencies",
    paragraphs: [
      "Parapost Network is not an emergency-response service.",
      "If you believe someone is in immediate danger or urgent assistance is required, contact the appropriate local emergency service first.",
      "You may also submit a report to Parapost Network so the platform can review relevant account or content activity and take reasonable action where appropriate.",
    ],
  },
  {
    title: "4. How to Submit a Report",
    paragraphs: [
      "Use available in-app reporting tools when they are provided for the content or account involved.",
      "You may also use the Privacy & Safety area or Help & Support when you need assistance, when a direct report option is unavailable, or when the issue requires additional explanation.",
    ],
    bullets: [
      "Identify the account, post, comment, message, Reel, media item, link, or feature involved.",
      "Describe the concern clearly and provide relevant context.",
      "Include screenshots, files, links, dates, or other supporting details when reasonably helpful.",
      "Avoid including unrelated personal information.",
      "Submit one clear report rather than multiple repetitive reports about the same issue.",
    ],
  },
  {
    title: "5. Blocking and Personal Safety Tools",
    paragraphs: [
      "Blocking can help limit unwanted interaction with another user.",
      "When appropriate, use the blocking tools available through Parapost Network. Blocking does not replace reporting when conduct may violate platform rules or create a safety concern.",
      "Do not attempt to bypass a block by using another account, asking another person to make contact, or using another platform feature to continue unwanted interaction.",
    ],
  },
  {
    title: "6. Reports Involving Parachat",
    paragraphs: [
      "Parachat messages and shared media are intended for the participants in a conversation, but they remain subject to the Terms of Service and Community Guidelines.",
      "When reporting a Parachat concern, provide enough information to help Parapost Network understand the issue. Depending on the circumstances, this may include the conversation, message, sender, timestamp, or shared media involved.",
      "Parapost Network may review, preserve, restrict, or disclose message-related information when reasonably necessary to investigate reports, address safety concerns, troubleshoot technical issues, enforce platform rules, or comply with legal obligations.",
    ],
  },
  {
    title: "7. Reports Involving Children or Young People",
    paragraphs: [
      "Parapost Network takes concerns involving children and young people seriously.",
      "Submit a report promptly when content or conduct may exploit, endanger, sexualize, manipulate, or target a child or young person.",
      "Parapost Network may restrict content or accounts, preserve relevant information, and refer serious concerns to the appropriate authorities where required or reasonably necessary.",
    ],
  },
  {
    title: "8. Privacy and Personal-Information Concerns",
    paragraphs: [
      "Report content or conduct that appears to expose personal or sensitive information without permission, including private communications, contact details, account credentials, financial information, or other information that could place someone at risk.",
      "Use the Privacy & Safety area for privacy concerns. Use the Data & Account area for access, correction, deletion, and account-related requests.",
      "Parapost Network may limit access to, remove, preserve, or review relevant information when reasonably necessary to address the concern.",
    ],
  },
  {
    title: "9. Account Security and Suspicious Activity",
    paragraphs: [
      "Contact Help & Support when you believe your account may have been accessed without permission or when you notice suspicious account activity.",
      "Protect your password and login information. Do not share authentication details with another person.",
      "Parapost Network may review login events, session information, account activity, and related technical information when reasonably necessary to investigate a security concern.",
    ],
  },
  {
    title: "10. False, Misleading, and Abusive Reports",
    paragraphs: [
      "Do not knowingly submit false, misleading, repetitive, retaliatory, or abusive reports.",
      "Do not misuse reporting or support tools to harass another user, interfere with platform operations, or pressure Parapost Network into taking action without a legitimate basis.",
      "Parapost Network may limit access to reporting or support features, issue warnings, or take other reasonable action when these tools are misused.",
    ],
  },
  {
    title: "11. How Reports May Be Reviewed",
    paragraphs: [
      "Parapost Network may review reports, related content, account activity, moderation history, technical information, and other relevant context when reasonably necessary.",
      "Review may include support staff, moderators, administrators, automated tools, or service providers where appropriate and permitted.",
      "Parapost Network may request clarification or additional information when a report does not contain enough detail to assess the concern.",
    ],
  },
  {
    title: "12. Moderation Actions",
    paragraphs: [
      "The action taken after a report depends on the circumstances, available information, platform rules, potential harm, repeated conduct, and legal obligations.",
      "Parapost Network may take one or more reasonable actions after reviewing a report.",
    ],
    bullets: [
      "Remove or restrict content.",
      "Limit visibility or access to certain features.",
      "Issue a warning or guidance message.",
      "Restrict, suspend, or permanently terminate an account.",
      "Preserve relevant information for safety, security, dispute-resolution, or legal reasons.",
      "Take no action when the available information does not show a violation.",
      "Refer a serious concern to the appropriate authorities where required or reasonably necessary.",
    ],
  },
  {
    title: "13. Report Outcomes and Confidentiality",
    paragraphs: [
      "Parapost Network may provide a general update when a report has been reviewed, but it may not be able to share every detail about the review, another user’s account, moderation history, or any action taken.",
      "Reports are handled with reasonable care. Access may be limited to people and service providers who need the information to review the concern, protect users, support platform operations, or comply with legal obligations.",
      "Parapost Network cannot guarantee a specific outcome or response time for every report.",
    ],
  },
  {
    title: "14. Appeals and Follow-Up",
    paragraphs: [
      "Users may submit questions about moderation decisions through Help & Support.",
      "Where an appeal or follow-up review is available, Parapost Network may consider additional context, supporting information, the seriousness of the issue, moderation history, and platform rules.",
      "Submitting an appeal does not guarantee that a decision will be changed.",
    ],
  },
  {
    title: "15. Preservation and Retention of Safety Records",
    paragraphs: [
      "Parapost Network may retain limited reports, moderation records, warnings, suspensions, bans, appeals, blocking records, security records, and related safety information when reasonably necessary.",
      "Retention may support user protection, fraud prevention, repeated-abuse detection, dispute resolution, legal compliance, and platform integrity.",
      "Where appropriate, Parapost Network may restrict, anonymize, reduce, or limit access to retained information.",
    ],
  },
  {
    title: "16. Privacy Breaches and Security Incidents",
    paragraphs: [
      "Parapost Network may investigate suspected privacy breaches or security incidents involving personal information.",
      "Where applicable, Parapost Network may keep records, assess potential harm, notify affected users, report to the appropriate privacy authority, or take other steps required by law.",
      "Users should contact Help & Support promptly when they believe personal information may have been accessed, used, or disclosed without authorization.",
    ],
  },
  {
    title: "17. Lawful Requests and Cooperation",
    paragraphs: [
      "Parapost Network may preserve, review, or disclose information when reasonably necessary to comply with applicable law, court orders, lawful requests, or legal obligations.",
      "Parapost Network may also take reasonable steps to protect users, the platform, and the rights or safety of others.",
    ],
  },
  {
    title: "18. Updates to This Policy",
    paragraphs: [
      "Parapost Network may update this Safety & Reporting Policy as the platform evolves or when safety, legal, technical, or operational requirements change.",
      "When changes are significant, Parapost Network may provide notice through the service or by another reasonable method. The effective date at the top of this page will be updated.",
    ],
  },
  {
    title: "19. Contact",
    paragraphs: [
      "Submit safety concerns, privacy concerns, and possible Community Guidelines violations through the Privacy & Safety area.",
      "Use Help & Support when you need additional assistance or when the relevant in-app reporting option is unavailable.",
      "For urgent situations involving immediate danger, contact the appropriate local emergency service first.",
    ],
  },
];

export default function SafetyReportingPolicyPage() {
  return (
    <LegalDocumentPage
      eyebrow="Safety & Reporting Policy"
      title="Safety & Reporting Policy"
      summary="This policy explains how to report concerns, how Parapost Network may review reports, what safety tools are available, and what moderation actions may be taken."
      effectiveDate="June 10, 2026"
      sections={sections}
    />
  );
}
