// Behavior suite: provider connection secret vault.
/**
 * FEAT-058: Secret Vault Tests
 *
 * Tests for InMemorySecretVault (test fake) and HostSecretVault.
 * Covers create, read, rotate, revoke, delete, and unavailable behavior.
 */

import { describe, expect, it } from "vitest";
import {
  InMemorySecretVault,
  HostSecretVault,
  VaultUnavailableError,
} from "../src/provider-connections/secret-vault.js";

// ---------------------------------------------------------------------------
// InMemorySecretVault
// ---------------------------------------------------------------------------

describe("InMemorySecretVault", () => {
  it("creates a secret and returns a reference", async () => {
    const vault = new InMemorySecretVault();
    const ref = await vault.createSecret("ref-1", "sk-test-secret-value-12345");
    expect(ref.refId).toBe("ref-1");
    expect(ref.version).toBe(1);
    expect(ref.createdAt).toBeTruthy();
  });

  it("reads back the created secret", async () => {
    const vault = new InMemorySecretVault();
    await vault.createSecret("ref-1", "test-secret-value");
    const value = await vault.readSecret("ref-1");
    expect(value).toBe("test-secret-value");
  });

  it("returns null for non-existent secret", async () => {
    const vault = new InMemorySecretVault();
    const value = await vault.readSecret("non-existent");
    expect(value).toBeNull();
  });

  it("rotates a secret and advances the version", async () => {
    const vault = new InMemorySecretVault();
    await vault.createSecret("ref-1", "original-value");
    const ref = await vault.rotateSecret("ref-1", "rotated-value");
    expect(ref.version).toBe(2);

    const value = await vault.readSecret("ref-1");
    expect(value).toBe("rotated-value");
  });

  it("creates a new entry when rotating a non-existent ref", async () => {
    const vault = new InMemorySecretVault();
    const ref = await vault.rotateSecret("new-ref", "first-value");
    expect(ref.version).toBe(1);

    const value = await vault.readSecret("new-ref");
    expect(value).toBe("first-value");
  });

  it("revokes a secret so it cannot be read", async () => {
    const vault = new InMemorySecretVault();
    await vault.createSecret("ref-1", "test-value");
    await vault.revokeSecret("ref-1");

    const value = await vault.readSecret("ref-1");
    expect(value).toBeNull();
  });

  it("deletes a secret", async () => {
    const vault = new InMemorySecretVault();
    await vault.createSecret("ref-1", "test-value");
    await vault.deleteSecret("ref-1");

    expect(vault.hasSecret("ref-1")).toBe(false);
    const value = await vault.readSecret("ref-1");
    expect(value).toBeNull();
  });

  it("throws when vault is set unavailable", async () => {
    const vault = new InMemorySecretVault();
    vault.setAvailable(false);

    await expect(vault.createSecret("ref-1", "value")).rejects.toThrow(VaultUnavailableError);
    await expect(vault.readSecret("ref-1")).rejects.toThrow(VaultUnavailableError);
    await expect(vault.rotateSecret("ref-1", "new")).rejects.toThrow(VaultUnavailableError);
    await expect(vault.revokeSecret("ref-1")).rejects.toThrow(VaultUnavailableError);
    await expect(vault.deleteSecret("ref-1")).rejects.toThrow(VaultUnavailableError);
  });

  it("isAvailable returns true by default", () => {
    const vault = new InMemorySecretVault();
    expect(vault.isAvailable()).toBe(true);
  });

  it("isAvailable returns false when set", () => {
    const vault = new InMemorySecretVault(false);
    expect(vault.isAvailable()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// HostSecretVault (encrypted-at-rest)
// ---------------------------------------------------------------------------

describe("HostSecretVault", () => {
  it("creates and reads a secret", async () => {
    const vault = HostSecretVault.createInMemory("test-key-12345");
    try {
      const ref = await vault.createSecret("ref-1", "my-api-key");
      expect(ref.version).toBe(1);

      const value = await vault.readSecret("ref-1");
      expect(value).toBe("my-api-key");
    } finally {
      vault.close();
    }
  });

  it("returns null for non-existent secret", async () => {
    const vault = HostSecretVault.createInMemory("test-key-12345");
    try {
      const value = await vault.readSecret("non-existent");
      expect(value).toBeNull();
    } finally {
      vault.close();
    }
  });

  it("rotates secret and advances version", async () => {
    const vault = HostSecretVault.createInMemory("test-key-12345");
    try {
      await vault.createSecret("ref-1", "original");
      const ref = await vault.rotateSecret("ref-1", "rotated");
      expect(ref.version).toBe(2);

      const value = await vault.readSecret("ref-1");
      expect(value).toBe("rotated");
    } finally {
      vault.close();
    }
  });

  it("revokes secret so it cannot be read", async () => {
    const vault = HostSecretVault.createInMemory("test-key-12345");
    try {
      await vault.createSecret("ref-1", "test-value");
      await vault.revokeSecret("ref-1");

      const value = await vault.readSecret("ref-1");
      expect(value).toBeNull();
    } finally {
      vault.close();
    }
  });

  it("deletes secret completely", async () => {
    const vault = HostSecretVault.createInMemory("test-key-12345");
    try {
      await vault.createSecret("ref-1", "test-value");
      await vault.deleteSecret("ref-1");

      const value = await vault.readSecret("ref-1");
      expect(value).toBeNull();
    } finally {
      vault.close();
    }
  });

  it("throws when no vault key is configured", async () => {
    const vault = new HostSecretVault(":memory:", undefined);
    try {
      await expect(vault.createSecret("ref-1", "value")).rejects.toThrow(VaultUnavailableError);
      await expect(vault.readSecret("ref-1")).rejects.toThrow(VaultUnavailableError);
    } finally {
      vault.close();
    }
  });

  it("isAvailable returns false when no key configured", () => {
    const vault = new HostSecretVault(":memory:", undefined);
    try {
      expect(vault.isAvailable()).toBe(false);
    } finally {
      vault.close();
    }
  });

  it("isAvailable returns true when key configured", () => {
    const vault = HostSecretVault.createInMemory("test-key");
    try {
      expect(vault.isAvailable()).toBe(true);
    } finally {
      vault.close();
    }
  });
});
