import type { Session, User } from "@supabase/supabase-js";
import {
  publicConfiguration,
  type CourseBookClient,
} from "../../infrastructure/supabase/client";
import {
  AuthMode,
  loginCredentials,
  validateAuth,
  type AuthForm,
} from "./auth-form";
export interface AuthRepository {
  session(): Promise<Session | null>;
  subscribe(listener: (session: Session | null) => void): () => void;
  submit(
    form: AuthForm,
  ): Promise<{ user: User | null; confirmationRequired: boolean }>;
  signOut(): Promise<void>;
}
export function createAuthRepository(client: CourseBookClient): AuthRepository {
  return {
    async session() {
      const { data, error } = await client.auth.getSession();
      if (error) throw error;
      return data.session;
    },
    subscribe(listener) {
      const { data } = client.auth.onAuthStateChange((_event, session) => {
        listener(session);
      });
      return () => {
        data.subscription.unsubscribe();
      };
    },
    async signOut() {
      const { error } = await client.auth.signOut();
      if (error) throw error;
    },
    async submit(form) {
      const validation = validateAuth(form);
      if (validation) throw new Error(validation);
      if (form.mode === AuthMode.SignIn) {
        const { data, error } = await client.auth.signInWithPassword(
          loginCredentials(form),
        );
        if (error) throw error;
        return { user: data.user, confirmationRequired: false };
      }
      const username = form.identity.trim(),
        email = form.email.trim();
      const existing = await client
        .from("profiles")
        .select("id")
        .eq("username", username)
        .limit(1);
      if (existing.error) throw existing.error;
      if (existing.data.length)
        throw new Error("That username is already taken.");
      const { data, error } = await client.auth.signUp({
        email,
        password: form.password,
        options: {
          emailRedirectTo: publicConfiguration.authRedirect,
          data: { username, display_name: username },
        },
      });
      if (error) throw error;
      if (data.session && data.user) {
        const profile = await client.from("profiles").upsert(
          {
            id: data.user.id,
            email: data.user.email ?? email,
            username,
            display_name: username,
          },
          { onConflict: "id" },
        );
        if (profile.error) throw profile.error;
      }
      return { user: data.user, confirmationRequired: !data.session };
    },
  };
}
