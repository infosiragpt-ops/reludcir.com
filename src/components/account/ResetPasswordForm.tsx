"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";

import styles from "./account.module.css";

type ResetResponse = {
  message?: string;
  error?: { message?: string };
};

export function ResetPasswordForm({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");
    if (!token) {
      setError("Este enlace de recuperación está incompleto.");
      return;
    }
    if (password !== confirmation) {
      setError("Las contraseñas no coinciden.");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/v1/auth/password-reset/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const payload = (await response.json()) as ResetResponse;
      if (!response.ok) {
        throw new Error(payload.error?.message ?? "No pudimos cambiar la contraseña.");
      }
      setSuccess(payload.message ?? "Contraseña actualizada.");
      setPassword("");
      setConfirmation("");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "No pudimos cambiar la contraseña.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.authCard} aria-label="Crear nueva contraseña">
      <form className={styles.form} onSubmit={submit}>
        <label className={styles.field}>
          <span>Nueva contraseña</span>
          <input
            type="password"
            autoComplete="new-password"
            minLength={8}
            maxLength={128}
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        <label className={styles.field}>
          <span>Repite la contraseña</span>
          <input
            type="password"
            autoComplete="new-password"
            minLength={8}
            maxLength={128}
            required
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
          />
        </label>
        {error ? <p className={styles.errorMessage} role="alert">{error}</p> : null}
        {success ? <p className={styles.successMessage} role="status">{success}</p> : null}
        {success ? (
          <Link className={styles.primaryLink} href="/mi-cuenta-2">
            INICIAR SESIÓN
          </Link>
        ) : (
          <button className={styles.primaryButton} type="submit" disabled={submitting}>
            {submitting ? "ACTUALIZANDO…" : "GUARDAR CONTRASEÑA"}
          </button>
        )}
      </form>
    </div>
  );
}
