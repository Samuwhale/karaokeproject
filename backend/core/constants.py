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
    strength: str
    description: str
    model_filename: str
    quality_tier: int
    speed_tier: int


CUSTOM_PRESET_KEY = "custom"


PRESET_DEFINITIONS = (
    PresetDefinition(
        key="preview",
        label="Preview",
        strength="Fastest",
        description="Quick triage pass. Use to check whether a track is worth a full render.",
        model_filename="UVR_MDXNET_KARA_2.onnx",
        quality_tier=0,
        speed_tier=3,
    ),
    PresetDefinition(
        key="standard",
        label="Standard",
        strength="Balanced default",
        description="Clean enough for most modern pop, rock, and electronic tracks.",
        model_filename="model_bs_roformer_ep_317_sdr_12.9755.ckpt",
        quality_tier=1,
        speed_tier=2,
    ),
    PresetDefinition(
        key="high",
        label="High",
        strength="Less vocal bleed",
        description="Slower. Try this when Standard leaves audible vocals in the instrumental on busy mixes.",
        model_filename="model_bs_roformer_ep_368_sdr_12.9628.ckpt",
        quality_tier=2,
        speed_tier=1,
    ),
    PresetDefinition(
        key="vocal-focus",
        label="Vocal focus",
        strength="Cleaner vocals",
        description="Prioritises vocal clarity over instrumental cleanliness. Good when the vocal is the keeper stem.",
        model_filename="mel_band_roformer_vocals_fv4_gabox.ckpt",
        quality_tier=2,
        speed_tier=1,
    ),
)


PRESET_LOOKUP = {preset.key: preset for preset in PRESET_DEFINITIONS}


DEFAULT_PRESET_KEY = "standard"


MODEL_FILENAME_SUFFIXES = (".ckpt", ".onnx", ".pth")


def next_quality_tier(profile_key: str) -> PresetDefinition | None:
    current = PRESET_LOOKUP.get(profile_key)
    if current is None:
        return None
    higher = [preset for preset in PRESET_DEFINITIONS if preset.quality_tier > current.quality_tier]
    if not higher:
        return None
    return min(higher, key=lambda preset: preset.quality_tier)


def alternative_presets(profile_key: str) -> list[PresetDefinition]:
    """Curated presets the user might switch to after a disappointing run.

    Returns presets with quality tier >= the current preset, excluding the current
    preset itself. Sorted by quality tier ascending, then label alphabetically so
    peers are grouped predictably.
    """
    current = PRESET_LOOKUP.get(profile_key)
    threshold = current.quality_tier if current is not None else 0
    candidates = [
        preset
        for preset in PRESET_DEFINITIONS
        if preset.key != profile_key and preset.quality_tier >= threshold
    ]
    return sorted(candidates, key=lambda preset: (preset.quality_tier, preset.label))
