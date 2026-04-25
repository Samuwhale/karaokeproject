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

STEM_QUALITY_KEYS = ("fast", "balanced")
DEFAULT_STEMS: tuple[str, ...] = ("instrumental", "vocals")
DEFAULT_QUALITY = "balanced"

PUBLIC_STEMS: tuple[str, ...] = (
    "instrumental",
    "vocals",
    "lead_vocals",
    "backing_vocals",
    "drums",
    "bass",
    "other",
)


@dataclass(frozen=True)
class StemOptionDefinition:
    name: str
    label: str


@dataclass(frozen=True)
class QualityOptionDefinition:
    key: str
    label: str


@dataclass(frozen=True)
class FollowupDefinition:
    input_stem: str
    model_filename: str


@dataclass(frozen=True)
class PipelineStepDefinition:
    key: str
    model_filename: str
    source_stem: str | None = None


@dataclass(frozen=True)
class PipelineDefinition:
    key: str
    quality: str
    steps: tuple[PipelineStepDefinition, ...]
    generated_stems: tuple[str, ...]


STEM_OPTIONS: tuple[StemOptionDefinition, ...] = (
    StemOptionDefinition("instrumental", "Instrumental"),
    StemOptionDefinition("vocals", "Vocals"),
    StemOptionDefinition("lead_vocals", "Lead vocals"),
    StemOptionDefinition("backing_vocals", "Backing vocals"),
    StemOptionDefinition("drums", "Drums"),
    StemOptionDefinition("bass", "Bass"),
    StemOptionDefinition("other", "Other"),
)

QUALITY_OPTIONS: tuple[QualityOptionDefinition, ...] = (
    QualityOptionDefinition("fast", "Fast"),
    QualityOptionDefinition("balanced", "Balanced"),
)

_VOCAL_FAST_MODEL = "model_bs_roformer_ep_317_sdr_12.9755.ckpt"
_VOCAL_BALANCED_MODEL = "model_bs_roformer_ep_368_sdr_12.9628.ckpt"
_FULL_STEMS_MODEL = "htdemucs_ft.yaml"
_VOCAL_DETAIL_MODEL = "UVR-BVE-4B_SN-44100-2.pth"

_BAND_STEMS: frozenset[str] = frozenset({"drums", "bass", "other"})
_VOCAL_STEMS: tuple[str, ...] = ("instrumental", "vocals")
_FULL_STEMS: tuple[str, ...] = ("vocals", "drums", "bass", "other")
_VOCAL_DETAIL_STEMS: tuple[str, ...] = ("lead_vocals", "backing_vocals")


def _vocal_model_for_quality(quality: str) -> str:
    if quality == "fast":
        return _VOCAL_FAST_MODEL
    return _VOCAL_BALANCED_MODEL


def build_pipeline_definition(
    *,
    requested_stems: tuple[str, ...],
    quality: str,
) -> PipelineDefinition:
    requested = set(requested_stems)
    selected_band_stems = requested & _BAND_STEMS
    if "instrumental" in requested and selected_band_stems:
        blocked = ", ".join(stem for stem in PUBLIC_STEMS if stem in selected_band_stems)
        raise ValueError(
            f"Instrumental already contains {blocked}. Choose instrumental/vocal outputs or band stems, not both."
        )

    wants_band_stems = bool(selected_band_stems)
    wants_vocal_detail = bool(requested & {"lead_vocals", "backing_vocals"})
    wants_vocal_route = bool(requested & {"instrumental", "vocals", "lead_vocals", "backing_vocals"})

    steps: list[PipelineStepDefinition] = []
    generated: set[str] = set()

    if wants_band_stems:
        steps.append(
            PipelineStepDefinition(
                key="band-stems",
                model_filename=_FULL_STEMS_MODEL,
            )
        )
        generated.update(_FULL_STEMS)

    if wants_vocal_route:
        steps.append(
            PipelineStepDefinition(
                key="vocal-instrumental",
                model_filename=_vocal_model_for_quality(quality),
            )
        )
        generated.update(_VOCAL_STEMS)

    if wants_vocal_detail:
        steps.append(
            PipelineStepDefinition(
                key="vocal-detail",
                model_filename=_VOCAL_DETAIL_MODEL,
                source_stem="vocals",
            )
        )
        generated.update(_VOCAL_DETAIL_STEMS)

    if not steps:
        raise ValueError("Choose at least one stem.")

    key = "+".join(step.key for step in steps)
    return PipelineDefinition(
        key=f"{key}:{quality}",
        quality=quality,
        steps=tuple(steps),
        generated_stems=tuple(stem for stem in PUBLIC_STEMS if stem in generated),
    )
