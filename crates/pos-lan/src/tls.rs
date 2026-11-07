//! TLS for the shop link: the PC's own certificate, and a phone-side check
//! that accepts only the certificate whose fingerprint came from the QR code.

use std::sync::Arc;

use rustls::client::danger::{HandshakeSignatureValid, ServerCertVerified, ServerCertVerifier};
use rustls::crypto::{ring, verify_tls12_signature, verify_tls13_signature, CryptoProvider};
use rustls::pki_types::{CertificateDer, PrivateKeyDer, PrivatePkcs8KeyDer, ServerName, UnixTime};
use rustls::{ClientConfig, DigitallySignedStruct, Error, ServerConfig, SignatureScheme};

fn provider() -> Arc<CryptoProvider> {
    Arc::new(ring::default_provider())
}

/// SHA-256 fingerprint (lowercase hex) of a DER certificate.
pub fn fingerprint(cert_der: &[u8]) -> String {
    crate::sha256_hex(cert_der)
}

/// A new self-signed certificate for the PC: (certificate DER, PKCS#8 key DER).
#[cfg(feature = "server")]
pub fn generate_certificate() -> Result<(Vec<u8>, Vec<u8>), String> {
    let ck = rcgen::generate_simple_self_signed(vec!["nextpos.local".to_string()]).map_err(|e| e.to_string())?;
    Ok((ck.cert.der().to_vec(), ck.signing_key.serialize_der()))
}

/// Server TLS settings from the PC's certificate and key.
pub fn server_config(cert_der: &[u8], key_der: &[u8]) -> Result<Arc<ServerConfig>, String> {
    let cfg = ServerConfig::builder_with_provider(provider())
        .with_safe_default_protocol_versions()
        .map_err(|e| e.to_string())?
        .with_no_client_auth()
        .with_single_cert(
            vec![CertificateDer::from(cert_der.to_vec())],
            PrivateKeyDer::Pkcs8(PrivatePkcs8KeyDer::from(key_der.to_vec())),
        )
        .map_err(|e| e.to_string())?;
    Ok(Arc::new(cfg))
}

/// Accepts exactly one certificate: the one with the pinned fingerprint.
/// The address is not checked, because the PC's WiFi address can change.
#[derive(Debug)]
struct PinnedVerifier {
    fingerprint: String,
    provider: Arc<CryptoProvider>,
}

impl ServerCertVerifier for PinnedVerifier {
    fn verify_server_cert(
        &self,
        end_entity: &CertificateDer<'_>,
        _intermediates: &[CertificateDer<'_>],
        _server_name: &ServerName<'_>,
        _ocsp: &[u8],
        _now: UnixTime,
    ) -> Result<ServerCertVerified, Error> {
        if crate::ct_eq(&fingerprint(end_entity.as_ref()), &self.fingerprint) {
            Ok(ServerCertVerified::assertion())
        } else {
            Err(Error::General("NEXTPOS_WRONG_PC".into()))
        }
    }

    fn verify_tls12_signature(&self, message: &[u8], cert: &CertificateDer<'_>, dss: &DigitallySignedStruct) -> Result<HandshakeSignatureValid, Error> {
        verify_tls12_signature(message, cert, dss, &self.provider.signature_verification_algorithms)
    }

    fn verify_tls13_signature(&self, message: &[u8], cert: &CertificateDer<'_>, dss: &DigitallySignedStruct) -> Result<HandshakeSignatureValid, Error> {
        verify_tls13_signature(message, cert, dss, &self.provider.signature_verification_algorithms)
    }

    fn supported_verify_schemes(&self) -> Vec<SignatureScheme> {
        self.provider.signature_verification_algorithms.supported_schemes()
    }
}

/// Client TLS settings that trust only the PC with this fingerprint.
pub fn pinned_client_config(fingerprint: &str) -> Result<Arc<ClientConfig>, String> {
    let p = provider();
    let cfg = ClientConfig::builder_with_provider(p.clone())
        .with_safe_default_protocol_versions()
        .map_err(|e| e.to_string())?
        .dangerous()
        .with_custom_certificate_verifier(Arc::new(PinnedVerifier { fingerprint: fingerprint.to_ascii_lowercase(), provider: p }))
        .with_no_client_auth();
    Ok(Arc::new(cfg))
}
