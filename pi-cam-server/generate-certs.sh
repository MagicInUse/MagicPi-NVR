#!/bin/bash

# Create security directory if it doesn't exist
mkdir -p security

# Generate self-signed certificate for development
openssl req -x509 -newkey rsa:4096 -keyout security/key.pem -out security/cert.pem -days 365 -nodes -subj "/C=US/ST=Development/L=Local/O=MagicPi-NVR/OU=Development/CN=localhost"

echo "✅ Self-signed certificates generated in security/ directory"
echo "⚠️ These are for development only - use proper certificates in production"
