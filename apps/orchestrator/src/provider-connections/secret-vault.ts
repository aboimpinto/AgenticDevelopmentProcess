/**
 * FEAT-058: Secret Vault Adapter
 *
 * Provides the server-side vault contract and two implementations:
 * 1. `HostSecretVault` — AES-256-GCM encrypted-at-rest SQLite vault
 *    using HEPHA_VAULT_KEY as the encryption key.
 * 2. `InMemorySecretVault` — deterministic test fake.
 *
 * Pi Session connections never write to the vault.
 */

import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { SecretReference } from "@hepha/shared";

// ---------------------------------------------------------------------------
// Vault Adapter Interface
// ---------------------------------------------------------------------------

export interface SecretVaultAdapter {
  /** Write a new secret and return its reference. */
  createSecret(refId: string, value: string): Promise<SecretReference>;

  /** Retrieve a secret value by reference. Returns null if not found. */
  readSecret(refId: string): Promise<string | null>;

  /** Rotate a secret: replace value, advance version. */
  rotateSecret(refId: string, newValue: string): Promise<SecretReference>;

  /** Revoke a secret: mark as unusable without returning the value. */
  revokeSecret(refId: string): Promise<void>;

  /** Delete a secret completely. */
  deleteSecret(refId: string): Promise<void>;

  /** Whether the vault is available for operations. */
  isAvailable(): boolean;
}

// ---------------------------------------------------------------------------
// Encryption Helpers
// ---------------------------------------------------------------------------

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;

function deriveKey(secret: string): Buffer {
  return createHash("sha256").update(secret).digest();
}

function encrypt(plaintext: string, key: Buffer): { ciphertext: string; iv: string; tag: string } {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    ciphertext: encrypted.toString("base64"),
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
  };
}

function decrypt(
  ciphertext: string,
  iv: string,
  tag: string,
  key: Buffer,
): string {
  const decipher = createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return decipher.update(Buffer.from(ciphertext, "base64")) + decipher.final("utf8");
}

const VAULT_SCHEMA_SQL = `
create table if not exists secret_vault (
  ref_id text primary key,
  ciphertext text not null,
  iv text not null,
  tag text not null,
  version integer not null default 1,
  status text not null default 'active' check (status in ('active', 'revoked')),
  created_at text not null,
  updated_at text not null
);
`;

// ---------------------------------------------------------------------------
// Host Secret Vault (encrypted-at-rest SQLite)
// ---------------------------------------------------------------------------

export class HostSecretVault implements SecretVaultAdapter {
  private readonly database: DatabaseSync;
  private readonly key: Buffer | null;
  private schemaReady = false;

  constructor(databasePath: string, vaultKey: string | undefined) {
    if (vaultKey && vaultKey.length > 0) {
      this.key = deriveKey(vaultKey);
    } else {
      this.key = null;
    }

    if (databasePath !== ":memory:") {
      mkdirSync(dirname(databasePath), { recursive: true });
    }

    this.database = new DatabaseSync(databasePath);
    this.database.exec("pragma journal_mode = WAL; pragma busy_timeout = 5000;");
  }

  static createInMemory(vaultKey?: string): HostSecretVault {
    return new HostSecretVault(":memory:", vaultKey ?? "test-vault-key");
  }

  close(): void {
    this.database.close();
  }

  isAvailable(): boolean {
    return this.key !== null;
  }

  private ensureSchema(): void {
    if (this.schemaReady) return;
    this.database.exec(VAULT_SCHEMA_SQL);
    this.schemaReady = true;
  }

  async createSecret(refId: string, value: string): Promise<SecretReference> {
    if (!this.key) throw new VaultUnavailableError("HEPHA_VAULT_KEY is not configured");
    this.ensureSchema();
    const now = new Date().toISOString();
    const { ciphertext, iv, tag } = encrypt(value, this.key);
    const stmt = this.database.prepare(`
      insert into secret_vault (ref_id, ciphertext, iv, tag, version, status, created_at, updated_at)
      values (?, ?, ?, ?, 1, 'active', ?, ?)
    `);
    stmt.run(refId, ciphertext, iv, tag, now, now);
    return { refId, version: 1, createdAt: now };
  }

  async readSecret(refId: string): Promise<string | null> {
    if (!this.key) throw new VaultUnavailableError("HEPHA_VAULT_KEY is not configured");
    this.ensureSchema();
    const stmt = this.database.prepare(
      "select * from secret_vault where ref_id = ? and status = 'active'",
    );
    const row = stmt.get(refId) as Record<string, unknown> | undefined;
    if (!row) return null;
    return decrypt(
      row.ciphertext as string,
      row.iv as string,
      row.tag as string,
      this.key,
    );
  }

