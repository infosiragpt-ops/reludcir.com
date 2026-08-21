"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, KeyboardEvent, useState } from "react";

import { googleLoginErrorMessage } from "@/lib/google-oauth";

import styles from "./account.module.css";

type AuthMode = "login" | "register";

type ApiPayload = {
  error?: string | { code?: string; field?: string; message?: string };
  message?: string;
  session?: { expiresAt?: string };
  user?: { id?: number; email?: string; role?: string };
};

function getErrorMessage(payload: ApiPayload | null, fallback: string) {
  if (typeof payload?.error === "string") {
    return payload.error;
  }

  if (payload?.error && typeof payload.error.message === "string") {
    return payload.error.message;
  }

  if (typeof payload?.message === "string") {
    return payload.message;
  }

  return fallback;
}

async function readPayload(response: Response): Promise<ApiPayload | null> {
  const contentType = response.headers.get("content-type") ?? "";

  if (!contentType.includes("application/json")) {
    return null;
  }

  return (await response.json()) as ApiPayload;
}

export function AuthPanel({ initialError }: { initialError?: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>("login");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const initialGoogleError = googleLoginErrorMessage(initialError);
  const [feedback, setFeedback] = useState<
    { kind: "error" | "success"; message: string } | undefined
  >(initialGoogleError ? { kind: "error", message: initialGoogleError } : undefined);

  function selectMode(nextMode: AuthMode) {
    setMode(nextMode);
    setFeedback(undefined);
  }

  function handleTabKey(event: KeyboardEvent<HTMLButtonElement>) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const nextMode: AuthMode =
      event.key === "ArrowLeft" || event.key === "Home" ? "login" : "register";
    selectMode(nextMode);
    document.getElementById(`auth-${nextMode}-tab`)?.focus();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const email = String(formData.get("email") ?? "").trim();
    const password = String(formData.get("password") ?? "");

    if (mode === "register") {
      const confirmation = String(formData.get("passwordConfirmation") ?? "");

      if (password !== confirmation) {
        setFeedback({
          kind: "error",
          message: "Las contraseñas no coinciden.",
        });
        return;
      }
    }

    const endpoint =
      mode === "login" ? "/api/v1/auth/login" : "/api/v1/auth/register";
    const body =
      mode === "login"
        ? {
            email,
            password,
            remember: formData.get("remember") === "on",
          }
        : {
            firstName: String(formData.get("firstName") ?? "").trim(),
            lastName: String(formData.get("lastName") ?? "").trim(),
            phoneE164: String(formData.get("phoneE164") ?? "").trim() || undefined,
            email,
            password,
          };

    setIsSubmitting(true);
    setFeedback(undefined);

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        credentials: "include",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      const payload = await readPayload(response);

      if (!response.ok) {
        throw new Error(
          getErrorMessage(
            payload,
            mode === "login"
              ? "No pudimos iniciar sesión. Revisa tus datos e inténtalo nuevamente."
              : "No pudimos crear tu cuenta. Revisa los datos e inténtalo nuevamente.",
          ),
        );
      }

      const privileged = payload?.user?.role === "admin" || payload?.user?.role === "support";
      setFeedback({
        kind: "success",
        message:
          privileged
            ? "Sesión iniciada. Abriendo el panel de operaciones…"
            : mode === "login"
              ? "Sesión iniciada. Abriendo tus reservas…"
              : "Tu cuenta fue creada. Abriendo tus reservas…",
      });
      router.replace(privileged ? "/admin" : "/mis-reservas");
      router.refresh();
    } catch (error) {
      setFeedback({
        kind: "error",
        message:
          error instanceof Error
            ? error.message
            : "Ocurrió un error inesperado. Inténtalo nuevamente.",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className={styles.authPanel} aria-labelledby="account-access-title">
      <div className={styles.authIntro}>
        <h1 id="account-access-title">Administra tus servicios de limpieza</h1>
        <p>
          Inicia sesión para revisar reservas, reprogramar una visita o reportar
          cualquier incidencia. Si es tu primera vez, crea tu cuenta en pocos pasos.
        </p>
        <ul className={styles.benefitList}>
          <li>Consulta fechas, horarios y estado de cada servicio.</li>
          <li>Reprograma o cancela dentro de las políticas vigentes.</li>
          <li>Mantén en un solo lugar el historial de tus reservas.</li>
        </ul>
      </div>

      <div className={styles.authCard}>
        <div className={styles.tabs} role="tablist" aria-label="Acceso a la cuenta">
          <button
            id="auth-login-tab"
            className={mode === "login" ? styles.activeTab : styles.tab}
            type="button"
            role="tab"
            aria-selected={mode === "login"}
            aria-controls="auth-form-panel"
            tabIndex={mode === "login" ? 0 : -1}
            onKeyDown={handleTabKey}
            onClick={() => selectMode("login")}
          >
            Acceder
          </button>
          <button
            id="auth-register-tab"
            className={mode === "register" ? styles.activeTab : styles.tab}
            type="button"
            role="tab"
            aria-selected={mode === "register"}
            aria-controls="auth-form-panel"
            tabIndex={mode === "register" ? 0 : -1}
            onKeyDown={handleTabKey}
            onClick={() => selectMode("register")}
          >
            Crear cuenta
          </button>
        </div>

        <div
          id="auth-form-panel"
          role="tabpanel"
          aria-labelledby={`auth-${mode}-tab`}
        >
          <h2 className={styles.formTitle}>
            {mode === "login" ? "Bienvenido nuevamente" : "Crea tu cuenta"}
          </h2>
          <p className={styles.formDescription}>
            {mode === "login"
              ? "Ingresa con el correo que utilizaste al reservar."
              : "Usaremos estos datos para identificar y gestionar tus reservas."}
          </p>

          <form className={styles.form} onSubmit={handleSubmit}>
            {mode === "register" ? (
              <div className={styles.fieldGrid}>
                <label className={styles.field}>
                  <span>Nombres</span>
                  <input
                    name="firstName"
                    type="text"
                    autoComplete="given-name"
                    required
                  />
                </label>
                <label className={styles.field}>
                  <span>Apellidos</span>
                  <input
                    name="lastName"
                    type="text"
                    autoComplete="family-name"
                    required
                  />
                </label>
              </div>
            ) : null}

            {mode === "register" ? (
              <label className={styles.field}>
                <span>Teléfono (opcional)</span>
                <input
                  name="phoneE164"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="+51 999 999 999"
                />
              </label>
            ) : null}

            <label className={styles.field}>
              <span>Correo electrónico</span>
              <input name="email" type="email" autoComplete="email" required />
            </label>

            <label className={styles.field}>
              <span>Contraseña</span>
              <input
                name="password"
                type="password"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                minLength={8}
                required
              />
            </label>

            {mode === "register" ? (
              <label className={styles.field}>
                <span>Confirmar contraseña</span>
                <input
                  name="passwordConfirmation"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  required
                />
              </label>
            ) : (
              <>
                <label className={styles.checkField}>
                  <input name="remember" type="checkbox" />
                  <span>Mantener mi sesión iniciada</span>
                </label>
                <p className={styles.legalCopy}>
                  <Link href="/recuperar-contrasena">¿Olvidaste tu contraseña?</Link>
                </p>
              </>
            )}

            {feedback ? (
              <p
                className={
                  feedback.kind === "error" ? styles.errorMessage : styles.successMessage
                }
                role={feedback.kind === "error" ? "alert" : "status"}
                aria-live="polite"
              >
                {feedback.message}
              </p>
            ) : null}

            <button className={styles.primaryButton} type="submit" disabled={isSubmitting}>
              {isSubmitting
                ? "Procesando…"
                : mode === "login"
                  ? "Acceder a mis reservas"
                  : "Crear cuenta"}
            </button>
          </form>

          <p className={styles.authDivider} role="separator">
            o
          </p>
          <form action="/api/v1/auth/google/start" method="get">
            <button className={styles.oauthButton} type="submit">
              Continuar con Google
            </button>
          </form>

          <p className={styles.legalCopy}>
            Al crear una cuenta aceptas el tratamiento de tus datos según nuestra{" "}
            <Link href="/privacidad">política de privacidad</Link>.
          </p>
        </div>
      </div>
    </section>
  );
}
