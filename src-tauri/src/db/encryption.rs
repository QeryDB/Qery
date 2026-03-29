use aes_gcm::{
    aead::{Aead, KeyInit, OsRng},
    Aes256Gcm, AeadCore,
};
use base64::{engine::general_purpose::STANDARD as BASE64, Engine};

const IV_LENGTH: usize = 16;
const TAG_LENGTH: usize = 16;

fn get_key() -> [u8; 32] {
    let key_str = std::env::var("ENCRYPTION_KEY")
        .unwrap_or_else(|_| "change-me-to-a-32-byte-key!!!!!".to_string());

    // Pad with '!' to 32 bytes, then truncate — matches TS: key.padEnd(32, '!').slice(0, 32)
    let mut padded = key_str.clone();
    while padded.len() < 32 {
        padded.push('!');
    }
    let bytes = padded.as_bytes();
    let mut result = [0u8; 32];
    result.copy_from_slice(&bytes[..32]);
    result
}

pub fn encrypt(text: &str) -> Result<String, String> {
    let key = get_key();
    let cipher = Aes256Gcm::new_from_slice(&key)
        .map_err(|e| format!("Failed to create cipher: {}", e))?;

    // Generate 16-byte IV (AES-GCM nonce is 12 bytes, but TS uses 16)
    // TS uses createCipheriv with 16-byte IV for aes-256-gcm
    // aes-gcm crate uses 12-byte nonce by default
    // To maintain backward compatibility, we need to handle the 16-byte IV format
    // TS format: base64(IV[16] + AuthTag[16] + Ciphertext)
    //
    // Node.js crypto allows 16-byte IV for GCM. The aes-gcm crate only supports 12-byte nonce.
    // For backward compatibility, we'll use the first 12 bytes of a 16-byte random buffer as nonce,
    // but store all 16 bytes in the output format to match TS.
    //
    // Actually, Node.js GCM with 16-byte IV internally hashes it to produce a 12-byte counter.
    // We need to replicate this exactly. The simplest approach: use 12-byte nonce for new encryptions,
    // but pad to 16 bytes in storage format for backward compat reading.
    //
    // Wait — let me re-read the TS code. It uses 16-byte IV with createCipheriv('aes-256-gcm').
    // Node.js GCM accepts any IV length and internally uses GHASH to derive the counter block.
    // The aes-gcm crate only accepts 12-byte nonce natively.
    //
    // For NEW encryptions from Rust: use 12-byte nonce, store as 12 bytes in output.
    // For DECRYPTION of TS data: detect 16-byte IV format.
    //
    // But the plan says: "Format: base64(IV[16] + AuthTag[16] + Ciphertext)"
    // and "Must decrypt existing TypeScript-encrypted data"
    //
    // Since we can't easily use 16-byte IV with the aes-gcm crate, let's:
    // - For encrypt: use 12-byte nonce, store as base64(IV[12] + AuthTag[16] + Ciphertext)
    // - For decrypt: detect IV size from total data length
    //
    // Actually, the safest approach is to use the openssl or ring crate which supports arbitrary IV.
    // But the plan specifies aes-gcm crate. Let's use 12-byte nonce for new data and handle both
    // formats in decrypt.
    //
    // Correction: aes-gcm Aes256Gcm uses 12-byte (96-bit) nonce. For TS compat, we store
    // 16 bytes but only use first 12. The remaining 4 bytes are random padding for format compat.
    // When decrypting TS data with 16-byte IV, we need the actual Node.js GCM IV processing.
    //
    // This is complex. Let me use a different approach: for forward-compat, use Aes256Gcm
    // with 12-byte nonce. For the storage format, prefix a marker or detect automatically.
    //
    // SIMPLEST: Switch to using aes_gcm with 12-byte nonce. For decrypting old TS data with
    // 16-byte IV, we'd need openssl. Let's just use 12 bytes and add a migration note.
    //
    // Re-reading plan: "Encryption must be backward-compatible with existing TypeScript-encrypted passwords"
    // This means we MUST decrypt TS-encrypted data. Let's handle this properly.

    let nonce = Aes256Gcm::generate_nonce(&mut OsRng); // 12 bytes
    let ciphertext = cipher
        .encrypt(&nonce, text.as_bytes())
        .map_err(|e| format!("Encryption failed: {}", e))?;

    // aes-gcm appends the tag to ciphertext. Split it out for our format.
    // The ciphertext from aes-gcm includes: encrypted_data + tag (16 bytes)
    let ct_len = ciphertext.len() - TAG_LENGTH;
    let encrypted_data = &ciphertext[..ct_len];
    let tag = &ciphertext[ct_len..];

    // Format: base64(nonce[12] + tag[16] + encrypted_data)
    // For TS compat detection in decrypt: if first segment is 16 bytes, it's TS format
    // If 12 bytes, it's Rust format. We distinguish by total data layout.
    // Store a version byte? No, keep it simple: Rust stores 12-byte nonce.
    // In decrypt, try 12-byte nonce first, fall back to 16-byte (TS).
    let mut output = Vec::with_capacity(12 + TAG_LENGTH + encrypted_data.len());
    output.extend_from_slice(nonce.as_slice());
    output.extend_from_slice(tag);
    output.extend_from_slice(encrypted_data);

    Ok(BASE64.encode(&output))
}

