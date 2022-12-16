use base64::engine::fast_portable::{FastPortable, FastPortableConfig};

/// URL_SAFE_NO_PAD encodes to a url-safe value with no padding.
pub(crate) const URL_SAFE_NO_PAD: FastPortable = FastPortable::from(
    &base64::alphabet::URL_SAFE,
    FastPortableConfig::new().with_encode_padding(false),
);
