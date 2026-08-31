import type { Metadata } from 'next';
import { LegalShell, H2, P, UL, Note } from '@/components/legal-shell';

export const metadata: Metadata = {
  title: 'Terms of Service · Fundir',
  description: 'The terms that govern your use of Fundir.',
};

const A = { color: '#0C6B5A', textDecoration: 'none', fontWeight: 500 };

export default function TermsPage() {
  return (
    <LegalShell title="Terms of Service" updated="August 31, 2026">
      <P>
        These Terms of Service (&ldquo;Terms&rdquo;) govern your access to and use of Fundir, the
        grant-intelligence software available at <a href="https://fundir.ai" style={A}>fundir.ai</a>{' '}
        (the &ldquo;Service&rdquo;). By accessing or using the Service, you agree to these Terms. If you
        are using Fundir on behalf of an organization, you represent that you are authorized to accept
        these Terms on its behalf.
      </P>

      <H2>The service</H2>
      <P>
        Fundir helps nonprofit teams discover, evaluate, and track philanthropic funding opportunities,
        and can connect to your Google or Microsoft calendar (read-only) to show your schedule alongside
        deadlines. We may add, change, or remove features over time.
      </P>

      <H2>Accounts and eligibility</H2>
      <UL>
        <li>You must sign in through a supported provider (Google or Microsoft) and keep your account credentials secure.</li>
        <li>You are responsible for activity that occurs under your account and for the accuracy of information you add.</li>
        <li>Access to a given workspace is granted by that organization; you agree to use it only as authorized.</li>
      </UL>

      <H2>Acceptable use</H2>
      <P>You agree not to:</P>
      <UL>
        <li>Use the Service unlawfully, or in a way that infringes others&rsquo; rights.</li>
        <li>Attempt to gain unauthorized access to the Service, other accounts, or our systems.</li>
        <li>Interfere with or disrupt the integrity or performance of the Service.</li>
        <li>Reverse engineer, scrape, or resell the Service except as permitted by law.</li>
      </UL>

      <H2>Third-party services</H2>
      <P>
        When you connect Google or Microsoft, your use of those services is also governed by their
        respective terms and privacy policies. You can revoke Fundir&rsquo;s access to those accounts at
        any time through the provider&rsquo;s security settings. We are not responsible for third-party
        services.
      </P>

      <H2>Your data and privacy</H2>
      <P>
        Your use of the Service is subject to our <a href="/privacy" style={A}>Privacy Policy</a>, which
        explains what we collect and how we use it. You retain ownership of the content you add to your
        workspace; you grant us the limited rights needed to host and provide the Service to you.
      </P>

      <H2>Intellectual property</H2>
      <P>
        The Service, including its software, design, and content we provide, is owned by Fundir and
        protected by intellectual-property laws. These Terms do not grant you any right to our
        trademarks or branding.
      </P>

      <H2>Disclaimers</H2>
      <P>
        The Service is provided <strong>&ldquo;as is&rdquo;</strong> and <strong>&ldquo;as
        available&rdquo;</strong> without warranties of any kind, express or implied. Grant listings,
        matches, scores, and other information are provided for planning purposes and may be incomplete
        or inaccurate; Fundir does not guarantee funding outcomes and does not provide legal, financial,
        or professional advice. You are responsible for verifying opportunities and requirements before
        acting on them.
      </P>

      <H2>Limitation of liability</H2>
      <P>
        To the maximum extent permitted by law, Fundir will not be liable for any indirect, incidental,
        special, consequential, or punitive damages, or for any loss of profits, data, or goodwill,
        arising from your use of the Service. Our total liability for any claim relating to the Service
        will not exceed the amount you paid us for the Service in the twelve months before the claim (or
        USD $100 if you paid nothing).
      </P>

      <H2>Termination</H2>
      <P>
        You may stop using the Service at any time. We may suspend or terminate access if you violate
        these Terms or to protect the Service. Provisions that by their nature should survive termination
        (such as disclaimers and limitations of liability) will survive.
      </P>

      <H2>Changes to these terms</H2>
      <P>
        We may update these Terms from time to time. When we do, we&rsquo;ll revise the &ldquo;Last
        updated&rdquo; date above, and material changes will take effect when posted. Your continued use
        of the Service means you accept the updated Terms.
      </P>

      <H2>Governing law</H2>
      <P>
        These Terms are governed by the laws of the State of Illinois, USA, without regard to its
        conflict-of-laws rules. Any disputes will be subject to the courts located in Cook County,
        Illinois.
      </P>

      <H2>Contact us</H2>
      <Note>
        Questions about these Terms? Email <a href="mailto:nickderbis@gmail.com" style={A}>nickderbis@gmail.com</a>.
      </Note>
    </LegalShell>
  );
}
