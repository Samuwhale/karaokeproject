from pydantic import BaseModel


class CachedModelResponse(BaseModel):
    filename: str
    size_bytes: int
    is_preset: bool


class CachedModelsResponse(BaseModel):
    directory: str
    items: list[CachedModelResponse]
