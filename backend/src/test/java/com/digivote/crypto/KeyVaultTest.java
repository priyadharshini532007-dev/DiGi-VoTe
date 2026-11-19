package com.digivote.crypto;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class KeyVaultTest {

    private final KeyVault vault = new KeyVault(SecureTokens.randomBytes(32));

    @Test
    void sealAndOpenRoundTrip() {
        String sealed = vault.seal("secret-key-material", "election:1:rsa");
        assertThat(sealed).doesNotContain("secret-key-material");
        assertThat(vault.open(sealed, "election:1:rsa")).isEqualTo("secret-key-material");
    }

    @Test
    void associatedDataBindsCiphertextToItsPurpose() {
        String sealed = vault.seal("material", "election:1:rsa");
        assertThatThrownBy(() -> vault.open(sealed, "election:2:rsa")).isInstanceOf(IllegalStateException.class)
                .hasMessageNotContaining("material");
    }

    @Test
    void wrongMasterKeyCannotOpen() {
        String sealed = vault.seal("material", "a");
        KeyVault other = new KeyVault(SecureTokens.randomBytes(32));
        assertThatThrownBy(() -> other.open(sealed, "a")).isInstanceOf(IllegalStateException.class);
    }

    @Test
    void derivedKeysArePurposeSpecific() {
        assertThat(vault.deriveKey("x")).isNotEqualTo(vault.deriveKey("y")).hasSize(32);
        assertThat(vault.deriveKey("x")).isEqualTo(vault.deriveKey("x"));
    }
}
