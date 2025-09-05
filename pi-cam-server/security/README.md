# SSL Certificate Generation Instructions

To generate self-signed SSL certificates for the Pi Camera Server, follow these steps:

## Prerequisites
- OpenSSL must be installed on your Raspberry Pi
- Run these commands from the project root directory

## Generate SSL Certificates

### Step 1: Generate Private Key
```bash
openssl genrsa -out security/key.pem 2048
```

### Step 2: Generate Certificate Signing Request (CSR)
```bash
openssl req -new -key security/key.pem -out security/cert.csr
```

When prompted, enter the following information:
- Country Name: Your country code (e.g., "US")
- State or Province: Your state/province
- City: Your city
- Organization Name: Your organization or "Pi Camera Server"
- Organizational Unit: "IT Department" or similar
- Common Name: **IMPORTANT** - Enter your Raspberry Pi's IP address or hostname
- Email Address: Your email
- Challenge Password: (leave blank)
- Optional Company Name: (leave blank)

### Step 3: Generate Self-Signed Certificate
```bash
openssl x509 -req -in security/cert.csr -signkey security/key.pem -out security/cert.pem -days 365
```

### Step 4: Clean Up
```bash
rm security/cert.csr
```

## Verify Certificate Generation
After running the commands, you should have:
- `security/key.pem` - Private key file
- `security/cert.pem` - Certificate file

## Security Notes
1. **Keep the private key secure** - Never share the `key.pem` file
2. **Certificate validity** - The certificate is valid for 365 days
3. **IP address/hostname** - Make sure the Common Name matches your Pi's network address
4. **File permissions** - Ensure proper permissions:
   ```bash
   chmod 600 security/key.pem
   chmod 644 security/cert.pem
   ```

## For ESP32-CAM Clients
The ESP32-CAM clients will need to trust this certificate. You'll need to:
1. Copy the contents of `security/cert.pem`
2. Paste it into the ESP32 code where indicated
3. Remove the "-----BEGIN CERTIFICATE-----" and "-----END CERTIFICATE-----" lines
4. Remove all newlines to create one long string

## Alternative: Quick Generation Script
Create a script file `generate-certs.sh`:

```bash
#!/bin/bash
# Quick SSL certificate generation for Pi Camera Server

# Get Pi's IP address
PI_IP=$(hostname -I | awk '{print $1}')

# Generate private key
openssl genrsa -out security/key.pem 2048

# Generate certificate with Pi's IP as Common Name
openssl req -new -x509 -key security/key.pem -out security/cert.pem -days 365 -subj "/C=US/ST=State/L=City/O=Pi Camera Server/CN=$PI_IP"

# Set proper permissions
chmod 600 security/key.pem
chmod 644 security/cert.pem

echo "SSL certificates generated successfully!"
echo "Certificate valid for IP: $PI_IP"
echo "Key file: security/key.pem"
echo "Certificate file: security/cert.pem"
```

Make it executable and run:
```bash
chmod +x generate-certs.sh
./generate-certs.sh
```
