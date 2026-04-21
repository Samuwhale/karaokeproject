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


PRESET_DEFINITIONS = (
    PresetDefinition(
        key="fast-preview",
        label="Fast Preview",
        description="Faster turnaround for quick validation and batch triage.",
        model_filename="UVR_MDXNET_KARA_2.onnx",
    ),
    PresetDefinition(
        key="balanced",
        label="Balanced",
        description="Default karaoke workflow balancing speed and stem quality.",
        model_filename="model_bs_roformer_ep_317_sdr_12.9755.ckpt",
    ),
    PresetDefinition(
        key="clean-instrumental",
        label="Clean Instrumental",
        description="Highest-priority instrumental cleanup with slower processing.",
        model_filename="model_bs_roformer_ep_368_sdr_12.9628.ckpt",
    ),
)


PRESET_LOOKUP = {preset.key: preset for preset in PRESET_DEFINITIONS}
