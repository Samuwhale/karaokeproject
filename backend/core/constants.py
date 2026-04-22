from dataclasses import dataclass


SUPPORTED_IMPORT_EXTENSIONS = {
    ".aac",
    ".aif",
    ".aiff",
    ".flac",
    ".m4a",
    ".mkv",
    ".mov",
    ".mp3",
    ".mp4",
    ".ogg",
    ".wav",
    ".webm",
}


@dataclass(frozen=True)
class PresetDefinition:
    key: str
    label: str
    description: str
    model_filename: str
    quality_tier: int


PRESET_DEFINITIONS = (
    PresetDefinition(
        key="preview",
        label="Preview",
        description="Fastest pass — use for triage or a quick check before committing to a full render.",
        model_filename="UVR_MDXNET_KARA_2.onnx",
        quality_tier=0,
    ),
    PresetDefinition(
        key="standard",
        label="Standard",
        description="Balanced speed and quality. Good default for most tracks.",
        model_filename="model_bs_roformer_ep_317_sdr_12.9755.ckpt",
        quality_tier=1,
    ),
    PresetDefinition(
        key="maximum",
        label="Maximum",
        description="Slowest and cleanest. Use when Standard leaves too much bleed on the instrumental.",
        model_filename="model_bs_roformer_ep_368_sdr_12.9628.ckpt",
        quality_tier=2,
    ),
)


PRESET_LOOKUP = {preset.key: preset for preset in PRESET_DEFINITIONS}


DEFAULT_PRESET_KEY = "standard"


def next_quality_tier(profile_key: str) -> PresetDefinition | None:
    current = PRESET_LOOKUP.get(profile_key)
    if current is None:
        return None
    higher = [preset for preset in PRESET_DEFINITIONS if preset.quality_tier > current.quality_tier]
    if not higher:
        return None
    return min(higher, key=lambda preset: preset.quality_tier)