  async rotateSecret(refId: string, newValue: string): Promise<SecretReference> {
    if (!this.key) throw new VaultUnavailableError("HEPHA_VAULT_KEY is not configured");
    this.ensureSchema();
    const now = new Date().toISOString();
    const existing = this.database.prepare(
      "select version from secret_vault where ref_id = ?",
    ).get(refId) as { version: number } | undefined;

    const nextVersion = existing ? existing.version + 1 : 1;
    const { ciphertext, iv, tag } = encrypt(newValue, this.key);

    if (existing) {
      const stmt = this.database.prepare(`
        update secret_vault set ciphertext = ?, iv = ?, tag = ?, version = ?, status = 'active', updated_at = ?
        where ref_id = ?
      `);
      stmt.run(ciphertext, iv, tag, nextVersion, now, refId);
    } else {
      const stmt = this.database.prepare(`
        insert into secret_vault (ref_id, ciphertext, iv, tag, version, status, created_at, updated_at)
        values (?, ?, ?, ?, ?, 'active', ?, ?)
      `);
      stmt.run(refId, ciphertext, iv, tag, nextVersion, now, now);
    }

    return { refId, version: nextVersion, createdAt: now };
  }

  async revokeSecret(refId: string): Promise<void> {
    if (!this.key) throw new VaultUnavailableError("HEPHA_VAULT_KEY is not configured");
    this.ensureSchema();
    const now = new Date().toISOString();
    const stmt = this.database.prepare(
      "update secret_vault set status = 'revoked', updated_at = ? where ref_id = ?",
    );
    stmt.run(now, refId);
  }

  async deleteSecret(refId: string): Promise<void> {
    if (!this.key) throw new VaultUnavailableError("HEPHA_VAULT_KEY is not configured");
    this.ensureSchema();
    const stmt = this.database.prepare("delete from secret_vault where ref_id = ?");
    stmt.run(refId);
  }
}

// ---------------------------------------------------------------------------
// In-Memory Secret Vault (test fake)
// ---------------------------------------------------------------------------

interface VaultEntry {
  value: string;
  version: number;
  status: "active" | "revoked";
  createdAt: string;
  updatedAt: string;
}

export class InMemorySecretVault implements SecretVaultAdapter {
  private readonly store = new Map<string, VaultEntry>();
  private available = true;

  constructor(available = true) {
    this.available = available;
  }

  setAvailable(available: boolean): void {
    this.available = available;
  }

  isAvailable(): boolean {
    return this.available;
  }

  async createSecret(refId: string, value: string): Promise<SecretReference> {
    if (!this.available) throw new VaultUnavailableError("Vault unavailable");
    const now = new Date().toISOString();
    this.store.set(refId, { value, version: 1, status: "active", createdAt: now, updatedAt: now });
    return { refId, version: 1, createdAt: now };
  }

  async readSecret(refId: string): Promise<string | null> {
    if (!this.available) throw new VaultUnavailableError("Vault unavailable");
    const entry = this.store.get(refId);
    if (!entry || entry.status !== "active") return null;
    return entry.value;
  }

  async rotateSecret(refId: string, newValue: string): Promise<SecretReference> {
    if (!this.available) throw new VaultUnavailableError("Vault unavailable");
    const now = new Date().toISOString();
    const existing = this.store.get(refId);
    const nextVersion = existing ? existing.version + 1 : 1;
    this.store.set(refId, {
      value: newValue,
      version: nextVersion,
      status: "active",
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    });
    return { refId, version: nextVersion, createdAt: now };
  }

  async revokeSecret(refId: string): Promise<void> {
    if (!this.available) throw new VaultUnavailableError("Vault unavailable");
    const entry = this.store.get(refId);
    if (entry) {
      entry.status = "revoked";
      entry.updatedAt = new Date().toISOString();
    }
  }

  async deleteSecret(refId: string): Promise<void> {
    if (!this.available) throw new VaultUnavailableError("Vault unavailable");
    this.store.delete(refId);
  }

  /** Test helper: check if a secret exists. */
  hasSecret(refId: string): boolean {
    return this.store.has(refId);
  }
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class VaultUnavailableError extends Error {
  readonly code = "VAULT_UNAVAILABLE";
  constructor(message?: string) {
    super(message ?? "Secret vault is unavailable");
    this.name = "VaultUnavailableError";
  }
}
