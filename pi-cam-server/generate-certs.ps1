# PowerShell script to generate self-signed certificates for development

# Create security directory if it doesn't exist
if (!(Test-Path "security")) {
    New-Item -ItemType Directory -Path "security"
}

# Check if OpenSSL is available
try {
    & openssl version | Out-Null
    
    # Generate self-signed certificate using OpenSSL
    & openssl req -x509 -newkey rsa:4096 -keyout security/key.pem -out security/cert.pem -days 365 -nodes -subj "/C=US/ST=Development/L=Local/O=MagicPi-NVR/OU=Development/CN=localhost"
    
    Write-Host "✅ Self-signed certificates generated in security/ directory" -ForegroundColor Green
    Write-Host "⚠️ These are for development only - use proper certificates in production" -ForegroundColor Yellow
}
catch {
    Write-Host "❌ OpenSSL not found. Please install OpenSSL or use an alternative method to generate certificates." -ForegroundColor Red
    Write-Host "Alternative: You can create certificates using Windows Certificate Manager or online tools." -ForegroundColor Yellow
    
    # Alternative using PowerShell (Windows 10/11)
    Write-Host "Attempting to create self-signed certificate using PowerShell..." -ForegroundColor Cyan
    
    try {
        $cert = New-SelfSignedCertificate -DnsName "localhost" -CertStoreLocation "cert:\LocalMachine\My" -KeyAlgorithm RSA -KeyLength 2048 -Provider "Microsoft RSA SChannel Cryptographic Provider" -KeyExportPolicy Exportable -KeyUsage CertSign,CRLSign,DigitalSignature,KeyEncipherment
        
        # Export certificate
        $certPath = "security\cert.pem"
        $keyPath = "security\key.pem"
        
        # Export as PFX first, then convert to PEM
        $pfxPath = "security\temp.pfx"
        $pwd = ConvertTo-SecureString -String "temp" -Force -AsPlainText
        Export-PfxCertificate -Cert $cert -FilePath $pfxPath -Password $pwd
        
        # Convert to PEM (requires OpenSSL for this step)
        Write-Host "⚠️ Certificate created but conversion to PEM format requires OpenSSL" -ForegroundColor Yellow
        Write-Host "PFX certificate saved to: $pfxPath" -ForegroundColor Green
        
    }
    catch {
        Write-Host "❌ Failed to create certificate with PowerShell method" -ForegroundColor Red
        Write-Host "Please install OpenSSL or manually create certificates" -ForegroundColor Yellow
    }
}
