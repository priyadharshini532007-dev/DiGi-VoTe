package com.digivote.voting;

import com.digivote.common.ApiException;
import com.digivote.common.Hashing;
import com.digivote.config.DigiVoteProperties;
import com.digivote.crypto.BlindRsa;
import com.digivote.crypto.KeyVault;
import com.digivote.crypto.Paillier;
import com.digivote.crypto.SecureTokens;
import org.bouncycastle.crypto.AsymmetricCipherKeyPair;
import org.bouncycastle.crypto.params.RSAKeyParameters;
import org.bouncycastle.crypto.params.RSAPrivateCrtKeyParameters;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigInteger;
import java.time.Clock;

/**
 * Key generation, storage and access for one election:
 * <ul>
 *   <li>RSA (blind-signature) key pair: signs voters' blinded credential requests.</li>
 *   <li>Paillier key pair: encrypts ballot options; only aggregate tallies are ever decrypted.</li>
 * </ul>
 * Private halves are sealed with {@link KeyVault} (AES-256-GCM, election-bound associated data) and
 * opened only inside credential issuance and result generation. Keys are generated once, when voting
 * opens, and are never rotated during an election (rotation would invalidate issued credentials).
 */
@Service
public class ElectionKeyService {

    private final ElectionKeysRepository repository;
    private final KeyVault vault;
    private final DigiVoteProperties properties;
    private final Clock clock;

    public ElectionKeyService(ElectionKeysRepository repository, KeyVault vault, DigiVoteProperties properties,
                              Clock clock) {
        this.repository = repository;
        this.vault = vault;
        this.properties = properties;
        this.clock = clock;
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public ElectionKeys generate(Long electionId) {
        if (repository.existsById(electionId)) {
            throw ApiException.conflict("KEYS_EXIST", "Election keys already exist");
        }
        AsymmetricCipherKeyPair rsa = BlindRsa.generate(properties.crypto().rsaBits(), SecureTokens.random());
        RSAPrivateCrtKeyParameters priv = (RSAPrivateCrtKeyParameters) rsa.getPrivate();
        String rsaPrivate = String.join(":", hex(priv.getModulus()), hex(priv.getPublicExponent()),
                hex(priv.getExponent()), hex(priv.getP()), hex(priv.getQ()), hex(priv.getDP()), hex(priv.getDQ()),
                hex(priv.getQInv()));
        Paillier.KeyPair paillier = Paillier.generate(properties.crypto().paillierBits(), SecureTokens.random());
        String paillierPrivate = hex(paillier.privateKey().lambda()) + ":" + hex(paillier.privateKey().mu());
        String n = hex(priv.getModulus());
        String e = hex(priv.getPublicExponent());
        return repository.save(new ElectionKeys(electionId, n, e,
                vault.seal(rsaPrivate, aad(electionId, "rsa")),
                Hashing.sha256Hex(n + ":" + e),
                hex(paillier.publicKey().n()),
                vault.seal(paillierPrivate, aad(electionId, "paillier")),
                clock.instant()));
    }

    public ElectionKeys require(Long electionId) {
        return repository.findById(electionId)
                .orElseThrow(() -> ApiException.conflict("KEYS_MISSING", "Voting has not been opened for this election"));
    }

    public RSAKeyParameters rsaPublic(ElectionKeys keys) {
        return new RSAKeyParameters(false, new BigInteger(keys.getRsaModulus(), 16),
                new BigInteger(keys.getRsaPublicExponent(), 16));
    }

    RSAPrivateCrtKeyParameters rsaPrivate(ElectionKeys keys) {
        String[] p = vault.open(keys.getRsaPrivateSealed(), aad(keys.getElectionId(), "rsa")).split(":");
        return new RSAPrivateCrtKeyParameters(big(p[0]), big(p[1]), big(p[2]), big(p[3]), big(p[4]), big(p[5]),
                big(p[6]), big(p[7]));
    }

    public Paillier.PublicKey paillierPublic(ElectionKeys keys) {
        return new Paillier.PublicKey(new BigInteger(keys.getPaillierN(), 16));
    }

    /** Opened only by the tally service to decrypt aggregate (summed) ciphertexts. */
    public Paillier.PrivateKey paillierPrivate(ElectionKeys keys) {
        String[] p = vault.open(keys.getPaillierPrivateSealed(), aad(keys.getElectionId(), "paillier")).split(":");
        return new Paillier.PrivateKey(paillierPublic(keys), big(p[0]), big(p[1]));
    }

    private static String aad(Long electionId, String purpose) {
        return "digi-vote:election:" + electionId + ":" + purpose;
    }

    private static String hex(BigInteger v) {
        return v.toString(16);
    }

    private static BigInteger big(String hex) {
        return new BigInteger(hex, 16);
    }
}
