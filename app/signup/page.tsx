import { redirect } from 'next/navigation';

// Account creation is closed during the private beta (CYC-only). Anyone landing
// on /signup is sent to the Request Access page.
export default function SignupPage() {
  redirect('/onboarding');
}
