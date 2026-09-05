/**
 * FEAT-058: Provider Connections — Create Connection Dialog
 *
 * Modal overlay for creating a new provider connection.
 * Supports known-provider, custom OpenAI-compatible, and Pi Session paths.
 * Secret input is write-only, masked, never echoed.
 * Pi Session shows no API key field.
 */

import React, { useState, useEffect, useCallback } from "react";
import type {
  ProviderConnectionKind,
  KnownProviderId,
  ProviderIdentifier,
  CreateProviderConnectionInput,
} from "@hepha/shared";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const KNOWN_PROVIDERS: Array<{ id: KnownProviderId; label: string }> = [
  { id: "openai", label: "OpenAI" },
  { id: "deepseek", label: "DeepSeek" },
  { id: "openai-codex", label: "OpenAI Codex" },
];

const ENDPOINT_PRESETS: Record<string, string> = {
  openai: "https://api.openai.com/v1",
  deepseek: "https://api.deepseek.com",
  "openai-codex": "https://api.openai.com/v1",
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ConnectionCreateDialogProps {
  readonly onClose: () => void;
  readonly onCreate: (input: CreateProviderConnectionInput) => Promise<void>;
  readonly isCreating: boolean;
  readonly error: string | null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ConnectionCreateDialog({
  onClose,
  onCreate,
  isCreating,
  error,
}: ConnectionCreateDialogProps) {
  const [kind, setKind] = useState<ProviderConnectionKind>("known");
  const [knownProviderId, setKnownProviderId] = useState<KnownProviderId>("openai");
  const [customLabel, setCustomLabel] = useState("");
  const [label, setLabel] = useState("");
  const [endpointUrl, setEndpointUrl] = useState("https://api.openai.com/v1");
  const [secretValue, setSecretValue] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  // Close on Escape
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && !e.defaultPrevented && !isCreating) {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, isCreating]);

  // Reset form when kind changes
  useEffect(() => {
    setValidationError(null);
    if (kind === "pi_session") {
      setSecretValue("");
    }
  }, [kind]);

  // Apply known-provider endpoint preset when known provider selection changes
  useEffect(() => {
    if (kind === "known" && ENDPOINT_PRESETS[knownProviderId]) {
      setEndpointUrl(ENDPOINT_PRESETS[knownProviderId]);
    }
  }, [kind, knownProviderId]);

  // Derive auto-label when kind is "known" and label is not manually touched
  useEffect(() => {
    if (kind === "known" && !touched["label"]) {
      const known = KNOWN_PROVIDERS.find((p) => p.id === knownProviderId);
      if (known) {
        setLabel(known.label);
      }
    }
  }, [kind, knownProviderId, touched]);

  const validate = useCallback((): string | null => {
    if (!label.trim()) {
      return "Connection label is required.";
    }
    if (!endpointUrl.trim()) {
      return "Endpoint URL is required.";
    }
    try {
      const url = new URL(endpointUrl);
      if (!url.protocol.startsWith("http")) {
        return "Endpoint URL must use HTTP or HTTPS.";
      }
    } catch {
      return "Invalid endpoint URL.";
    }
    if (kind !== "pi_session" && !secretValue.trim()) {
      return "Secret value is required for this connection type.";
    }
    if (kind === "custom" && !customLabel.trim()) {
      return "Custom provider label is required.";
    }
    return null;
  }, [label, endpointUrl, kind, secretValue, customLabel]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const err = validate();
    setValidationError(err);
    if (err) return;

    let provider: ProviderIdentifier;
    if (kind === "known") {
      provider = { kind: "known", providerId: knownProviderId };
    } else if (kind === "custom") {
      provider = { kind: "custom", label: customLabel.trim() };
    } else {
      provider = { kind: "pi_session" };
    }

    const input: CreateProviderConnectionInput = {
      kind,
      label: label.trim(),
      provider,
      endpointUrl: endpointUrl.trim(),
      ...(kind !== "pi_session" && secretValue.trim()
        ? { secretValue: secretValue.trim() }
        : {}),
    };

    // Capture promise, clear secret immediately, then await
    // Clearing before settlement prevents secret retention in component state
    // even during slow or failed requests.
    const createPromise = onCreate(input);
    setSecretValue("");
    try {
      await createPromise;
    } catch {
      // Error handled by parent via `error` prop — do not suppress silently
    }
  }

  function handleLabelChange(value: string) {
    setTouched((prev) => ({ ...prev, label: true }));
    setLabel(value);
  }

  const displayError = error ?? validationError;

  return (
    <div
      className="provider-conn-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Create provider connection"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isCreating) {
          onClose();
        }
      }}
    >
      <div className="provider-conn-modal">
        <div className="provider-conn-header">
          <div className="provider-conn-kicker">New Connection</div>
          <h2>Configure Provider Connection</h2>
          <p>Set up a known, custom, or Pi Session provider endpoint.</p>
          <button
            className="provider-conn-close-btn"
            onClick={onClose}
            disabled={isCreating}
            aria-label="Close dialog"
            type="button"
          >
            &times;
          </button>
        </div>

        <form className="provider-conn-form" onSubmit={handleSubmit}>
          {/* Connection Kind Selection */}
          <div className="provider-conn-field-group">
            <label htmlFor="conn-kind">Connection Type</label>
            <select
              id="conn-kind"
              value={kind}
              onChange={(e) => setKind(e.target.value as ProviderConnectionKind)}
              disabled={isCreating}
            >
              <option value="known">Known Provider</option>
              <option value="custom">Custom (OpenAI-Compatible)</option>
              <option value="pi_session">Pi Session</option>
            </select>
          </div>

          {/* Known Provider Selector */}
          {kind === "known" && (
            <div className="provider-conn-field-group">
              <label htmlFor="conn-known-provider">Known Provider</label>
              <select
                id="conn-known-provider"
                value={knownProviderId}
                onChange={(e) => setKnownProviderId(e.target.value as KnownProviderId)}
                disabled={isCreating}
              >
                {KNOWN_PROVIDERS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Custom Provider Label */}
          {kind === "custom" && (
            <div className="provider-conn-field-group">
              <label htmlFor="conn-custom-label">Custom Provider Label</label>
              <input
                id="conn-custom-label"
                type="text"
                value={customLabel}
                onChange={(e) => setCustomLabel(e.target.value)}
                placeholder="e.g., my-custom-llm"
                disabled={isCreating}
                autoComplete="off"
              />
              <p className="provider-conn-help-text">
                A human-readable label for this custom provider, e.g., &quot;my-custom-llm&quot;.
              </p>
            </div>
          )}

          {/* Connection Label */}
          <div className="provider-conn-field-group">
            <label htmlFor="conn-label">Display Name</label>
            <input
              id="conn-label"
              type="text"
              value={label}
              onChange={(e) => handleLabelChange(e.target.value)}
              placeholder="e.g., My OpenAI Key"
              disabled={isCreating}
              autoComplete="off"
            />
          </div>

          {/* Endpoint URL */}
          <div className="provider-conn-field-group">
            <label htmlFor="conn-endpoint">Endpoint URL</label>
            <input
              id="conn-endpoint"
              type="text"
              value={endpointUrl}
              onChange={(e) => setEndpointUrl(e.target.value)}
              placeholder="https://api.openai.com/v1"
              disabled={isCreating}
              autoComplete="off"
            />
            <p className="provider-conn-help-text">
              {kind === "pi_session"
                ? "Pi Session endpoint is managed by the Pi host."
                : "Full base URL of the provider API endpoint."}
            </p>
          </div>

          {/* Secret Input (hidden for Pi Session) */}
          {kind !== "pi_session" && (
            <div className="provider-conn-field-group">
              <label htmlFor="conn-secret">API Key / Secret</label>
              <input
                id="conn-secret"
                type="password"
                value={secretValue}
                onChange={(e) => setSecretValue(e.target.value)}
                placeholder="Enter API key (write-only, never shown again)"
                disabled={isCreating}
                autoComplete="new-password"
              />
              <p className="provider-conn-help-text">
                The key is securely stored and never shown in the UI or logs after saving.
              </p>
            </div>
          )}

          {/* Pi Session Note */}
          {kind === "pi_session" && (
            <div className="provider-conn-info-box">
              <p>
                Pi Session uses the already authenticated Pi host session. No API key
                is required or stored.
              </p>
            </div>
          )}

          {/* Error display */}
          {displayError && (
            <div className="provider-conn-error" role="alert">
              {displayError}
            </div>
          )}

          {/* Actions */}
          <div className="provider-conn-footer">
            <button
              type="button"
              className="secondary-button"
              onClick={onClose}
              disabled={isCreating}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="primary-button"
              disabled={isCreating}
            >
              {isCreating ? "Creating..." : "Create Connection"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
