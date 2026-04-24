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
class FollowupDefinition:
    """A second separation pass run on one of the primary model's stems.

    The worker picks the primary stem whose canonical name matches `input_stem`
    (e.g. "vocals"), feeds its WAV into the followup model, and replaces that
    primary stem with the followup's outputs in the final stem map. See
    workers/processor.py for the merge.
    """
    input_stem: str
    model_filename: str


@dataclass(frozen=True)
class ProfileDefinition:
    key: str
    label: str
    strength: str
    best_for: str
    tradeoff: str
    model_filename: str
    stems: tuple[str, ...]
    followup: FollowupDefinition | None = None


_VOCAL_INSTRUMENTAL_STEMS: tuple[str, ...] = ("vocals", "instrumental")
_FOUR_STEM_STEMS: tuple[str, ...] = ("vocals", "drums", "bass", "other")
_VOCAL_SPLIT_STEMS: tuple[str, ...] = ("lead_vocals", "backing_vocals", "instrumental")


PROFILE_DEFINITIONS: tuple[ProfileDefinition, ...] = (
    ProfileDefinition(
        key="karaoke",
        label="Karaoke",
        strength="Vocals + instrumental",
        best_for="Clean vocal removal when you want a straight karaoke or instrumental mix.",
        tradeoff="Use Full stems if you need separate drums, bass, or other instruments.",
        model_filename="model_bs_roformer_ep_368_sdr_12.9628.ckpt",
        stems=_VOCAL_INSTRUMENTAL_STEMS,
    ),
    ProfileDefinition(
        key="full-stems",
        label="Full stems",
        strength="Vocals + drums + bass + other",
        best_for="Turning specific instruments up or down without collapsing everything into one instrumental stem.",
        tradeoff="Vocals are usually less isolated than Karaoke because the split is more granular.",
        model_filename="htdemucs_ft.yaml",
        stems=_FOUR_STEM_STEMS,
    ),
    ProfileDefinition(
        key="vocal-split",
        label="Lead vocal split",
        strength="Lead + backing vocals + instrumental",
        best_for="Keeping backing vocals in while reducing or removing only the lead vocal.",
        tradeoff="Runs a second vocal-only split after Karaoke, so it is the slowest option.",
        # Chained pipeline: Karaoke (bs_roformer) isolates vocals from the
        # mix, then UVR-BVE-4B splits that vocal stem into lead + backing.
        # Final output: {instrumental (from Karaoke), lead_vocals, backing_vocals}.
        model_filename="model_bs_roformer_ep_368_sdr_12.9628.ckpt",
        stems=_VOCAL_SPLIT_STEMS,
        followup=FollowupDefinition(
            input_stem="vocals",
            model_filename="UVR-BVE-4B_SN-44100-2.pth",
        ),
    ),
)


PROFILE_LOOKUP: dict[str, ProfileDefinition] = {
    profile.key: profile for profile in PROFILE_DEFINITIONS
}


DEFAULT_PROFILE_KEY = "karaoke"


PROFILE_KEY_ALIASES: dict[str, str] = {
    "fast-preview": "karaoke",
    "preview": "karaoke",
    "balanced": "karaoke",
    "standard": "karaoke",
    "clean-instrumental": "karaoke",
    "high": "karaoke",
    "maximum": "karaoke",
    "vocal-focus": "karaoke",
    "karaoke-stems": "vocal-split",
}


def resolve_profile_key(profile_key: str | None) -> str:
    cleaned = (profile_key or "").strip()
    if not cleaned:
        return DEFAULT_PROFILE_KEY
    return PROFILE_KEY_ALIASES.get(cleaned, cleaned)
