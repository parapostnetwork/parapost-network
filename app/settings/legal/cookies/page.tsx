import LegalDocumentPage, {
  type LegalDocumentSection,
} from "@/components/settings/LegalDocumentPage";

const sections: LegalDocumentSection[] = [
  {
    title: "1. Purpose of This Cookie Policy",
    paragraphs: [
      "This Cookie Policy explains how Parapost Network may use cookies, local storage, session storage, and similar technologies when you access or use the platform.",
      "These technologies may help Parapost Network operate the service, keep accounts secure, remember certain settings, deliver platform features, and improve reliability.",
      "This policy should be read together with the Parapost Network Privacy Policy and Terms of Service.",
    ],
  },
  {
    title: "2. What Cookies and Similar Technologies Are",
    paragraphs: [
      "Cookies are small text files that a website may place on your browser or device. Similar technologies may store or access limited information through your browser, device, or app environment.",
      "Parapost Network may also use local storage, session storage, authentication tokens, and related browser technologies where reasonably necessary to operate platform features.",
      "The exact technologies used may change as the platform evolves.",
    ],
  },
  {
    title: "3. Essential Technologies",
    paragraphs: [
      "Parapost Network may use essential cookies and similar technologies that are reasonably necessary to provide the service.",
      "These technologies may support login sessions, authentication, security, account protection, page delivery, platform navigation, user preferences, and technical reliability.",
      "Some platform features may not work correctly if essential technologies are blocked or removed.",
    ],
  },
  {
    title: "4. Authentication and Login Sessions",
    paragraphs: [
      "Parapost Network may use cookies, tokens, local storage, or similar technologies to help keep users signed in and to recognize an authenticated session.",
      "These technologies may also help protect accounts, detect unusual activity, and support secure access to features that require a signed-in account.",
      "Signing out, clearing browser data, or changing browser settings may end an active session or require you to sign in again.",
    ],
  },
  {
    title: "5. Security and Fraud Prevention",
    paragraphs: [
      "Parapost Network may use cookies and similar technologies to support account security, prevent abuse, investigate suspicious activity, and protect the platform.",
      "This may include information reasonably necessary to identify sessions, detect technical issues, limit misuse, or support security monitoring.",
    ],
  },
  {
    title: "6. Preferences and User Experience",
    paragraphs: [
      "Parapost Network may use local storage, session storage, or similar technologies to remember certain settings and improve your experience.",
      "Examples may include interface preferences, display settings, navigation state, or other choices needed to make features work as expected.",
    ],
  },
  {
    title: "7. Performance and Reliability",
    paragraphs: [
      "Parapost Network may use limited technical information to monitor platform performance, troubleshoot errors, improve reliability, and understand whether features are working correctly.",
      "If Parapost Network introduces non-essential analytics technologies, additional notice or consent options may be provided where required.",
    ],
  },
  {
    title: "8. Analytics Technologies",
    paragraphs: [
      "Parapost Network may introduce analytics tools in the future to better understand how users interact with the platform and to improve features, reliability, and performance.",
      "Where analytics technologies are not essential to operating the service, Parapost Network may provide additional notice, settings, or consent choices where required before using them.",
      "This policy may be updated when analytics tools are introduced or changed.",
    ],
  },
  {
    title: "9. Advertising and Marketing Technologies",
    paragraphs: [
      "Parapost Network may introduce advertising, sponsorship, or marketing features in the future.",
      "If non-essential advertising or marketing technologies are introduced, Parapost Network may provide additional notice, settings, or consent choices where required.",
      "Parapost Network will update this policy when these practices become active or materially change.",
    ],
  },
  {
    title: "10. Third-Party Service Providers",
    paragraphs: [
      "Parapost Network may use service providers to support hosting, authentication, storage, deployment, security, domain services, and related technical operations.",
      "Depending on the active configuration, service providers may use cookies or similar technologies where reasonably necessary to provide their services, protect their systems, or support platform operations.",
      "Parapost Network may update its service providers as the platform evolves.",
    ],
  },
  {
    title: "11. Browser and Device Controls",
    paragraphs: [
      "Most browsers allow you to view, block, restrict, or delete cookies and certain stored data through browser settings.",
      "You may also be able to clear local storage, session storage, or site data through your browser or device settings.",
      "Blocking or deleting essential technologies may affect login sessions, security features, saved preferences, and the correct operation of parts of Parapost Network.",
    ],
  },
  {
    title: "12. Consent and User Choices",
    paragraphs: [
      "Parapost Network may use essential technologies where reasonably necessary to provide, secure, and maintain the service.",
      "Where non-essential technologies require consent, Parapost Network may provide a notice, preference setting, or other reasonable method for users to make a choice.",
      "Users may be able to change certain choices later through available settings, browser controls, or other options provided by the platform.",
    ],
  },
  {
    title: "13. Young Users",
    paragraphs: [
      "Parapost Network is intended for users who meet the minimum-age requirements stated in the Terms of Service.",
      "Parapost Network will consider age-appropriate privacy and safety practices when introducing non-essential tracking, analytics, advertising, or marketing technologies.",
    ],
  },
  {
    title: "14. Retention",
    paragraphs: [
      "The length of time that cookies and similar technologies remain active may vary depending on their purpose.",
      "Some technologies may expire when you close your browser or end a session. Others may remain for a limited period to support security, preferences, or platform operations.",
      "Parapost Network will retain information only for as long as reasonably necessary for the relevant purpose, subject to security, legal, and technical requirements.",
    ],
  },
  {
    title: "15. Updates to This Cookie Policy",
    paragraphs: [
      "Parapost Network may update this Cookie Policy as the platform evolves or when technical, legal, privacy, advertising, or operational requirements change.",
      "When changes are significant, Parapost Network may provide notice through the service or by another reasonable method. The effective date at the top of this page will be updated.",
    ],
  },
  {
    title: "16. Contact",
    paragraphs: [
      "Questions about cookies, similar technologies, privacy choices, or this policy may be submitted through the in-app Help & Support area.",
      "Users may also use the Privacy & Safety area for privacy concerns and the Data & Account area for access, correction, deletion, and account-related requests.",
    ],
  },
];

export default function CookiePolicyPage() {
  return (
    <LegalDocumentPage
      eyebrow="Cookie Policy"
      title="Cookie Policy"
      summary="This policy explains how Parapost Network may use cookies and similar technologies for login sessions, security, preferences, performance, and future platform features."
      effectiveDate="June 10, 2026"
      sections={sections}
    />
  );
}
