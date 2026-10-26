/**
 * Purpose: User registration page route wrapper.
 * Role in the project: Serves the /signup URL route by rendering the unified AuthPage preset to 'signup' mode.
 * Key contents: SignUpPage component.
 * Talks to: frontend/app/login/page.tsx (AuthPage component).
 */

'use client';

import AuthPage from '../login/page';

/**
 * Sign Up view delegating to the unified AuthPage configured for new user registration.
 */
export default function SignUpPage() {
  return <AuthPage defaultMode="signup" />;
}
