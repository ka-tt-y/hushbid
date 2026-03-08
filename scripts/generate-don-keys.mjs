/**
 * Generate a P-256 (secp256r1) key pair for DON ECIES encryption in simulation.
 *
 * The SDK encrypts with the public key (P-256 uncompressed),
 * and the CRE workflow decrypts with the private key (PKCS8 DER hex).
 *
 * Output:
 *   DON_PUBLIC_KEY  — uncompressed P-256 public key (130 hex chars = 65 bytes)
 *   DON_PRIVATE_KEY — PKCS8 DER-encoded private key (hex)
 */

async function main() {
  const keyPair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"]
  );

  // Export public key as uncompressed (65 bytes: 0x04 || x || y)
  const pubRaw = new Uint8Array(await crypto.subtle.exportKey("raw", keyPair.publicKey));
  const pubHex = Array.from(pubRaw).map(b => b.toString(16).padStart(2, "0")).join("");

  // Export private key as PKCS8 DER (for CRE workflow import)
  const privPkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", keyPair.privateKey));
  const privHex = Array.from(privPkcs8).map(b => b.toString(16).padStart(2, "0")).join("");

  console.log("=== DON P-256 Key Pair (for simulation) ===\n");
  console.log("Public key (65 bytes uncompressed):");
  console.log(`  DON_PUBLIC_KEY=0x${pubHex}\n`);
  console.log("Private key (PKCS8 DER hex):");
  console.log(`  DON_ETH_PRIVATE_KEY=0x${privHex}\n`);
  console.log("Add to your .env files:");
  console.log(`  VITE_DON_PUBLIC_KEY=0x${pubHex}`);
  console.log(`  DON_ETH_PRIVATE_KEY=0x${privHex}`);

  // Verify roundtrip
  console.log("\nVerifying roundtrip encryption...");
  const testPayload = new TextEncoder().encode('{"bidder":"0xtest","amount":"1000"}');

  // Encrypt (same logic as SDK)
  const ephemeral = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const shared = await crypto.subtle.deriveBits({ name: "ECDH", public: keyPair.publicKey }, ephemeral.privateKey, 256);
  const sharedKey = await crypto.subtle.importKey("raw", shared, "HKDF", false, ["deriveKey"]);
  const aesKey = await crypto.subtle.deriveKey(
    { name: "HKDF", salt: new TextEncoder().encode("hushbid-don-v1"), info: new TextEncoder().encode("bid-encryption"), hash: "SHA-256" },
    sharedKey, { name: "AES-GCM", length: 256 }, false, ["encrypt"]
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, aesKey, testPayload);
  const ephPub = new Uint8Array(await crypto.subtle.exportKey("raw", ephemeral.publicKey));
  const envelope = new Uint8Array(65 + 12 + new Uint8Array(ct).length);
  envelope.set(ephPub, 0);
  envelope.set(iv, 65);
  envelope.set(new Uint8Array(ct), 77);

  // Decrypt (same logic as CRE workflow)
  const privKey2 = await crypto.subtle.importKey("pkcs8", privPkcs8, { name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"]);
  const ephPub2 = await crypto.subtle.importKey("raw", envelope.slice(0, 65), { name: "ECDH", namedCurve: "P-256" }, false, []);
  const shared2 = await crypto.subtle.deriveBits({ name: "ECDH", public: ephPub2 }, privKey2, 256);
  const sharedKey2 = await crypto.subtle.importKey("raw", shared2, "HKDF", false, ["deriveKey"]);
  const aesKey2 = await crypto.subtle.deriveKey(
    { name: "HKDF", salt: new TextEncoder().encode("hushbid-don-v1"), info: new TextEncoder().encode("bid-encryption"), hash: "SHA-256" },
    sharedKey2, { name: "AES-GCM", length: 256 }, false, ["decrypt"]
  );
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: envelope.slice(65, 77) }, aesKey2, envelope.slice(77));
  const decoded = new TextDecoder().decode(pt);
  console.log("✅ Roundtrip OK:", decoded);
}

main().catch(console.error);
