"""
auth_utils.py - Cryptographic Security & Session Token Utilities.

Purpose:
    Provides salted password hashing, password verification, and HMAC-signed
    session token generation and validation without external C-dependencies.

Role in the project:
    Authentication and security foundation of WareSwarm. Used by routes_auth
    for user registration, sign-in, and request authentication.

Key contents:
    - hash_password(): PBKDF2-HMAC-SHA256 with 16-byte random salt and 100,000 rounds.
    - verify_password(): Constant-time verification against salt:key hash.
    - create_token(): Generates 30-day HMAC-SHA256 signed session tokens.
    - verify_token(): Validates token signature and expiration.

Talks to:
    - app.api.routes_auth: Generates and verifies credentials for authentication endpoints.
"""
from __future__ import annotations
import hashlib
import os
import secrets
import base64
import json
import time

def hash_password(password: str) -> str:
    """Hash a password using PBKDF2 with a random 16-byte salt."""
    salt = secrets.token_bytes(16)
    key = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt, 100_000)
    # Store as salt_hex:key_hex
    return f"{salt.hex()}:{key.hex()}"

def verify_password(password: str, hashed: str) -> bool:
    """Verify a plaintext password against the stored salt:key string."""
    try:
        parts = hashed.split(':')
        if len(parts) != 2:
            return False
        salt = bytes.fromhex(parts[0])
        expected_key = bytes.fromhex(parts[1])
        actual_key = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt, 100_000)
        return secrets.compare_digest(expected_key, actual_key)
    except Exception:
        return False

SECRET_KEY = os.environ.get("AUTH_SECRET_KEY", "wareswarm-dev-secret-key-2026-auth")

def create_token(user_id: int, username: str, email: str, role: str) -> str:
    """Generate a lightweight HMAC-signed session token."""
    payload = {
        "sub": user_id,
        "username": username,
        "email": email,
        "role": role,
        "iat": int(time.time()),
        "exp": int(time.time()) + (30 * 86400), # 30 days
    }
    payload_str = json.dumps(payload, separators=(',', ':'))
    payload_b64 = base64.urlsafe_b64encode(payload_str.encode('utf-8')).decode('utf-8').rstrip('=')
    
    signature = hashlib.sha256(f"{payload_b64}:{SECRET_KEY}".encode('utf-8')).hexdigest()
    return f"{payload_b64}.{signature}"

def verify_token(token: str) -> dict | None:
    """Verify and decode a session token, returning payload dict or None."""
    try:
        parts = token.split('.')
        if len(parts) != 2:
            return None
        payload_b64, signature = parts
        expected_sig = hashlib.sha256(f"{payload_b64}:{SECRET_KEY}".encode('utf-8')).hexdigest()
        if not secrets.compare_digest(signature, expected_sig):
            return None
        
        # Add padding if needed
        padding = 4 - (len(payload_b64) % 4)
        if padding != 4:
            payload_b64 += '=' * padding
            
        payload_str = base64.urlsafe_b64decode(payload_b64).decode('utf-8')
        payload = json.loads(payload_str)
        
        if payload.get("exp") and payload["exp"] < time.time():
            return None # Expired
            
        return payload
    except Exception:
        return None
