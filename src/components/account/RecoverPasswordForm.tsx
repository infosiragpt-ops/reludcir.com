"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";

import styles from "./account.module.css";

type ResetRequestResponse = {
  message?: string;
  previewUrl?: string;
  error?: { message?: string };
};

export function RecoverPasswordForm() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ResetRequestResponse | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    setResult(null);

    try {
      const response = await fetch("/api/v1/auth/password-reset/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const payload = (await response.json()) as ResetRequestResponse;
      if (!response.ok) {
        throw new Error(payload.error?.message ?? "No pudimos procesar la solicitud.");
      }
      setResult(payload);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "No pudimos procesar la solicitud.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.authCard} aria-label="Recuperación de contraseña">
      <form className={styles.form} onSubmit={submit}>
        <label className={styles.field}>
          <span>Correo electrónico</span>
          <input
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        {error ? <p className={styles.errorMessage} role="alert">{error}</p> : null}
        {result?.message ? (
          <div className={styles.successMessage} role="status">
            <p>{result.message}</p>
            {result.previewUrl ? (
              <p>
                Entorno local: <a href={result.previewUrl}>abrir enlace de recuperación</a>.
              </p>
            ) : null}
          </div>
        ) : null}
        <button className={styles.primaryButton} type="submit" disabled={submitting}>
          {submitting ? "ENVIANDO…" : "CONTINUAR"}
        </button>
      </form>
      <p className={styles.legalCopy}>
        <Link href="/mi-cuenta-2">Volver a mi cuenta</Link>
      </p>
    </div>
  );
}
