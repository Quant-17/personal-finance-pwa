import { useCallback, useEffect, useRef, useState } from "react";
import type { ComponentType, FormEvent, ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import {
  ArrowLeft,
  LockKeyhole,
  LogOut,
  Moon,
  ShieldCheck,
  Sun,
  WifiOff,
} from "lucide-react";
import { Button } from "../components/ui/button";
import {
  clearDeviceSession,
  client,
  configurationError,
  finishRecovery,
  isRecovering,
} from "./client";

export function AuthGate({
  component: Workspace,
  theme,
  toggleTheme,
}: {
  component: ComponentType<{
    user: User;
    signOut: () => Promise<void>;
    theme: string;
    toggleTheme: () => void;
  }>;
  theme: string;
  toggleTheme: () => void;
}) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);
  const [online, setOnline] = useState(navigator.onLine);
  const [visible, setVisible] = useState(document.visibilityState !== "hidden");
  const [recovery, setRecovery] = useState(isRecovering);
  const [error, setError] = useState("");
  const epoch = useRef(0);
  const signingOut = useRef(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!client) return;
    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((event, next) => {
      if (signingOut.current && event !== "SIGNED_OUT") return;
      epoch.current++;
      setUser(null);
      setSession(next);
      setRevision((value) => value + 1);
      setChecking(!!next);
      if (event === "PASSWORD_RECOVERY" || isRecovering()) setRecovery(true);
    });
    const connection = () => {
      epoch.current++;
      setUser(null);
      setOnline(navigator.onLine);
    };
    const visibility = () => {
      epoch.current++;
      setUser(null);
      setVisible(document.visibilityState !== "hidden");
    };
    window.addEventListener("online", connection);
    window.addEventListener("offline", connection);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      subscription.unsubscribe();
      window.removeEventListener("online", connection);
      window.removeEventListener("offline", connection);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);
  useEffect(() => {
    if (!client || !session || !online || !visible) {
      client?.auth.stopAutoRefresh();
      return;
    }
    let active = true;
    const requestEpoch = ++epoch.current;
    client.auth.startAutoRefresh();
    void client.auth
      .getUser()
      .then(({ data, error: failure }) => {
        if (!active || requestEpoch !== epoch.current) return;
        if (
          failure ||
          !data.user ||
          data.user.is_anonymous ||
          !data.user.email_confirmed_at
        ) {
          setError(
            failure
              ? "Your session could not be verified. Please sign in again."
              : "Confirm your email before opening the workspace.",
          );
          setUser(null);
        } else {
          setError("");
          setUser(data.user);
        }
        setChecking(false);
      })
      .catch(() => {
        if (active && requestEpoch === epoch.current) {
          setUser(null);
          setChecking(false);
          setError("Unable to verify your session. Please try again.");
        }
      });
    return () => {
      active = false;
    };
  }, [session, online, visible, revision]);
  const signOut = useCallback(async () => {
    signingOut.current = true;
    clearDeviceSession();
    client?.auth.stopAutoRefresh();
    epoch.current++;
    setUser(null);
    setSession(null);
    setRecovery(false);
    setChecking(false);
    try {
      await client?.auth.signOut({ scope: "local" });
    } catch {
      /* Device session is cleared even if revocation is unreachable. */
    } finally {
      clearDeviceSession();
      window.location.replace(
        window.location.origin + window.location.pathname + "#signin",
      );
    }
  }, []);
  if (configurationError || !client)
    return (
      <AuthLayout theme={theme} toggleTheme={toggleTheme}>
        <LockKeyhole size={28} />
        <h1>Private workspace setup</h1>
        <p>{configurationError}</p>
        <p className="small-note">
          Your workspace stays locked until its configuration is valid.
        </p>
      </AuthLayout>
    );
  if (!online || !visible)
    return (
      <AuthLayout theme={theme} toggleTheme={toggleTheme}>
        <WifiOff size={28} />
        <h1>Workspace locked</h1>
        <p>
          {!online
            ? "Connect to the internet to verify your session and access private records."
            : "Return to this app to verify your session."}
        </p>
        <p className="small-note">
          Financial records are never saved to the offline cache.
        </p>
        <Button variant="outline" onClick={() => void signOut()}>
          <LogOut size={16} />
          Sign out on this device
        </Button>
      </AuthLayout>
    );
  if (checking)
    return (
      <AuthLayout theme={theme} toggleTheme={toggleTheme}>
        <ShieldCheck size={30} />
        <h1>Verifying your session</h1>
        <p role="status">Opening your private workspace…</p>
      </AuthLayout>
    );
  if (recovery && user)
    return (
      <AuthLayout theme={theme} toggleTheme={toggleTheme}>
        <AuthForm
          mode="password"
          onPasswordChanged={() => {
            finishRecovery();
            setRecovery(false);
          }}
        />
      </AuthLayout>
    );
  if (user)
    return (
      <Workspace
        key={user.id}
        user={user}
        signOut={signOut}
        theme={theme}
        toggleTheme={toggleTheme}
      />
    );
  return (
    <AuthLayout theme={theme} toggleTheme={toggleTheme}>
      {error && (
        <div className="form-error" role="alert">
          {error}
        </div>
      )}
      <AuthForm />
    </AuthLayout>
  );
}
function AuthLayout({
  children,
  theme,
  toggleTheme,
}: {
  children: ReactNode;
  theme: string;
  toggleTheme: () => void;
}) {
  return (
    <div className="auth-page">
      <header>
        <a href="#signin" className="brand">
          folio<span className="brand-dot">.</span>
        </a>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Toggle appearance"
          onClick={toggleTheme}
        >
          {theme === "dark" ? <Sun size={20} /> : <Moon size={20} />}
        </Button>
      </header>
      <main className="auth-card card">{children}</main>
      <footer>
        <ShieldCheck size={14} />
        Your workspace. Your records. Your control.
      </footer>
    </div>
  );
}
function AuthForm({
  mode: initial = "signin",
  onPasswordChanged,
}: {
  mode?: "signin" | "password";
  onPasswordChanged?: () => void;
}) {
  const [mode, setMode] = useState<"signin" | "signup" | "reset" | "password">(
    initial,
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!client) return;
    setPending(true);
    setMessage("");
    setError("");
    try {
      if ((mode === "signup" || mode === "password") && password.length < 12)
        throw new Error("Use a password with at least 12 characters.");
      const redirectTo = window.location.origin + "/";
      if (mode === "signin") {
        const { error } = await client.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
      }
      if (mode === "signup") {
        const { error } = await client.auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: redirectTo },
        });
        if (error) throw error;
        setMessage(
          "Check your email to confirm your account. Supabase email-delivery limits may apply.",
        );
      }
      if (mode === "reset") {
        const { error } = await client.auth.resetPasswordForEmail(
          email.trim(),
          { redirectTo },
        );
        if (error) throw error;
        setMessage(
          "If the account is eligible, a password-reset link has been requested. Check your inbox.",
        );
      }
      if (mode === "password") {
        const { error } = await client.auth.updateUser({ password });
        if (error) throw error;
        setMessage("Password updated.");
        onPasswordChanged?.();
      }
      setPassword("");
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Unable to complete the request. Please try again.",
      );
    } finally {
      setPending(false);
    }
  };
  const changeMode = (next: typeof mode) => {
    setMode(next);
    setError("");
    setMessage("");
    setPassword("");
  };
  return (
    <>
      <span className="auth-emblem">
        <LockKeyhole size={25} />
      </span>
      <span className="eyebrow">A PRIVATE SPACE FOR YOUR MONEY</span>
      <h1>
        {mode === "signup"
          ? "Start your own Folio."
          : mode === "reset"
            ? "Find your way back."
            : mode === "password"
              ? "Set a new password."
              : "A little peace of mind."}
      </h1>
      <p>
        {mode === "signup"
          ? "Create an account. Your new workspace starts empty."
          : mode === "reset"
            ? "Request a secure password-reset link."
            : mode === "password"
              ? "Choose at least 12 characters."
              : "Sign in to your personal finance workspace."}
      </p>
      {error && (
        <div className="form-error" role="alert">
          {error}
        </div>
      )}
      {message && (
        <div className="form-success" role="status">
          {message}
        </div>
      )}
      <form onSubmit={(event) => void submit(event)} className="auth-form">
        {mode !== "password" && (
          <label>
            Email address
            <input
              type="email"
              autoComplete="email"
              required
              maxLength={254}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
        )}
        {mode !== "reset" && (
          <label>
            Password
            <input
              type="password"
              autoComplete={
                mode === "signin" ? "current-password" : "new-password"
              }
              required
              minLength={mode === "signin" ? 1 : 12}
              maxLength={128}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
        )}
        <Button type="submit" disabled={pending}>
          {pending
            ? "Please wait…"
            : mode === "signup"
              ? "Create account"
              : mode === "reset"
                ? "Send reset link"
                : mode === "password"
                  ? "Update password"
                  : "Sign in"}
        </Button>
      </form>
      <div className="auth-links">
        {mode === "signin" ? (
          <>
            <button onClick={() => changeMode("reset")}>
              Forgot password?
            </button>
            <button onClick={() => changeMode("signup")}>
              Create account <span>→</span>
            </button>
          </>
        ) : (
          mode !== "password" && (
            <button onClick={() => changeMode("signin")}>
              <ArrowLeft size={14} />
              Back to sign in
            </button>
          )
        )}
      </div>
      <p className="small-note">
        Authentication uses Supabase. Financial records are isolated by database
        ownership policies.
      </p>
    </>
  );
}
