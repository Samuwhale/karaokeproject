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
    best_for: str
    tradeoff: str
    rerun_reason: str
    model_filename: str
    quality_tier: int
    speed_tier: int
    stems: tuple[str, ...]


CUSTOM_PRESET_KEY = "custom"


_VOCAL_INSTRUMENTAL_STEMS: tuple[str, ...] = ("vocals", "instrumental")


PRESET_DEFINITIONS = (
    PresetDefinition(
        key="preview",
        label="Preview",
        strength="Fastest",
        best_for="Deciding whether a track is worth a full render.",
        tradeoff="Lower separation quality. Vocal bleed and artefacts are expected.",
        rerun_reason="Just want a quick triage pass before committing to a slower model.",
        model_filename="UVR_MDXNET_KARA_2.onnx",
        quality_tier=0,
        speed_tier=3,
        stems=_VOCAL_INSTRUMENTAL_STEMS,
    ),
    PresetDefinition(
        key="standard",
        label="Standard",
        strength="Balanced default",
        best_for="Most modern pop, rock, and electronic tracks.",
        tradeoff="Not always clean on dense mixes with heavy vocal layering.",
        rerun_reason="Balanced starting point when you are not sure what the track needs.",
        model_filename="model_bs_roformer_ep_317_sdr_12.9755.ckpt",
        quality_tier=1,
        speed_tier=2,
        stems=_VOCAL_INSTRUMENTAL_STEMS,
    ),
    PresetDefinition(
        key="high",
        label="High",
        strength="Less vocal bleed",
        best_for="Busy mixes where Standard leaves vocals bleeding into the instrumental.",
        tradeoff="Noticeably slower to render than Standard.",
        rerun_reason="Vocals are still audible in the instrumental.",
        model_filename="model_bs_roformer_ep_368_sdr_12.9628.ckpt",
        quality_tier=2,
        speed_tier=1,
        stems=_VOCAL_INSTRUMENTAL_STEMS,
    ),
    PresetDefinition(
        key="vocal-focus",
        label="Vocal focus",
        strength="Cleaner vocals",
        best_for="Isolating a clean vocal when the vocal is the keeper stem.",
        tradeoff="The instrumental may sound rougher than with High.",
        rerun_reason="Vocals sound muddy, thin, or coloured on the previous run.",
        model_filename="mel_band_roformer_vocals_fv4_gabox.ckpt",
        quality_tier=2,
        speed_tier=1,
        stems=_VOCAL_INSTRUMENTAL_STEMS,
    ),
)


PRESET_LOOKUP = {preset.key: preset for preset in PRESET_DEFINITIONS}


# "standard" is the default because its quality/speed balance fits most imports
# without the user having to think. Change deliberately — it ships as the starting
# point for every new track until the user picks something else.
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
