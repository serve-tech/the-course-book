export enum AuthMode {
  SignIn = "signin",
  SignUp = "signup",
}
export interface AuthForm {
  mode: AuthMode;
  identity: string;
  email: string;
  password: string;
}
export function validateAuth(form: AuthForm): string | null {
  const identity = form.identity.trim(),
    email = form.email.trim();
  if (form.mode === AuthMode.SignUp) {
    if (!identity || !email || !form.password)
      return "Enter a username, email, and password.";
    if (form.password.length < 6)
      return "Password must be at least 6 characters.";
    if (!/^[A-Za-z0-9_]{3,24}$/.test(identity))
      return "Username must be 3–24 characters using letters, numbers, or _.";
  } else {
    if (!identity || !form.password) return "Enter your email and password.";
    if (form.password.length < 6)
      return "Password must be at least 6 characters.";
  }
  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
      form.mode === AuthMode.SignUp ? email : identity,
    )
  )
    return "Enter a valid email address.";
  return null;
}
export function loginCredentials(form: AuthForm): {
  email: string;
  password: string;
} {
  return { email: form.identity.trim(), password: form.password };
}
