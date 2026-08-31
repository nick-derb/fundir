import type { Metadata } from 'next';
import { LegalShell, H2, P, UL, Note } from '@/components/legal-shell';

export const metadata: Metadata = {
  title: 'Privacy Policy · Fundir',
  description: 'How Fundir collects, uses, and protects your information.',
};

const A = { color: '#0C6B5A', textDecoration: 'none', fontWeight: 500 };

export default function PrivacyPage() {
  return (
    <LegalShell title="Privacy Policy" updated="August 31, 2026">
      <P>
        Fundir (&ldquo;Fundir,&rdquo; &ldquo;we,&rdquo; &ldquo;us&rdquo;) provides grant-intelligence
        software that helps nonprofit teams discover, evaluate, and track philanthropic funding
        opportunities. This Privacy Policy explains what information we collect when you use Fundir at{' '}
        <a href="https://fundir.ai" style={A}>fundir.ai</a>, how we use it, and the choices you have.
        By using Fundir you agree to this policy.
      </P>

      <H2>Information we collect</H2>
      <P>We collect only what we need to run the service:</P>
      <UL>
        <li><strong>Account &amp; authentication.</strong> When you sign in with Google or Microsoft, we receive your name, email address, and (if available) profile photo from that provider to create and secure your account.</li>
        <li><strong>Profile you provide.</strong> During setup you may add a display name, photo, job title, and the areas you want Fundir to prioritize.</li>
        <li><strong>Organization &amp; grant data.</strong> Funding opportunities, foundation records, notes, goals, and pipeline status that you or your organization add to the workspace.</li>
        <li><strong>Calendar data (read-only).</strong> If you connect Google Calendar or Microsoft 365, we read a limited window of your upcoming events (title, time, location, and whether it&rsquo;s an online meeting) to display your schedule next to your deadlines. We never create, edit, or delete calendar events, and we do not read message or email content.</li>
        <li><strong>Technical data.</strong> Standard server logs and a session cookie required to keep you signed in.</li>
      </UL>

      <H2>How we use information</H2>
      <UL>
        <li>Provide, maintain, and secure the Fundir service and your workspace.</li>
        <li>Personalize your dashboard (greeting, profile photo) and surface your upcoming calendar events alongside grant deadlines.</li>
        <li>Power in-app assistant and matching features that help you find and evaluate opportunities.</li>
        <li>Communicate with you about your account, access requests, and service updates.</li>
      </UL>
      <P>We do <strong>not</strong> sell your personal information, and we do <strong>not</strong> use your data for advertising.</P>

      <H2>Google user data &mdash; Limited Use</H2>
      <P>
        Fundir&rsquo;s use of information received from Google APIs adheres to the{' '}
        <a href="https://developers.google.com/terms/api-services-user-data-policy" style={A}>Google API Services User Data Policy</a>,
        including the <strong>Limited Use</strong> requirements. Specifically:
      </P>
      <UL>
        <li>We request read-only access to your Google Calendar (<code>calendar.readonly</code>) and your basic profile/email solely to show your upcoming schedule within Fundir.</li>
        <li>We use Google user data only to provide and improve these user-facing features, and only in ways disclosed here.</li>
        <li>We do not transfer or sell Google user data to third parties for advertising, market research, or other unrelated purposes.</li>
        <li>Humans do not read your Google Calendar data except where you explicitly ask us to, where required for security or to comply with law, or where the data has been aggregated and anonymized.</li>
      </UL>

      <H2>Microsoft account data</H2>
      <P>
        If you connect a Microsoft 365 account, Fundir requests read-only calendar access
        (<code>Calendars.Read</code>) and basic profile information for the same purpose: to display your
        upcoming events. The same limited-use principles above apply &mdash; we do not sell this data or
        use it for advertising, and we never write to your calendar or mailbox.
      </P>

      <H2>How we store and protect your data</H2>
      <P>
        Data is stored with our infrastructure providers (Supabase for the database, Vercel for
        hosting), encrypted in transit. OAuth tokens are held server-side and used only to fetch the
        data described above. Access is restricted through row-level security and server-side
        authorization, and calendar tokens can be revoked at any time from your Google or Microsoft
        account security settings.
      </P>

      <H2>Service providers we use</H2>
      <P>We rely on a small set of trusted subprocessors to operate Fundir:</P>
      <UL>
        <li><strong>Supabase</strong> &mdash; authentication and database.</li>
        <li><strong>Vercel</strong> &mdash; application hosting.</li>
        <li><strong>Google</strong> and <strong>Microsoft</strong> &mdash; sign-in and read-only calendar access you authorize.</li>
        <li><strong>AI providers (e.g. Anthropic, OpenAI)</strong> &mdash; to power assistant and matching features; prompts may include workspace content you interact with, and are not used by us to build advertising profiles.</li>
        <li><strong>Resend</strong> &mdash; transactional email (such as access-request notifications).</li>
      </UL>

      <H2>Data retention and deletion</H2>
      <P>
        We keep your information for as long as your account is active. You may disconnect a calendar
        at any time, or request deletion of your account and associated personal data by emailing us.
        We will delete or anonymize your data within a reasonable period, except where we must retain
        it to comply with legal obligations.
      </P>

      <H2>Your choices</H2>
      <UL>
        <li>Disconnect Google or Microsoft calendar access from within Fundir or from your provider&rsquo;s security settings.</li>
        <li>Request access to, correction of, or deletion of your personal data by contacting us.</li>
        <li>Revoke Fundir&rsquo;s access to your Google account at any time via <a href="https://myaccount.google.com/permissions" style={A}>Google Account permissions</a>.</li>
      </UL>

      <H2>Children&rsquo;s privacy</H2>
      <P>Fundir is a tool for nonprofit staff and is not directed to children under 13. We do not knowingly collect personal information from children.</P>

      <H2>Changes to this policy</H2>
      <P>We may update this policy from time to time. When we do, we&rsquo;ll revise the &ldquo;Last updated&rdquo; date above and, for material changes, take reasonable steps to notify you.</P>

      <H2>Contact us</H2>
      <Note>
        Questions about this policy or your data? Email <a href="mailto:nickderbis@gmail.com" style={A}>nickderbis@gmail.com</a>.
      </Note>
    </LegalShell>
  );
}
