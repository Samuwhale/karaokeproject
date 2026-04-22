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


CUSTOM_PROFILE_KEY = "custom"


_VOCAL_INSTRUMENTAL_STEMS: tuple[str, ...] = ("vocals", "instrumental")
_FOUR_STEM_STEMS: tuple[str, ...] = ("vocals", "drums", "bass", "other")
_KARAOKE_STEMS: tuple[str, ...] = ("lead_vocals", "backing_vocals", "instrumental")


PROFILE_DEFINITIONS: tuple[ProfileDefinition, ...] = (
    ProfileDefinition(
        key="preview",
        label="Preview",
        strength="Fastest",
        best_for="Quick triage — is this track worth a full render?",
        tradeoff="Vocal bleed and artefacts are expected.",
        model_filename="UVR_MDXNET_KARA_2.onnx",
        stems=_VOCAL_INSTRUMENTAL_STEMS,
    ),
    ProfileDefinition(
        key="standard",
        label="Standard",
        strength="Balanced default",
        best_for="Most pop, rock, and electronic tracks.",
        tradeoff="Not always clean on dense mixes with heavy vocal layering.",
        model_filename="model_bs_roformer_ep_317_sdr_12.9755.ckpt",
        stems=_VOCAL_INSTRUMENTAL_STEMS,
    ),
    ProfileDefinition(
        key="high",
        label="High",
        strength="Cleaner split",
        best_for="Busy mixes where Standard leaves vocals bleeding.",
        tradeoff="Noticeably slower.",
        model_filename="model_bs_roformer_ep_368_sdr_12.9628.ckpt",
        stems=_VOCAL_INSTRUMENTAL_STEMS,
    ),
    ProfileDefinition(
        key="full-stems",
        label="Full stems",
        strength="Four-stem split",
        best_for="Isolating or turning down drums, bass, or other instruments.",
        tradeoff="Vocals are slightly less clean than a dedicated vocal model.",
        model_filename="htdemucs_ft.yaml",
        stems=_FOUR_STEM_STEMS,
    ),
    ProfileDefinition(
        key="karaoke-stems",
        label="Karaoke stems",
        strength="Lead + backing vocals split",
        best_for="Keeping backing vocals in the mix, or isolating just the lead.",
        tradeoff="Runs two models back-to-back — roughly twice as slow as Standard.",
        # Chained pipeline: Standard (bs_roformer) isolates vocals from the
        # mix, then UVR-BVE-4B splits that vocal stem into lead + backing.
        # Final output: {instrumental (from Standard), lead_vocals, backing_vocals}.
        model_filename="model_bs_roformer_ep_317_sdr_12.9755.ckpt",
        stems=_KARAOKE_STEMS,
        followup=FollowupDefinition(
            input_stem="vocals",
            model_filename="UVR-BVE-4B_SN-44100-2.pth",
        ),
    ),
)


PROFILE_LOOKUP: dict[str, ProfileDefinition] = {
    profile.key: profile for profile in PROFILE_DEFINITIONS
}


# Standard is the default because its quality/speed balance fits most imports
# without the user having to think. Change deliberately — it is the starting
# point for every new track until the user picks something else.
DEFAULT_PROFILE_KEY = "standard"


MODEL_FILENAME_SUFFIXES = (".ckpt", ".onnx", ".pth", ".yaml", ".yml")
