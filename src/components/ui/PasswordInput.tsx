"use client";

import { useState } from "react";

interface PasswordInputProps {
  name: string;
  required?: boolean;
  minLength?: number;
  autoComplete?: string;
  className: string;
}

function EyeIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M2.25 12s3.75-7.5 9.75-7.5 9.75 7.5 9.75 7.5-3.75 7.5-9.75 7.5S2.25 12 2.25 12Z"
      />
      <circle cx="12" cy="12" r="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 3l18 18M10.73 5.08A10.43 10.43 0 0 1 12 5c6 0 9.75 7 9.75 7a13.16 13.16 0 0 1-2.11 2.88M6.61 6.61C4.14 8.26 2.25 11 2.25 11s2.25 5.5 9.75 5.5c1.49 0 2.8-.26 3.94-.69M9.88 9.88a3 3 0 0 0 4.24 4.24"
      />
    </svg>
  );
}

/**
 * Campo de senha com alternância de visibilidade — mesmo `inputClass` já
 * usado em cadastro/login/atualizar-senha, só com `pr-11` extra pra não
 * sobrepor o botão do olho. Sempre não-controlado (sem `value`/`onChange`):
 * trocar `type` no mesmo nó não reseta o que foi digitado, porque o React
 * nunca desmonta o `<input>` ao alternar — só troca o atributo.
 */
export function PasswordInput({
  name,
  required,
  minLength,
  autoComplete,
  className,
}: PasswordInputProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <input
        type={visible ? "text" : "password"}
        name={name}
        required={required}
        minLength={minLength}
        autoComplete={autoComplete}
        className={`${className} pr-11`}
      />
      <button
        type="button"
        onClick={() => setVisible((current) => !current)}
        aria-label={visible ? "Ocultar senha" : "Mostrar senha"}
        aria-pressed={visible}
        className="absolute inset-y-0 right-0 flex items-center px-3 text-mosaico-ink-soft transition-colors hover:text-mosaico-ink"
      >
        {visible ? <EyeOffIcon /> : <EyeIcon />}
      </button>
    </div>
  );
}