pub fn decrypt(encrypted_base64: &str) -> Result<String, String> {
    let data = BASE64
        .decode(encrypted_base64)
        .map_err(|e| format!("Base64 decode failed: {}", e))?;

    // Try Rust format first (12-byte nonce + 16-byte tag + ciphertext)
    if data.len() >= 12 + TAG_LENGTH {
        if let Ok(result) = decrypt_with_nonce_size(&data, 12) {
            return Ok(result);
        }
    }

    // Fall back to TS format (16-byte IV + 16-byte tag + ciphertext)
    // Node.js GCM with 16-byte IV: internally uses GHASH to derive counter block
    // We can't replicate this with aes-gcm crate's standard Aes256Gcm (96-bit nonce only)
    // Use Aes256Gcm with NonceSize = U12 (default), but for 16-byte IV we need custom.
    // Actually, aes-gcm supports arbitrary nonce sizes via AesGcm<Aes256, NonceSize>.
    if data.len() >= IV_LENGTH + TAG_LENGTH {
        return decrypt_ts_format(&data);
    }

    Err("Data too short to decrypt".to_string())
}

fn decrypt_with_nonce_size(data: &[u8], nonce_len: usize) -> Result<String, String> {
    let key = get_key();
    let cipher = Aes256Gcm::new_from_slice(&key)
        .map_err(|e| format!("Failed to create cipher: {}", e))?;

    if nonce_len != 12 {
        return Err("Standard Aes256Gcm only supports 12-byte nonce".to_string());
    }

    let nonce_bytes = &data[..12];
    let tag = &data[12..12 + TAG_LENGTH];
    let encrypted = &data[12 + TAG_LENGTH..];

    // Reconstruct combined ciphertext+tag format expected by aes-gcm
    let mut combined = Vec::with_capacity(encrypted.len() + TAG_LENGTH);
    combined.extend_from_slice(encrypted);
    combined.extend_from_slice(tag);

    let nonce = aes_gcm::Nonce::from_slice(nonce_bytes);
    let plaintext = cipher
        .decrypt(nonce, combined.as_slice())
        .map_err(|e| format!("Decryption failed: {}", e))?;

    String::from_utf8(plaintext).map_err(|e| format!("UTF-8 decode failed: {}", e))
}

fn decrypt_ts_format(data: &[u8]) -> Result<String, String> {
    // TS format: IV[16] + AuthTag[16] + Ciphertext
    // Node.js GCM with 16-byte IV internally uses GHASH to process the IV into a counter.
    // The aes-gcm crate's default Aes256Gcm uses 12-byte nonce.
    // For 16-byte IV compat, use AesGcm<Aes256, U16> (typenum).
    use aes_gcm::aes::Aes256;
    use aes_gcm::AesGcm;
    use aes_gcm::aead::generic_array::typenum::U16;

    let key = get_key();
    let cipher = AesGcm::<Aes256, U16>::new_from_slice(&key)
        .map_err(|e| format!("Failed to create cipher: {}", e))?;

    let iv = &data[..16];
    let tag = &data[16..32];
    let encrypted = &data[32..];

    let mut combined = Vec::with_capacity(encrypted.len() + TAG_LENGTH);
    combined.extend_from_slice(encrypted);
    combined.extend_from_slice(tag);

    let nonce = aes_gcm::Nonce::<U16>::from_slice(iv);
    let plaintext = cipher
        .decrypt(nonce, combined.as_slice())
        .map_err(|e| format!("Decryption failed (TS format): {}", e))?;

    String::from_utf8(plaintext).map_err(|e| format!("UTF-8 decode failed: {}", e))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn encrypt_decrypt_roundtrip() {
        let plaintext = "hello world";
        let encrypted = encrypt(plaintext).unwrap();
        let decrypted = decrypt(&encrypted).unwrap();
        assert_eq!(decrypted, plaintext);
    }

    #[test]
    fn different_iv_per_encryption() {
        let text = "same text";
        let a = encrypt(text).unwrap();
        let b = encrypt(text).unwrap();
        assert_ne!(a, b);
    }

    #[test]
    fn tampered_ciphertext_fails() {
        let encrypted = encrypt("test").unwrap();
        let mut data = BASE64.decode(&encrypted).unwrap();
        // Flip a byte in the ciphertext area
        if let Some(byte) = data.last_mut() {
            *byte ^= 0xFF;
        }
        let tampered = BASE64.encode(&data);
        assert!(decrypt(&tampered).is_err());
    }

    #[test]
    fn special_chars_roundtrip() {
        let passwords = vec![
            "p@ss!w0rd#$%",
            "user_z9!1qq@7",
            r#"hello"world"#,
            "tüñá+ö=şç",
            r"back\slash",
            "spaces in password",
            "😀🔑",
        ];
        for pw in passwords {
            let encrypted = encrypt(pw).unwrap();
            let decrypted = decrypt(&encrypted).unwrap();
            assert_eq!(decrypted, pw, "Roundtrip failed for: {}", pw);
        }
    }

    #[test]
    fn empty_string_roundtrip() {
        let encrypted = encrypt("").unwrap();
        let decrypted = decrypt(&encrypted).unwrap();
        assert_eq!(decrypted, "");
    }

    #[test]
    fn key_padding_matches_typescript() {
        // TS: Buffer.from("change-me-to-a-32-byte-key!!!!!".padEnd(32, '!').slice(0, 32))
        let key = get_key();
        let expected = b"change-me-to-a-32-byte-key!!!!!";
        // The default key is 31 chars, padded to 32 with '!'
        assert_eq!(key.len(), 32);
        assert_eq!(&key[..31], &expected[..]);
        assert_eq!(key[31], b'!');
    }
}
