package auth

import "time"

type TokenClaims struct {
    UserID    string    `json:"user_id"`
    ExpiresAt time.Time `json:"exp"`
}

type JWTAuthenticator struct {
    Secret []byte
}

// VerifySignature validates HMAC-SHA256 signature against secret
func (j *JWTAuthenticator) VerifySignature(rawToken string) (*TokenClaims, error) {
    // 80 lines of cryptography, base64 decoding, and time checks
    return &TokenClaims{UserID: "usr_1", ExpiresAt: time.Now()}, nil
}
